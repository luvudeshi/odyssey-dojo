// The leave call: a member says it is going, so the other one hears at once and a guest's seat is free at once.
// Without it the relay finds out only when a stream closes (a proxy in front of the server can hide that) or
// AWAY_MS after the member's last poll. The store on a clock the test moves, and the route over real HTTP.
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { isTunnelPath, mayAnswer } from "../lib/localOnly";
import { SMALL_BODY_BYTES, WRONG_CODES_PER_MINUTE } from "../lib/roomLimits";
import { AWAY_MS, createRoomStore } from "../lib/rooms";
import type { Listener, PollResult, RelayMessage, RoomStore } from "../lib/rooms";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const GONE = { type: "peer", joined: false };
const HERE = { type: "peer", joined: true };

let server: Server | null = null;
afterEach(() => {
  vi.useRealTimers();
  server?.close();
  server?.closeAllConnections();
  server = null;
});

function open(store: RoomStore): { code: string; host: string; guest: string } {
  const room = store.create();
  const joined = room === null ? "unknown" : store.join(room.code);
  if (room === null || typeof joined === "string") throw new Error("no room");
  return { code: room.code, host: room.token, guest: joined.token };
}

function ear(): { listener: Listener; heard: RelayMessage[]; ended: number } {
  const made = { heard: [] as RelayMessage[], ended: 0, listener: { message: (m: RelayMessage) => { made.heard.push(m); }, end: () => { made.ended += 1; } } };
  return made;
}

function poll(store: RoomStore, code: string, token: string, after: number): PollResult[] {
  const answers: PollResult[] = [];
  const started = store.poll(code, token, after, (result) => { answers.push(result); });
  if (typeof started === "string") throw new Error(started);
  return answers;
}

test("a host who leaves is reported to a polling guest at once, its seat is closed for good, and the room takes no new guest", () => {
  let now = 1_000;
  const store = createRoomStore(() => now);
  const { code, host, guest } = open(store);
  const hostPoll = poll(store, code, host, 0);
  // The guest's first poll brings "the host is here"; the next one is held.
  expect(poll(store, code, guest, 0)[0]?.messages).toEqual([{ seq: 1, message: HERE }]);
  const held = poll(store, code, guest, 1);
  expect(held).toEqual([]);

  expect(store.leave(code.toLowerCase(), host)).toBe("left");
  // No clock moved: the guest's held poll is answered by the leave itself.
  expect(held).toEqual([{ seq: 2, messages: [{ seq: 2, message: GONE }], peer: false }]);
  // The host's own poll was answered when the guest arrived; nothing of the host's is left hanging.
  expect(hostPoll.length).toBe(1);

  // The same call again changes nothing and tells the guest nothing more.
  expect(store.leave(code, host)).toBe("left");
  expect(poll(store, code, guest, 2)).toEqual([]);
  // A poll of the host's that was still on its way does not bring the host back, and neither does a stream or a send.
  expect(store.poll(code, host, 0, () => undefined)).toBe("denied");
  expect(store.attach(code, host, ear().listener)).toBe("denied");
  expect(store.send(code, host, { n: 1 })).toBe("denied");
  now += AWAY_MS + 1;
  store.sweep();
  expect(poll(store, code, guest, 2)).toEqual([]);

  // The guest goes too; nobody new can walk into a room whose host cannot come back.
  expect(store.leave(code, guest)).toBe("left");
  expect(store.join(code)).toBe("unknown");
  // Nobody is connected to it, so it makes way for its owner's next room.
  expect(store.freeOne("")).toBe(0);
  expect(store.size()).toBe(0);
});

test("a host's held poll and open stream are ended by its leave", () => {
  const store = createRoomStore();
  const room = store.create();
  if (room === null) throw new Error("no room");
  const held = poll(store, room.code, room.token, 0);
  expect(held).toEqual([]);
  expect(store.leave(room.code, room.token)).toBe("left");
  expect(held).toEqual([{ seq: 0, messages: [], peer: false }]);

  const other = store.create();
  if (other === null) throw new Error("no room");
  const stream = ear();
  store.attach(other.code, other.token, stream.listener);
  expect(store.leave(other.code, other.token)).toBe("left");
  expect(stream.ended).toBe(1);
});

