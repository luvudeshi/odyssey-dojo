// The stand-in friend's server side: with the room's three settings and no call service, a seat can be opened and
// the bridge's place in it handed to a browser page on this machine. Nothing is ever sent to the call service.
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, test } from "vitest";
import { FACETIME_ENV, LIVEKIT_ENV, readLivekitEnv } from "../lib/facetimeEnv";
import { readToken } from "../lib/facetimeToken";
import { isOpenPath, isTunnelPath, mayAnswer } from "../lib/localOnly";
import { AGENT_IDENTITY, BRIDGE_IDENTITY, TOKEN_TTL_S, registerFaceTime } from "../routes/facetime";

// Made-up values: none of these is a real key, project, line or phone.
const LIVEKIT = { LIVEKIT_URL: "wss://rooms.example.test", LIVEKIT_API_KEY: "lk-test-key", LIVEKIT_API_SECRET: "lk-test-secret-not-real" };
const CHERT = { CHERT_API_KEY: "chert-test-key-not-real", CHERT_PROJECT_ID: "project-test", CHERT_LINE_ID: "00000000-0000-4000-8000-000000000001" };
const CHERT_NAMES = FACETIME_ENV.filter((name) => name.startsWith("CHERT_"));
const NOW_MS = 1_800_000_000_000;

