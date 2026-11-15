// The FaceTime call's server side with no account: the room token (signed here, checked here), the request to the
// call service held to its setup page, every refusal in plain words, and the routes over real HTTP with a fake Chert.
import { createHmac } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, test } from "vitest";
import { CHERT_CALLS, CHERT_MESSAGES, callRequest, callState, failureOf, placeCall, remoteState, stateRequest } from "../lib/facetimeChert";
import { FACETIME_ENV, NOT_SET_UP, readFaceTimeEnv } from "../lib/facetimeEnv";
import type { FaceTimeConfig } from "../lib/facetimeEnv";
import { mintToken, readToken } from "../lib/facetimeToken";
import { AGENT_IDENTITY, BRIDGE_IDENTITY, TOKEN_TTL_S, registerFaceTime } from "../routes/facetime";

// Made-up values: none of these is a real key, project, line or phone.
const ENV = {
  CHERT_API_KEY: "chert-test-key-not-real", CHERT_PROJECT_ID: "project-test", CHERT_LINE_ID: "00000000-0000-4000-8000-000000000001",
  LIVEKIT_URL: "wss://rooms.example.test", LIVEKIT_API_KEY: "lk-test-key", LIVEKIT_API_SECRET: "lk-test-secret-not-real",
};
const config: FaceTimeConfig = {
  chertKey: ENV.CHERT_API_KEY, chertProject: ENV.CHERT_PROJECT_ID, chertLine: ENV.CHERT_LINE_ID,
  livekitUrl: ENV.LIVEKIT_URL, livekitKey: ENV.LIVEKIT_API_KEY, livekitSecret: ENV.LIVEKIT_API_SECRET,
};
const PHONE = "+15555550100";
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("the room token", () => {
  const request = { apiKey: "lk-test-key", apiSecret: "lk-test-secret-not-real", identity: "odyssey-dojo", room: "odyssey-dojo-0123456789ab", ttlSeconds: 600, nowSeconds: 1_800_000_000 };
  const token = mintToken(request);

  test("is a three-part HS256 JWT whose signature verifies with the secret", () => {
    const [header, payload, signature] = token.split(".");
    expect(token.split(".")).toHaveLength(3);
    expect(JSON.parse(Buffer.from(header ?? "", "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" });
    // Checked by hand here, not with the code under test.
    const wanted = createHmac("sha256", request.apiSecret).update(`${header ?? ""}.${payload ?? ""}`).digest("base64url");
    expect(signature).toBe(wanted);
    expect(token).not.toMatch(/[+/=]/);
  });

  test("says who may join which room, and what they may do there", () => {
    const claims = readToken(token, request.apiSecret);
    expect(claims).toEqual({
      iss: "lk-test-key", sub: "odyssey-dojo", jti: "odyssey-dojo", nbf: 1_800_000_000 - 10, exp: 1_800_000_000 + 600,
      video: { room: "odyssey-dojo-0123456789ab", roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
    });
    expect(mintToken({ ...request, name: "Odyssey Dojo" })).not.toBe(token);
    expect(readToken(mintToken({ ...request, name: "Odyssey Dojo" }), request.apiSecret)?.name).toBe("Odyssey Dojo");
  });

  test("expires when asked, and the secret is not in it", () => {
    const claims = readToken(mintToken({ ...request, ttlSeconds: 30 }), request.apiSecret);
    expect((claims?.exp ?? 0) - request.nowSeconds).toBe(30);
    expect(token).not.toContain(request.apiSecret);
    expect(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).not.toContain(request.apiSecret);
  });

  test("a wrong secret, a changed room or a broken token does not verify", () => {
    expect(readToken(token, "another-secret")).toBeNull();
    const [header, payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...readToken(token, request.apiSecret), video: { room: "someone-elses-room", roomJoin: true } })).toString("base64url");
    expect(payload).not.toBe(forged);
    expect(readToken(`${header ?? ""}.${forged}.${signature ?? ""}`, request.apiSecret)).toBeNull();
    expect(readToken("not-a-token", request.apiSecret)).toBeNull();
    expect(readToken(`${token}.more`, request.apiSecret)).toBeNull();
    const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${payload ?? ""}`;
    expect(readToken(`${none}.${createHmac("sha256", request.apiSecret).update(none).digest("base64url")}`, request.apiSecret)).toBeNull();
  });
});

describe("the settings", () => {
  test("all six are needed, and what is missing is told by name only", () => {
    expect(readFaceTimeEnv(ENV)).toEqual({ ready: true, config });
    expect(readFaceTimeEnv({})).toEqual({ ready: false, missing: [...FACETIME_ENV] });
    expect(readFaceTimeEnv({ ...ENV, CHERT_LINE_ID: "  ", LIVEKIT_API_SECRET: undefined })).toEqual({ ready: false, missing: ["CHERT_LINE_ID", "LIVEKIT_API_SECRET"] });
    expect(readFaceTimeEnv({ ...ENV, CHERT_API_KEY: `  ${ENV.CHERT_API_KEY}\n` })).toEqual({ ready: true, config });
    expect(NOT_SET_UP).toBe("FaceTime is not set up on this server.");
  });
});

describe("the request to the call service", () => {
  const call = { to: PHONE, bridgeToken: "bridge-token", agentIdentity: "odyssey-dojo", idempotencyKey: "odyssey-dojo-test-key-1" };

  test("is the outbound call of the setup page: address, headers and body", () => {
    const request = callRequest(config, call);
    expect(request.url).toBe("https://app.trychert.com/api/v1/calls");
    expect(request.init.method).toBe("POST");
    expect(request.init.headers).toEqual({
      Authorization: "Bearer chert-test-key-not-real",
      "X-Chert-Project-Id": "project-test",
      "Content-Type": "application/json",
      "Idempotency-Key": "odyssey-dojo-test-key-1",
    });
    expect(JSON.parse(request.init.body ?? "")).toEqual({
      direction: "outbound",
      mode: "customer_managed",
      line_id: "00000000-0000-4000-8000-000000000001",
      destination: "+15555550100",
      media: { audio: true, video: true },
      livekit_url: "wss://rooms.example.test",
      participant_token: "bridge-token",
      remote_participant_identity: "odyssey-dojo",
    });
    // Neither LiveKit's secret nor its key goes to the call service.
    expect(request.init.body).not.toContain(config.livekitSecret);
    expect(request.init.body).not.toContain(config.livekitKey);
  });

  test("asking about a call is a GET with the same two headers", () => {
    const request = stateRequest(config, "call 1/2");
    expect(request.url).toBe("https://app.trychert.com/api/v1/calls/call%201%2F2");
    expect(request.init).toEqual({ method: "GET", headers: { Authorization: "Bearer chert-test-key-not-real", "X-Chert-Project-Id": "project-test" } });
  });

  test("placing a call sends exactly that request and reads the call's id", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const fetcher = (url: string, init: RequestInit): Promise<Response> => { sent.push({ url, init }); return Promise.resolve(json(201, { id: "call-1", state: "ringing" })); };
    expect(await placeCall(fetcher, config, call)).toEqual({ ok: true, callId: "call-1", queued: false });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(CHERT_CALLS);
    expect(sent[0]?.init.method).toBe("POST");
    expect(sent[0]?.init.headers).toEqual(callRequest(config, call).init.headers);
    expect(sent[0]?.init.body).toBe(callRequest(config, call).init.body);
    expect(sent[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  test("a queued call (202) and other shapes of the answer still give the id", async () => {
    expect(await placeCall(() => Promise.resolve(json(202, { call: { id: "call-2" } })), config, call)).toEqual({ ok: true, callId: "call-2", queued: true });
    expect(await placeCall(() => Promise.resolve(json(200, { data: { id: "call-3" } })), config, call)).toEqual({ ok: true, callId: "call-3", queued: false });
    expect(await placeCall(() => Promise.resolve(json(200, { call_id: "call-4" })), config, call)).toEqual({ ok: true, callId: "call-4", queued: false });
    expect(await placeCall(() => Promise.resolve(json(200, { ok: true })), config, call)).toEqual({ ok: false, why: "service", status: 200 });
  });

  test.each([
    [409, { error: "line_in_use" }, "line_busy"],
    [409, { error: { code: "line_in_call", message: "The line is on a call" } }, "line_busy"],
    [423, {}, "line_busy"],
    [403, { code: "destination_unverified" }, "unverified"],
    [400, { error: { type: "phone_not_verified" } }, "unverified"],
    [422, { message: "Destination must be verified for trial lines" }, "unverified"],
    [401, { error: "unauthorized" }, "unauthorized"],
    [403, { error: "forbidden" }, "unauthorized"],
    [400, { error: "invalid_destination" }, "bad_number"],
    [500, { error: "internal" }, "service"],
    [502, null, "service"],
    [400, "<html>", "service"],
  ] as const)("an answer of %i %j means %s", async (status, body, why) => {
    expect(failureOf(status, body)).toBe(why);
    expect(await placeCall(() => Promise.resolve(json(status, body)), config, call)).toEqual({ ok: false, why, status });
    expect(CHERT_MESSAGES[why]).toMatch(/^[A-Z].*\.$/);
  });

  test("no network is its own plain failure and the error is not passed on", async () => {
    const placed = await placeCall(() => Promise.reject(new TypeError(`fetch failed for Bearer ${config.chertKey}`)), config, call);
    expect(placed).toEqual({ ok: false, why: "network", status: 0 });
    expect(JSON.stringify(placed)).not.toContain(config.chertKey);
    expect(await callState(() => Promise.reject(new Error("down")), config, "call-1")).toEqual({ state: "unknown", raw: "" });
  });

  test("the call's state is reduced to ringing, active, over or unknown", async () => {
    for (const word of ["ringing", "queued", "dialing", "initiated", "pending"]) expect(remoteState(word), word).toBe("ringing");
    for (const word of ["active", "answered", "connected", "in_progress", "bridged"]) expect(remoteState(word), word).toBe("active");
    for (const word of ["ended", "completed", "failed", "canceled", "declined", "no_answer", "unanswered", "busy"]) expect(remoteState(word), word).toBe("over");
    expect(remoteState("")).toBe("unknown");
    expect(remoteState("mystery")).toBe("unknown");
    expect(await callState(() => Promise.resolve(json(200, { id: "call-1", state: "ended" })), config, "call-1")).toEqual({ state: "over", raw: "ended" });
    expect(await callState(() => Promise.resolve(json(200, { call: { state: "RINGING" } })), config, "call-1")).toEqual({ state: "ringing", raw: "RINGING" });
    expect(await callState(() => Promise.resolve(json(200, { status: "<script>" })), config, "call-1")).toEqual({ state: "unknown", raw: "" });
    expect(await callState(() => Promise.resolve(json(404, { error: "not_found" })), config, "call-1")).toEqual({ state: "unknown", raw: "" });
  });
});

describe("the routes", () => {
  let server: Server | null = null;
  afterEach(() => {
    server?.close();
    server?.closeAllConnections();
    server = null;
  });

  interface Sent { readonly url: string; readonly init: RequestInit }
  async function serve(env: Record<string, string | undefined>, chert: (url: string, init: RequestInit) => Promise<Response> = () => Promise.resolve(json(201, { id: "call-1" }))) {
    const sent: Sent[] = [];
    const app = express();
    app.use(express.json());
    const router = express.Router();
    registerFaceTime(router, { env: () => env, fetch: (url, init) => { sent.push({ url, init }); return chert(url, init); }, now: () => 1_800_000_000_000 });
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
    return { ask, sent };
  }

  test("with no settings every route refuses in plain words, names what is missing, and calls nobody", async () => {
    const { ask, sent } = await serve({ LIVEKIT_URL: ENV.LIVEKIT_URL });
    const missing = FACETIME_ENV.filter((name) => name !== "LIVEKIT_URL");
    expect(await ask("/api/facetime/status")).toMatchObject({ status: 200, body: { ready: false, missing } });
    for (const refused of [await ask("/api/facetime/seat", {}), await ask("/api/facetime/call", { to: PHONE, room: "odyssey-dojo-0123456789ab" }), await ask("/api/facetime/call/call-1")]) {
      expect(refused.status).toBe(503);
      expect(refused.body).toEqual({ error: "not_set_up", message: "FaceTime is not set up on this server.", missing });
    }
    expect(sent).toEqual([]);
  });

  test("a seat is a new room and a token for the game's own identity in it; no secret reaches the page", async () => {
    const { ask } = await serve(ENV);
    expect((await ask("/api/facetime/status")).body).toEqual({ ready: true, missing: [] });
    const one = await ask("/api/facetime/seat", {});
    const two = await ask("/api/facetime/seat", {});
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ url: ENV.LIVEKIT_URL, identity: AGENT_IDENTITY });
    expect(one.body.room).toMatch(/^odyssey-dojo-[0-9a-f]{12}$/);
    expect(two.body.room).not.toBe(one.body.room);
    const claims = readToken(String(one.body.token), ENV.LIVEKIT_API_SECRET);
    expect(claims).toMatchObject({ iss: ENV.LIVEKIT_API_KEY, sub: AGENT_IDENTITY, exp: 1_800_000_000 + TOKEN_TTL_S, video: { room: one.body.room, roomJoin: true, canPublish: true, canSubscribe: true } });
    for (const secret of [ENV.LIVEKIT_API_SECRET, ENV.CHERT_API_KEY, ENV.CHERT_PROJECT_ID, ENV.CHERT_LINE_ID]) expect(one.text).not.toContain(secret);
  });

  test("a call rings the phone through the call service with a bridge token for that room and a new key every time", async () => {
    const { ask, sent } = await serve(ENV);
    const first = await ask("/api/facetime/seat", {});
    const placed = await ask("/api/facetime/call", { to: "(555) 555-0100", room: first.body.room });
    expect(placed).toMatchObject({ status: 200, body: { callId: "call-1", queued: false } });
    const second = await ask("/api/facetime/seat", {});
    await ask("/api/facetime/call", { to: PHONE, room: second.body.room });
    expect(sent).toHaveLength(2);
    expect(sent.every((each) => each.url === "https://app.trychert.com/api/v1/calls")).toBe(true);

    const headers = sent.map((each) => each.init.headers as Record<string, string>);
    expect(headers[0]?.Authorization).toBe(`Bearer ${ENV.CHERT_API_KEY}`);
    expect(headers[0]?.["X-Chert-Project-Id"]).toBe(ENV.CHERT_PROJECT_ID);
    const keys = headers.map((each) => each["Idempotency-Key"] ?? "");
    expect(keys[0]).not.toBe(keys[1]);
    for (const key of keys) {
      expect(key.length).toBeGreaterThanOrEqual(8);
      expect(key.length).toBeLessThanOrEqual(200);
    }

    const body = JSON.parse(String(sent[0]?.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      direction: "outbound", mode: "customer_managed", line_id: ENV.CHERT_LINE_ID, destination: PHONE, media: { audio: true, video: true },
      livekit_url: ENV.LIVEKIT_URL, remote_participant_identity: AGENT_IDENTITY,
    });
    // The bridge gets its own identity in the same room as the game's seat.
    const bridge = readToken(String(body.participant_token), ENV.LIVEKIT_API_SECRET);
    expect(bridge).toMatchObject({ sub: BRIDGE_IDENTITY, video: { room: first.body.room, roomJoin: true, canPublish: true, canSubscribe: true } });
    expect(BRIDGE_IDENTITY).not.toBe(AGENT_IDENTITY);
    // Nothing of the keys or the number comes back to the page.
    for (const secret of [ENV.CHERT_API_KEY, ENV.LIVEKIT_API_SECRET, String(body.participant_token)]) expect(placed.text).not.toContain(secret);
  });

  test("a bad number, an unknown room and a room used twice are refused before the call service is asked", async () => {
    const { ask, sent } = await serve(ENV);
    const seat = await ask("/api/facetime/seat", {});
    expect(await ask("/api/facetime/call", { to: "555-0100", room: seat.body.room })).toMatchObject({ status: 400, body: { error: "bad_number" } });
    expect(await ask("/api/facetime/call", { room: seat.body.room })).toMatchObject({ status: 400, body: { error: "bad_number" } });
    expect(await ask("/api/facetime/call", { to: PHONE, room: "odyssey-dojo-ffffffffffff" })).toMatchObject({ status: 400, body: { error: "service" } });
    expect(await ask("/api/facetime/call", { to: PHONE, room: "../../etc" })).toMatchObject({ status: 400, body: { error: "service" } });
    expect(sent).toEqual([]);
    expect((await ask("/api/facetime/call", { to: PHONE, room: seat.body.room })).status).toBe(200);
    expect(await ask("/api/facetime/call", { to: PHONE, room: seat.body.room })).toMatchObject({ status: 400, body: { error: "service" } });
    expect(sent).toHaveLength(1);
  });

  test.each([
    [409, { error: "line_in_use" }, 409, "line_busy"],
    [403, { error: "destination_unverified" }, 400, "unverified"],
    [401, { error: "unauthorized", message: `bad key ${ENV.CHERT_API_KEY}` }, 400, "unauthorized"],
  ] as const)("the call service answering %i %j is passed on as a plain message", async (status, body, ours, why) => {
    const { ask } = await serve(ENV, () => Promise.resolve(json(status, body)));
    const seat = await ask("/api/facetime/seat", {});
    const refused = await ask("/api/facetime/call", { to: PHONE, room: seat.body.room });
    expect(refused.status).toBe(ours);
    expect(refused.body).toEqual({ error: why, message: CHERT_MESSAGES[why] });
    expect(refused.text).not.toContain(ENV.CHERT_API_KEY);
  });

  test("the call service being unreachable is a 502 with a plain message", async () => {
    const { ask } = await serve(ENV, () => Promise.reject(new TypeError("fetch failed")));
    const seat = await ask("/api/facetime/seat", {});
    expect(await ask("/api/facetime/call", { to: PHONE, room: seat.body.room })).toMatchObject({ status: 502, body: { error: "network", message: CHERT_MESSAGES.network } });
  });

  test("asking about a call goes to the call service with that id, and odd ids are refused", async () => {
    const { ask, sent } = await serve(ENV, () => Promise.resolve(json(200, { id: "call-1", state: "ended" })));
    expect(await ask("/api/facetime/call/call-1")).toMatchObject({ status: 200, body: { state: "over", raw: "ended" } });
    expect(sent[0]?.url).toBe("https://app.trychert.com/api/v1/calls/call-1");
    expect(sent[0]?.init.method).toBe("GET");
    expect((await ask("/api/facetime/call/a%20b")).status).toBe(400);
    expect(sent).toHaveLength(1);
  });
});
