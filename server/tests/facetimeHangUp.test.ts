// Hanging up for certain: the room-service token, the DeleteRoom request to LiveKit held to its documented shape
// (against a fake fetch, never a real project), the one retry, the hang up route, and the rule that a POST to any
// FaceTime route must be JSON.
import { createHmac } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { LivekitConfig } from "../lib/facetimeEnv";
import { DELETE_RETRY_MS, DELETE_ROOM_PATH, ROOM_SERVICE_TTL_S, deleteRoom, deleteRoomRequest, roomServiceUrl } from "../lib/facetimeRooms";
import { mintRoomServiceToken, mintToken, readRoomServiceToken, readToken } from "../lib/facetimeToken";
import { ROOM_MEMORY_S, registerFaceTime } from "../routes/facetime";

// Made-up values: none of these is a real key, project, line or phone.
const LIVEKIT = { LIVEKIT_URL: "wss://rooms.example.test", LIVEKIT_API_KEY: "lk-test-key", LIVEKIT_API_SECRET: "lk-test-secret-not-real" };
const CHERT = { CHERT_API_KEY: "chert-test-key-not-real", CHERT_PROJECT_ID: "project-test", CHERT_LINE_ID: "00000000-0000-4000-8000-000000000001" };
const config: LivekitConfig = { livekitUrl: LIVEKIT.LIVEKIT_URL, livekitKey: LIVEKIT.LIVEKIT_API_KEY, livekitSecret: LIVEKIT.LIVEKIT_API_SECRET };
const ROOM = "odyssey-dojo-0123456789ab";
const NOW_MS = 1_800_000_000_000;
const DELETE_URL = "https://rooms.example.test/twirp/livekit.RoomService/DeleteRoom";
const status = (code: number, body: unknown = {}): Response => new Response(JSON.stringify(body), { status: code, headers: { "Content-Type": "application/json" } });
const bearer = (init: RequestInit | undefined): string => ((init?.headers ?? {}) as Record<string, string>).Authorization?.replace(/^Bearer /, "") ?? "";

describe("the room-service token", () => {
  const request = { apiKey: "lk-test-key", apiSecret: "lk-test-secret-not-real", ttlSeconds: 60, nowSeconds: 1_800_000_000 };
  const token = mintRoomServiceToken(request);

  test("is an HS256 JWT whose only grant is roomCreate: no room, no identity, no right to join", () => {
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header ?? "", "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" });
    expect(signature).toBe(createHmac("sha256", request.apiSecret).update(`${header ?? ""}.${payload ?? ""}`).digest("base64url"));
    expect(JSON.parse(Buffer.from(payload ?? "", "base64url").toString())).toEqual({
      iss: "lk-test-key", nbf: 1_800_000_000 - 10, exp: 1_800_000_000 + 60, video: { roomCreate: true },
    });
    expect(readRoomServiceToken(token, request.apiSecret)).toEqual({ iss: "lk-test-key", nbf: 1_800_000_000 - 10, exp: 1_800_000_000 + 60, video: { roomCreate: true } });
    expect(token).not.toContain(request.apiSecret);
    expect(Buffer.from(payload ?? "", "base64url").toString()).not.toContain(request.apiSecret);
  });

  test("a wrong secret does not verify, and a join token is not a room-service token", () => {
    expect(readRoomServiceToken(token, "another-secret")).toBeNull();
    const join = mintToken({ ...request, identity: "odyssey-dojo", room: ROOM });
    expect(readRoomServiceToken(join, request.apiSecret)).toBeNull();
    // And the other way round: the room-service token names no room to join.
    expect(readToken(token, request.apiSecret)).not.toHaveProperty("video.roomJoin");
    expect(readToken(join, request.apiSecret)).not.toHaveProperty("video.roomCreate");
  });
});