test("a guest who leaves frees its seat at once, the host is told, and the old token is dead", () => {
  const store = createRoomStore();
  const { code, host, guest } = open(store);
  const hostEar = ear();
  const guestEar = ear();
  store.attach(code, host, hostEar.listener);
  const guestStream = store.attach(code, guest, guestEar.listener);
  if (typeof guestStream === "string") throw new Error(guestStream);
  expect(hostEar.heard).toEqual([HERE]);
  expect(store.join(code)).toBe("full");

  expect(store.leave(code, guest)).toBe("left");
  expect(hostEar.heard).toEqual([HERE, GONE]);
  // The guest's stream is ended by the relay, and its close afterwards does not tell the host a second time.
  expect(guestEar.ended).toBe(1);
  guestStream.detach();
  // Twice is the same as once.
  expect(store.leave(code, guest)).toBe("left");
  expect(hostEar.heard).toEqual([HERE, GONE]);
  expect(store.send(code, guest, { n: 1 })).toBe("denied");

  // No 20 second wait: the code takes a new guest now, and the one who left cannot put that one out.
  const next = store.join(code);
  if (typeof next === "string") throw new Error(next);
  store.attach(code, next.token, ear().listener);
  expect(hostEar.heard).toEqual([HERE, GONE, HERE]);
  expect(store.leave(code, guest)).toBe("left");
  expect(store.send(code, next.token, { n: 2 })).toBe("sent");
  expect(hostEar.heard).toEqual([HERE, GONE, HERE, { n: 2 }]);
  expect(store.join(code)).toBe("full");
});

test("a polling host whose guest is away past AWAY_MS is told so by the poll's answer as well as by the message in it", () => {
  let now = 1_000;
  const store = createRoomStore(() => now);
  const { code, host, guest } = open(store);
  // The guest polls once and is never heard from again.
  const last = store.poll(code, guest, 0, () => undefined);
  if (typeof last === "string") throw new Error(last);
  expect(poll(store, code, host, 0)[0]?.peer).toBe(true);
  last.stop(false);
  const held = poll(store, code, host, 1);
  now += AWAY_MS;
  store.sweep();
  // "peer" was true here before: the answer went out while the guest still had the seat, and the page believed it.
  expect(held).toEqual([{ seq: 2, messages: [{ seq: 2, message: GONE }], peer: false }]);
});

test("a guest who never connected leaves without a word to the host, and the seat is free", () => {
  const store = createRoomStore();
  const { code, host, guest } = open(store);
  const hostEar = ear();
  store.attach(code, host, hostEar.listener);
  expect(store.leave(code, guest)).toBe("left");
  expect(hostEar.heard).toEqual([]);
  expect(typeof store.join(code)).toBe("object");
});

test("a stranger without the token does nothing: wrong token denied, unknown room unknown, both members stay", () => {
  const store = createRoomStore();
  const { code, host, guest } = open(store);
  const hostEar = ear();
  const guestEar = ear();
  store.attach(code, host, hostEar.listener);
  store.attach(code, guest, guestEar.listener);
  expect(store.leave(code, "wrong")).toBe("denied");
  expect(store.leave(code, "")).toBe("denied");
  expect(store.leave("QQQQ", host)).toBe("unknown");
  expect([hostEar.ended, guestEar.ended]).toEqual([0, 0]);
  expect(store.send(code, host, { n: 1 })).toBe("sent");
  expect(store.send(code, guest, { n: 2 })).toBe("sent");
  expect(store.join(code)).toBe("full");
});

type Call = (path: string, json?: unknown, headers?: Record<string, string>) => Promise<Response>;

async function serve(unguarded = false): Promise<Call> {
  const app = await createApp({ config, ai: NO_AI, ...(unguarded ? { guard: (_request, _response, next) => { next(); } } : {}) });
  const listening = app.listen(0, "127.0.0.1");
  await once(listening, "listening");
  server = listening;
  const { port } = listening.address() as AddressInfo;
  return (path, json, headers = {}) => fetch(`http://127.0.0.1:${String(port)}${path}`, json === undefined ? { headers } : {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(json),
  });
}

async function room(call: Call): Promise<{ code: string; host: string; guest: string }> {
  const made = await (await call("/api/rooms", {})).json() as { code: string; token: string };
  const joined = await (await call(`/api/rooms/${made.code}/join`, {})).json() as { token: string };
  return { code: made.code, host: made.token, guest: joined.token };
}

const polled = async (call: Call, code: string, token: string, after: number): Promise<{ status: number; body: unknown }> => {
  const answer = await call(`/api/rooms/${code}/poll?token=${token}&after=${String(after)}`);
  return { status: answer.status, body: await answer.json() };
};