describe("the room's settings on their own", () => {
  test("three names are enough for a room, and what is missing is told by name only", () => {
    expect(LIVEKIT_ENV).toEqual(["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]);
    expect(readLivekitEnv(LIVEKIT)).toEqual({ ready: true, config: { livekitUrl: LIVEKIT.LIVEKIT_URL, livekitKey: LIVEKIT.LIVEKIT_API_KEY, livekitSecret: LIVEKIT.LIVEKIT_API_SECRET } });
    expect(readLivekitEnv({ ...LIVEKIT, LIVEKIT_URL: ` ${LIVEKIT.LIVEKIT_URL}\n` })).toMatchObject({ ready: true, config: { livekitUrl: LIVEKIT.LIVEKIT_URL } });
    expect(readLivekitEnv({ ...CHERT, LIVEKIT_URL: LIVEKIT.LIVEKIT_URL, LIVEKIT_API_KEY: "  " })).toEqual({ ready: false, missing: ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] });
    expect(readLivekitEnv({})).toEqual({ ready: false, missing: [...LIVEKIT_ENV] });
  });
});

describe("the stand-in routes", () => {
  let server: Server | null = null;
  afterEach(() => {
    server?.close();
    server?.closeAllConnections();
    server = null;
  });

  async function serve(env: Record<string, string | undefined>) {
    const sent: string[] = [];
    let now = NOW_MS;
    const app = express();
    app.use(express.json());
    const router = express.Router();
    registerFaceTime(router, {
      env: () => env,
      fetch: (url) => { sent.push(url); return Promise.resolve(new Response(JSON.stringify({ id: "call-1" }), { status: 201, headers: { "Content-Type": "application/json" } })); },
      now: () => now,
    });
    app.use(router);
    const listening = app.listen(0, "127.0.0.1");
    await once(listening, "listening");
    server = listening;
    const { port } = listening.address() as AddressInfo;
    const ask = async (path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown>; text: string }> => {
      const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const text = await response.text();
      return { status: response.status, body: JSON.parse(text) as Record<string, unknown>, text };
    };
    return { ask, sent, later: (ms: number) => { now += ms; } };
  }

  test("status says a stand-in is possible when the room's settings are there, with names only", async () => {
    const roomOnly = await serve(LIVEKIT);
    const status = await roomOnly.ask("/api/facetime/status");
    expect(status.body).toEqual({ ready: false, missing: CHERT_NAMES, standIn: true });
    for (const value of Object.values(LIVEKIT)) expect(status.text).not.toContain(value);
    server?.close();
    server?.closeAllConnections();

    const both = await serve({ ...LIVEKIT, ...CHERT });
    expect((await both.ask("/api/facetime/status")).body).toEqual({ ready: true, missing: [], standIn: true });
    server?.close();
    server?.closeAllConnections();

    const chertOnly = await serve(CHERT);
    expect((await chertOnly.ask("/api/facetime/status")).body).toEqual({ ready: false, missing: [...LIVEKIT_ENV], standIn: false });
  });

  test("with the room's settings and no call service, a seat and the bridge's seat in the same room are given, and nobody is called", async () => {
    const { ask, sent } = await serve(LIVEKIT);
    const seat = await ask("/api/facetime/seat", {});
    expect(seat.status).toBe(200);
    expect(seat.body).toMatchObject({ url: LIVEKIT.LIVEKIT_URL, identity: AGENT_IDENTITY });
    const room = String(seat.body.room);
    expect(room).toMatch(/^odyssey-dojo-[0-9a-f]{12}$/);

    const friend = await ask("/api/facetime/standin", { room });
    expect(friend.status).toBe(200);
    expect(Object.keys(friend.body).sort()).toEqual(["identity", "room", "token", "url"]);
    expect(friend.body).toMatchObject({ url: LIVEKIT.LIVEKIT_URL, room, identity: BRIDGE_IDENTITY });

    const claims = readToken(String(friend.body.token), LIVEKIT.LIVEKIT_API_SECRET);
    expect(claims).toMatchObject({
      iss: LIVEKIT.LIVEKIT_API_KEY, sub: BRIDGE_IDENTITY, nbf: NOW_MS / 1000 - 10, exp: NOW_MS / 1000 + TOKEN_TTL_S,
      video: { room, roomJoin: true, canPublish: true, canSubscribe: true },
    });
    // Two seats in one room, two different people.
    const game = readToken(String(seat.body.token), LIVEKIT.LIVEKIT_API_SECRET);
    expect(game).toMatchObject({ sub: AGENT_IDENTITY, video: { room } });
    expect(friend.body.token).not.toBe(seat.body.token);
    // The secret stays on the server, and the call service was never asked.
    expect(friend.text).not.toContain(LIVEKIT.LIVEKIT_API_SECRET);
    expect(sent).toEqual([]);
  });

  test("a room is used once: no second stand-in, and never a stand-in and a phone in the same room", async () => {
    const { ask, sent } = await serve({ ...LIVEKIT, ...CHERT });
    const first = String((await ask("/api/facetime/seat", {})).body.room);
    expect((await ask("/api/facetime/standin", { room: first })).status).toBe(200);
    expect(await ask("/api/facetime/standin", { room: first })).toMatchObject({ status: 400, body: { error: "service" } });
    expect(await ask("/api/facetime/call", { to: "+15555550100", room: first })).toMatchObject({ status: 400, body: { error: "service" } });
    expect(sent).toEqual([]);

    const second = String((await ask("/api/facetime/seat", {})).body.room);
    expect((await ask("/api/facetime/call", { to: "+15555550100", room: second })).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(await ask("/api/facetime/standin", { room: second })).toMatchObject({ status: 400, body: { error: "service" } });
    expect(sent).toHaveLength(1);
  });

  test("an unknown room, a room of another shape, no room and a seat that has run out are refused", async () => {
    const { ask, later, sent } = await serve(LIVEKIT);
    expect(await ask("/api/facetime/standin", { room: "odyssey-dojo-ffffffffffff" })).toMatchObject({ status: 400, body: { error: "service" } });
    expect(await ask("/api/facetime/standin", { room: "../../etc" })).toMatchObject({ status: 400, body: { error: "service" } });
    expect(await ask("/api/facetime/standin", { room: 7 })).toMatchObject({ status: 400, body: { error: "service" } });
    expect(await ask("/api/facetime/standin", {})).toMatchObject({ status: 400, body: { error: "service" } });
    const old = String((await ask("/api/facetime/seat", {})).body.room);
    later(TOKEN_TTL_S * 1000 + 1);
    // Asking for a new seat sweeps the ones that ran out.
    const fresh = String((await ask("/api/facetime/seat", {})).body.room);
    expect(await ask("/api/facetime/standin", { room: old })).toMatchObject({ status: 400, body: { error: "service" } });
    expect((await ask("/api/facetime/standin", { room: fresh })).status).toBe(200);
    expect(sent).toEqual([]);
  });

  test("without the room's settings there is no stand-in, and ringing a phone still needs all six", async () => {
    const none = await serve(CHERT);
    expect(await none.ask("/api/facetime/standin", { room: "odyssey-dojo-0123456789ab" })).toEqual(expect.objectContaining({
      status: 503, body: { error: "not_set_up", message: "FaceTime is not set up on this server.", missing: [...LIVEKIT_ENV] },
    }));
    expect((await none.ask("/api/facetime/seat", {})).status).toBe(503);
    expect(none.sent).toEqual([]);
    server?.close();
    server?.closeAllConnections();

    const roomOnly = await serve(LIVEKIT);
    const room = String((await roomOnly.ask("/api/facetime/seat", {})).body.room);
    expect(await roomOnly.ask("/api/facetime/call", { to: "+15555550100", room })).toMatchObject({ status: 503, body: { error: "not_set_up", missing: CHERT_NAMES } });
    expect((await roomOnly.ask("/api/facetime/call/call-1")).status).toBe(503);
    // The refused call did not use the room up.
    expect((await roomOnly.ask("/api/facetime/standin", { room })).status).toBe(200);
    expect(roomOnly.sent).toEqual([]);
  });

  test("only this machine may ask: the path is not open to the network or to a tunnel", () => {
    for (const path of ["/api/facetime/standin", "/api/facetime/standin/", "/API/FaceTime/StandIn"]) {
      expect(isOpenPath(path.toLowerCase())).toBe(false);
      expect(isTunnelPath(path.toLowerCase())).toBe(false);
      expect(mayAnswer(path, "127.0.0.1")).toBe(true);
      expect(mayAnswer(path, "::1")).toBe(true);
      expect(mayAnswer(path, "192.168.1.20")).toBe(false);
      expect(mayAnswer(path, undefined)).toBe(false);
      expect(mayAnswer(path, "127.0.0.1", { "x-forwarded-for": "203.0.113.9" })).toBe(false);
      expect(mayAnswer(path, "127.0.0.1", { "cf-connecting-ip": "203.0.113.9" })).toBe(false);
    }
  });
});