describe("the request that closes a room", () => {
  test.each([
    ["wss://rooms.example.test", "https://rooms.example.test"],
    ["wss://rooms.example.test/", "https://rooms.example.test"],
    ["  wss://rooms.example.test:7443  ", "https://rooms.example.test:7443"],
    ["https://rooms.example.test", "https://rooms.example.test"],
    ["ws://localhost:7880", "http://localhost:7880"],
    ["http://localhost:7880/", "http://localhost:7880"],
    ["WSS://Rooms.Example.Test", "https://rooms.example.test"],
  ])("the room address %j gives the room service at %s", (from, to) => {
    expect(roomServiceUrl(from)).toBe(to);
  });

  test.each(["", "rooms.example.test", "ftp://rooms.example.test", "not a url"])("%j is no room address", (from) => {
    expect(roomServiceUrl(from)).toBeNull();
    expect(deleteRoomRequest({ ...config, livekitUrl: from }, ROOM, 1_800_000_000)).toBeNull();
  });

  test("is LiveKit's DeleteRoom: a Twirp POST with the room's name and a roomCreate token", () => {
    const request = deleteRoomRequest(config, ROOM, 1_800_000_000);
    expect(DELETE_ROOM_PATH).toBe("/twirp/livekit.RoomService/DeleteRoom");
    expect(request?.url).toBe(DELETE_URL);
    expect(request?.init.method).toBe("POST");
    expect(Object.keys(request?.init.headers ?? {}).sort()).toEqual(["Authorization", "Content-Type"]);
    expect(request?.init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(request?.init.body ?? "")).toEqual({ room: ROOM });
    const claims = readRoomServiceToken(bearer(request?.init), config.livekitSecret);
    expect(claims).toEqual({ iss: config.livekitKey, nbf: 1_800_000_000 - 10, exp: 1_800_000_000 + ROOM_SERVICE_TTL_S, video: { roomCreate: true } });
    // The secret signs the token and goes nowhere.
    expect(JSON.stringify(request)).not.toContain(config.livekitSecret);
  });

  function fake(answers: readonly (number | Error)[]) {
    const sent: { url: string; init: RequestInit }[] = [];
    const waits: number[] = [];
    let now = NOW_MS;
    const deps = {
      fetch: (url: string, init: RequestInit): Promise<Response> => {
        sent.push({ url, init });
        const next = answers[sent.length - 1] ?? 500;
        return typeof next === "number" ? Promise.resolve(status(next)) : Promise.reject(next);
      },
      now: () => now,
      wait: (ms: number): Promise<void> => { waits.push(ms); now += ms; return Promise.resolve(); },
    };
    return { deps, sent, waits };
  }

  test("a 200 is a closed room, asked once", async () => {
    const { deps, sent, waits } = fake([200]);
    expect(await deleteRoom(deps, config, ROOM)).toEqual({ ok: true, room: "deleted", tries: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(DELETE_URL);
    expect(sent[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(sent[0]?.init.body))).toEqual({ room: ROOM });
    expect(sent[0]?.init.signal).toBeInstanceOf(AbortSignal);
    expect(readRoomServiceToken(bearer(sent[0]?.init), config.livekitSecret)?.video).toEqual({ roomCreate: true });
    expect(waits).toEqual([]);
  });

  test("a 404 is tried once more after a short wait, and no more than once", async () => {
    const late = fake([404, 200]);
    expect(await deleteRoom(late.deps, config, ROOM)).toEqual({ ok: true, room: "deleted", tries: 2 });
    expect(late.sent.map((each) => each.url)).toEqual([DELETE_URL, DELETE_URL]);
    expect(late.waits).toEqual([DELETE_RETRY_MS]);
    expect(DELETE_RETRY_MS).toBeGreaterThanOrEqual(500);
    expect(DELETE_RETRY_MS).toBeLessThanOrEqual(2000);

    const gone = fake([404, 404, 200]);
    expect(await deleteRoom(gone.deps, config, ROOM)).toEqual({ ok: true, room: "gone", tries: 2 });
    expect(gone.sent).toHaveLength(2);
    expect(gone.waits).toEqual([DELETE_RETRY_MS]);
  });

  test("any other answer and no network are failures that are not retried and carry nothing of the request", async () => {
    for (const code of [401, 403, 500, 503]) {
      const refused = fake([code, 200]);
      expect(await deleteRoom(refused.deps, config, ROOM)).toEqual({ ok: false, why: "service", status: code });
      expect(refused.sent).toHaveLength(1);
      expect(refused.waits).toEqual([]);
    }
    const down = fake([new TypeError(`fetch failed for ${config.livekitSecret}`)]);
    const closed = await deleteRoom(down.deps, config, ROOM);
    expect(closed).toEqual({ ok: false, why: "network", status: 0 });
    expect(JSON.stringify(closed)).not.toContain(config.livekitSecret);
    const odd = fake([200]);
    expect(await deleteRoom(odd.deps, { ...config, livekitUrl: "rooms" }, ROOM)).toEqual({ ok: false, why: "service", status: 0 });
    expect(odd.sent).toEqual([]);
  });
});

describe("the hang up route", () => {
  let server: Server | null = null;
  afterEach(() => {
    server?.close();
    server?.closeAllConnections();
    server = null;
    vi.restoreAllMocks();
  });

  interface Sent { readonly url: string; readonly init: RequestInit }
  async function serve(env: Record<string, string | undefined>, livekit: readonly (number | Error)[] = [200]) {
    const sent: Sent[] = [];
    const rooms: Sent[] = [];
    const waits: number[] = [];
    let now = NOW_MS;
    const app = express();
    app.use(express.json());
    const router = express.Router();
    registerFaceTime(router, {
      env: () => env,
      fetch: (url, init) => {
        sent.push({ url, init });
        if (!url.includes("/twirp/")) return Promise.resolve(status(201, { id: "call-1" }));
        rooms.push({ url, init });
        const next = livekit[rooms.length - 1] ?? 500;
        // LiveKit's own words are never passed on: this body must not reach the page.
        return typeof next === "number" ? Promise.resolve(status(next, { code: "not_found", msg: `livekit says ${LIVEKIT.LIVEKIT_API_KEY}` })) : Promise.reject(next);
      },
      now: () => now,
      wait: (ms) => { waits.push(ms); return Promise.resolve(); },
    });
    app.use(router);
    const listening = app.listen(0, "127.0.0.1");
    await once(listening, "listening");
    server = listening;
    const { port } = listening.address() as AddressInfo;
    const base = `http://127.0.0.1:${String(port)}`;
    const ask = async (path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown>; text: string }> => {
      const response = await fetch(`${base}${path}`, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const text = await response.text();
      return { status: response.status, body: JSON.parse(text) as Record<string, unknown>, text };
    };
    const seat = async (): Promise<string> => String((await ask("/api/facetime/seat", {})).body.room);
    return { ask, seat, base, sent, rooms, waits, later: (ms: number) => { now += ms; } };
  }

  /** Everything the server wrote to its log during a test, as one string. */
  function logged(): () => string {
    const lines: string[] = [];
    for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation((...parts: unknown[]) => { lines.push(parts.map(String).join(" ")); });
    return () => lines.join("\n");
  }
  const SECRETS = [LIVEKIT.LIVEKIT_API_SECRET, LIVEKIT.LIVEKIT_API_KEY, CHERT.CHERT_API_KEY];

  test("after a stand-in went into a room, hang up deletes that room at LiveKit with a roomCreate token", async () => {
    const log = logged();
    const { ask, seat, rooms, sent } = await serve(LIVEKIT);
    const room = await seat();
    expect((await ask("/api/facetime/standin", { room })).status).toBe(200);
    const hung = await ask("/api/facetime/hangup", { room });
    expect(hung).toMatchObject({ status: 200, body: { room: "deleted" } });
    expect(sent).toHaveLength(1);
    expect(rooms[0]?.url).toBe(DELETE_URL);
    expect(rooms[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(rooms[0]?.init.body))).toEqual({ room });
    const token = bearer(rooms[0]?.init);
    expect(readRoomServiceToken(token, LIVEKIT.LIVEKIT_API_SECRET)).toEqual({
      iss: LIVEKIT.LIVEKIT_API_KEY, nbf: NOW_MS / 1000 - 10, exp: NOW_MS / 1000 + ROOM_SERVICE_TTL_S, video: { roomCreate: true },
    });
    // The page gets one word. No token, no key, nothing LiveKit said; the log gets no more.
    expect(Object.keys(hung.body)).toEqual(["room"]);
    for (const secret of [...SECRETS, token]) {
      expect(hung.text).not.toContain(secret);
      expect(log()).not.toContain(secret);
    }
    expect(log()).toContain("facetime_room_closed");
  });

  test("after a phone call went into a room, hang up closes it too, and a second hang up is answered the same way", async () => {
    const { ask, seat, rooms } = await serve({ ...LIVEKIT, ...CHERT }, [200, 404, 404]);
    const room = await seat();
    expect((await ask("/api/facetime/call", { to: "+15555550100", room })).status).toBe(200);
    expect(await ask("/api/facetime/hangup", { room })).toMatchObject({ status: 200, body: { room: "deleted" } });
    // The page closing just after: LiveKit knows no such room now, which is what was wanted.
    expect(await ask("/api/facetime/hangup", { room })).toMatchObject({ status: 200, body: { room: "gone" } });
    expect(rooms).toHaveLength(3);
    expect(rooms.every((each) => each.url === DELETE_URL)).toBe(true);
  });

  test("a 404 just after the join is tried once more", async () => {
    const { ask, seat, rooms, waits } = await serve(LIVEKIT, [404, 200]);
    const room = await seat();
    await ask("/api/facetime/standin", { room });
    expect(await ask("/api/facetime/hangup", { room })).toMatchObject({ status: 200, body: { room: "deleted" } });
    expect(rooms).toHaveLength(2);
    expect(waits).toEqual([DELETE_RETRY_MS]);
    // A new token for the second try, for the same room.
    expect(JSON.parse(String(rooms[1]?.init.body))).toEqual({ room });
    expect(readRoomServiceToken(bearer(rooms[1]?.init), LIVEKIT.LIVEKIT_API_SECRET)?.video).toEqual({ roomCreate: true });
  });

  test("only a room this server put a call or a stand-in into is closed: LiveKit is not asked about any other", async () => {
    const { ask, seat, rooms, later } = await serve(LIVEKIT);
    const unknown = { status: 400, body: { error: "service", message: "That call room is not known." } };
    expect(await ask("/api/facetime/hangup", { room: "odyssey-dojo-ffffffffffff" })).toMatchObject(unknown);
    expect(await ask("/api/facetime/hangup", { room: "someone-elses-room" })).toMatchObject(unknown);
    expect(await ask("/api/facetime/hangup", { room: "../../etc" })).toMatchObject(unknown);
    expect(await ask("/api/facetime/hangup", { room: 7 })).toMatchObject(unknown);
    expect(await ask("/api/facetime/hangup", {})).toMatchObject(unknown);
    // A seat nobody was put into: the game is alone in that room and it closes when the game leaves.
    const unused = await seat();
    expect(await ask("/api/facetime/hangup", { room: unused })).toMatchObject(unknown);
    // A room from long ago is forgotten.
    const old = await seat();
    await ask("/api/facetime/standin", { room: old });
    later(ROOM_MEMORY_S * 1000 + 1);
    expect(await ask("/api/facetime/hangup", { room: old })).toMatchObject(unknown);
    expect(rooms).toEqual([]);
    // A refused hang up did not use the unused seat up.
    const fresh = await seat();
    expect((await ask("/api/facetime/standin", { room: fresh })).status).toBe(200);
    expect((await ask("/api/facetime/hangup", { room: fresh })).status).toBe(200);
    expect(rooms).toHaveLength(1);
  });

  test("LiveKit refusing or being unreachable is a 502 in plain words, with no secret in the answer or the log", async () => {
    const log = logged();
    const refused = await serve(LIVEKIT, [401]);
    const room = await refused.seat();
    await refused.ask("/api/facetime/standin", { room });
    const answer = await refused.ask("/api/facetime/hangup", { room });
    expect(answer).toMatchObject({ status: 502, body: { error: "service" } });
    expect(String(answer.body.message)).toMatch(/^[A-Z].*\.$/);
    expect(refused.rooms).toHaveLength(1);
    const token = bearer(refused.rooms[0]?.init);
    server?.close();
    server?.closeAllConnections();

    const down = await serve(LIVEKIT, [new TypeError(`fetch failed: Bearer ${token} ${LIVEKIT.LIVEKIT_API_SECRET}`)]);
    const other = await down.seat();
    await down.ask("/api/facetime/standin", { room: other });
    const lost = await down.ask("/api/facetime/hangup", { room: other });
    expect(lost).toMatchObject({ status: 502, body: { error: "network" } });
    for (const secret of [...SECRETS, token, "livekit says"]) {
      expect(answer.text).not.toContain(secret);
      expect(lost.text).not.toContain(secret);
      expect(log()).not.toContain(secret);
    }
    expect(log()).toContain("facetime_room_not_closed");
  });

  test("without the room's settings there is nothing to close", async () => {
    const { ask, sent } = await serve(CHERT);
    expect(await ask("/api/facetime/hangup", { room: ROOM })).toMatchObject({ status: 503, body: { error: "not_set_up", missing: ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] } });
    expect(sent).toEqual([]);
  });

  test("a POST that is not JSON is refused on every FaceTime route, before anything is done", async () => {
    const { ask, seat, base, sent } = await serve({ ...LIVEKIT, ...CHERT });
    const room = await seat();
    const paths = ["/api/facetime/seat", "/api/facetime/call", "/api/facetime/standin", "/api/facetime/hangup", "/API/FaceTime/Seat"];
    // What a page of another site can send here without asking the browser first.
    const simple: readonly (Record<string, string> | undefined)[] = [
      { "Content-Type": "text/plain" }, { "Content-Type": "application/x-www-form-urlencoded" }, { "Content-Type": "multipart/form-data; boundary=x" },
      { "Content-Type": "application/jsonp" }, undefined,
    ];
    for (const path of paths) {
      for (const headers of simple) {
        const init: RequestInit = { method: "POST", body: JSON.stringify({ to: "+15555550100", room }) };
        if (headers) init.headers = headers;
        const response = await fetch(`${base}${path}`, init);
        expect(response.status, `${path} ${JSON.stringify(headers)}`).toBe(415);
        expect(await response.json()).toEqual({ error: "service", message: "Send JSON." });
      }
      // With no body at all, too.
      expect((await fetch(`${base}${path}`, { method: "POST" })).status, path).toBe(415);
    }
    expect(sent).toEqual([]);
    // None of those took a seat or used the room up: the real request still works, with or without a charset.
    expect((await fetch(`${base}/api/facetime/standin`, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ room }) })).status).toBe(200);
    expect((await ask("/api/facetime/seat", {})).status).toBe(200);
    // Reading is untouched.
    expect((await fetch(`${base}/api/facetime/status`)).status).toBe(200);
  });

  test("fifty text/plain posts no longer fill the seats", async () => {
    const { ask, base } = await serve(LIVEKIT);
    for (let i = 0; i < 55; i++) await fetch(`${base}/api/facetime/seat`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
    expect((await ask("/api/facetime/seat", {})).status).toBe(200);
  });
});