test("POST /leave over HTTP: the host's leave answers the guest's held poll, the guest's frees the seat, and both may be said twice", async () => {
  const call = await serve();
  const { code, host, guest } = await room(call);
  // Nothing is waiting for the host yet, so its poll is held; the guest's arrival answers it.
  const hostPoll = polled(call, code, host, 0);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect((await polled(call, code, guest, 0)).body).toEqual({ seq: 1, messages: [{ seq: 1, message: HERE }], peer: true });
  expect((await hostPoll).status).toBe(200);
  const held = polled(call, code, guest, 1);
  // The guest's poll is held at the relay before the host leaves.
  await new Promise((resolve) => setTimeout(resolve, 50));

  const left = await call(`/api/rooms/${code.toLowerCase()}/leave`, { token: host });
  expect([left.status, await left.json()]).toEqual([200, { left: true }]);
  // Far inside POLL_HOLD_MS: the test would time out if the guest had to wait for the hold to end.
  expect(await held).toEqual({ status: 200, body: { seq: 2, messages: [{ seq: 2, message: GONE }], peer: false } });
  expect((await call(`/api/rooms/${code}/leave`, { token: host })).status).toBe(200);
  expect((await polled(call, code, host, 0)).status).toBe(401);

  // A second room, for the guest's side.
  const second = await room(call);
  expect((await call(`/api/rooms/${second.code}/join`, {})).status).toBe(409);
  expect((await call(`/api/rooms/${second.code}/leave`, { token: second.guest })).status).toBe(200);
  expect((await call(`/api/rooms/${second.code}/leave`, { token: second.guest })).status).toBe(200);
  expect((await call(`/api/rooms/${second.code}/join`, {})).status).toBe(200);
  expect((await polled(call, second.code, second.guest, 0)).status).toBe(401);
});

test("POST /leave refuses what the other room calls refuse: no token 400, wrong token 401, unknown room 404, a large body 413", async () => {
  const call = await serve();
  const { code, host, guest } = await room(call);
  const path = `/api/rooms/${code}/leave`;
  for (const body of [{}, { token: 7 }, { token: null }, [host]]) expect((await call(path, body)).status, JSON.stringify(body)).toBe(400);
  const wrong = await call(path, { token: "wrong" });
  expect([wrong.status, await wrong.json()]).toEqual([401, { error: "bad_token" }]);
  const unknown = await call("/api/rooms/QQQQ/leave", { token: host });
  expect([unknown.status, await unknown.json()]).toEqual([404, { error: "unknown_room" }]);
  expect((await call(path, { token: host, pad: "x".repeat(SMALL_BODY_BYTES) })).status).toBe(413);
  // A token in the address is not read: only the body's counts.
  expect((await call(`${path}?token=${host}`, {})).status).toBe(400);
  // Nothing above put anybody out.
  expect((await call(`/api/rooms/${code}/send`, { token: guest, message: { n: 1 } })).status).toBe(200);
  expect((await call(`/api/rooms/${code}/send`, { token: host, message: { n: 1 } })).status).toBe(200);
  expect((await call(`/api/rooms/${code}/join`, {})).status).toBe(409);
});

test("wrong tokens on /leave are counted with those on /send: past the limit both get 429, and the member's own leave still works", async () => {
  // Without the guard, so the header can stand for a caller's address, as in roomsRoute.test.ts.
  const call = await serve(true);
  const { code, host } = await room(call);
  const stranger = { "Cf-Connecting-Ip": "203.0.113.9" };
  const leave = `/api/rooms/${code}/leave`;
  for (let index = 0; index < WRONG_CODES_PER_MINUTE; index += 1) {
    const known = index % 2 === 0;
    expect((await call(known ? leave : "/api/rooms/QQQQ/leave", { token: "wrong" }, stranger)).status).toBe(known ? 401 : 404);
  }
  const refused = await call(leave, { token: "wrong" }, stranger);
  expect([refused.status, refused.headers.get("retry-after"), await refused.json()]).toEqual([429, "60", { error: "too_many_requests" }]);
  expect((await call(`/api/rooms/${code}/send`, { token: "wrong", message: {} }, stranger)).status).toBe(429);
  expect((await call("/api/rooms/QQQQ/leave", { token: "wrong" }, stranger)).status).toBe(429);
  // Another caller has its own count, and the right token is not held up by any of it.
  expect((await call(leave, { token: "wrong" }, { "Cf-Connecting-Ip": "203.0.113.10" })).status).toBe(401);
  expect((await call(leave, { token: host }, stranger)).status).toBe(200);
});

test("the leave path answers a request that a tunnel or a proxy passed on, through the real app's guard", async () => {
  const tunnel = { "Cf-Connecting-Ip": "203.0.113.7", "Cf-Ray": "8f1c2d3e4f5a6b7c-DFW", "X-Forwarded-For": "203.0.113.7", "X-Forwarded-Proto": "https" };
  expect(isTunnelPath("/api/rooms/abcd/leave")).toBe(true);
  for (const open of [false, true]) expect(mayAnswer("/api/rooms/ABCD/leave", "127.0.0.1", { "x-forwarded-for": "203.0.113.7" }, open)).toBe(true);
  const call = await serve();
  const { code, guest } = await room(call);
  // A spending route beside it is the guard's 403; an unknown room is the relay's own 404; a member's leave gets through.
  expect((await call("/api/level", {}, tunnel)).status).toBe(403);
  expect((await call("/api/rooms/QQQQ/leave", { token: "x" }, tunnel)).status).toBe(404);
  expect((await call(`/api/rooms/${code}/leave`, { token: guest }, tunnel)).status).toBe(200);
});
