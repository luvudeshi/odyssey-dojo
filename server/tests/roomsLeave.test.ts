// A member says it is leaving: the store on a clock the test moves, and the leave route over real HTTP with the real guard.
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { isTunnelPath, mayAnswer } from "../lib/localOnly";
import { POLLS_PER_SECOND, SMALL_BODY_BYTES, WRONG_CODES_PER_MINUTE } from "../lib/roomLimits";
import { AWAY_MS, IDLE_MS, createRoomStore } from "../lib/rooms";
import type { Listener, PollResult, RelayMessage, RoomStore } from "../lib/rooms";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const GONE: RelayMessage = { type: "peer", joined: false };
const HERE: RelayMessage = { type: "peer", joined: true };
/** What cloudflared puts on a request it hands over, and what a hosting proxy does. The addresses are made up. */
const tunnelFrom = (address: string): Record<string, string> => ({ "Cf-Connecting-Ip": address, "Cf-Ray": "1", "X-Forwarded-For": address });
const proxyFrom = (address: string): Record<string, string> => ({ "X-Forwarded-For": address, "X-Forwarded-Proto": "https" });

let server: Server | null = null;
const before = process.env.PUBLIC_ROOMS;
afterEach(() => {
  vi.useRealTimers();
  if (before === undefined) delete process.env.PUBLIC_ROOMS;
  else process.env.PUBLIC_ROOMS = before;
  server?.close();
  server?.closeAllConnections();
  server = null;
});

function open(store: RoomStore): { code: string; host: string; guest: string } {
  const room = store.create("owner");
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

test("a guest that leaves frees its seat at once: the host is told once, its stream ends, its token stops working, and the next join gets the seat", () => {
  const now = 1_000;
  const store = createRoomStore(() => now);
  const { code, host, guest } = open(store);
  const hostEar = ear();
  const guestEar = ear();
  store.attach(code, host, hostEar.listener);
  store.attach(code, guest, guestEar.listener);
  expect(hostEar.heard).toEqual([HERE]);
  expect(store.join(code)).toBe("full");

  // The clock has not moved: nothing here waits for AWAY_MS.
  expect(store.leave(code.toLowerCase(), guest)).toBe("left");
  expect(hostEar.heard).toEqual([HERE, GONE]);
  expect(guestEar.ended).toBe(1);
  expect(hostEar.ended).toBe(0);
  expect(store.send(code, host, { n: 1 })).toBe("dropped");
  // The old token is like any wrong one, on every call, and a second leave changes nothing.
  expect(store.leave(code, guest)).toBe("denied");
  expect(store.send(code, guest, { n: 1 })).toBe("denied");
  expect(store.poll(code, guest, 0, () => undefined)).toBe("denied");
  expect(hostEar.heard).toEqual([HERE, GONE]);

  const again = store.join(code);
  if (typeof again === "string") throw new Error(again);
  expect(again.token).not.toBe(guest);
  // The new guest starts from nothing: the message the host sent to the empty room is not for it.
  expect(poll(store, code, again.token, 0)).toEqual([]);
  expect(hostEar.heard).toEqual([HERE, GONE, HERE]);
});

test("a polling guest that leaves has its held poll answered, and the host's held poll says the guest is gone", () => {
  const store = createRoomStore(() => 1_000);
  const { code, host, guest } = open(store);
  // Each one's first poll tells the other it is here, so both have heard message 1 and these two are held.
  poll(store, code, host, 0);
  const guestHeld = poll(store, code, guest, 1);
  const hostHeld = poll(store, code, host, 1);
  expect([guestHeld, hostHeld]).toEqual([[], []]);

  expect(store.leave(code, guest)).toBe("left");
  expect(hostHeld).toEqual([{ seq: 2, messages: [{ seq: 2, message: GONE }], peer: false }]);
  expect(guestHeld).toEqual([{ seq: 1, messages: [], peer: true }]);
  expect(typeof store.join(code)).toBe("object");
});

test("a host that leaves is gone for the guest at once, keeps its seat and token, and is back with its next poll", () => {
  let now = 1_000;
  const store = createRoomStore(() => now);
  const { code, host, guest } = open(store);
  const hostEar = ear();
  const guestEar = ear();
  store.attach(code, host, hostEar.listener);
  store.attach(code, guest, guestEar.listener);

  expect(store.leave(code, host)).toBe("left");
  expect(guestEar.heard).toEqual([GONE]);
  expect(hostEar.ended).toBe(1);
  expect(store.send(code, guest, { n: 1 })).toBe("dropped");
  // Twice is the same as once, and the sweep that would have said it 20 s later has nothing left to say.
  expect(store.leave(code, host)).toBe("left");
  now += AWAY_MS;
  store.sweep();
  expect(guestEar.heard).toEqual([GONE]);
  // The guest's seat was never the host's to free.
  expect(store.join(code)).toBe("full");

  store.attach(code, guest, guestEar.listener);
  expect(poll(store, code, host, 0)[0]?.peer).toBe(true);
  expect(guestEar.heard).toEqual([GONE, HERE]);
});

test("a wrong token or code changes nothing, a member that was never connected leaves without a word, and leaving is not use of the room", () => {
  let now = 1_000;
  const store = createRoomStore(() => now);
  const { code, host, guest } = open(store);
  const hostEar = ear();
  store.attach(code, host, hostEar.listener);
  expect(store.leave(code, "wrong")).toBe("denied");
  expect(store.leave(code, "")).toBe("denied");
  expect(store.leave("QQQQ", guest)).toBe("unknown");
  expect(store.join(code)).toBe("full");
  expect(hostEar.heard).toEqual([]);
  expect(hostEar.ended).toBe(0);

  // The host was never told this guest was here, so it is not told it went.
  expect(store.leave(code, guest)).toBe("left");
  expect(hostEar.heard).toEqual([]);

  // The room was last used when the host's stream opened. A leave just before it expires does not keep it.
  now += IDLE_MS - 1;
  expect(store.leave(code, host)).toBe("left");
  now += 1;
  expect(store.leave(code, host)).toBe("unknown");
  expect(store.size()).toBe(0);
});

test("a room both members left can go to its owner's next create at once", () => {
  const store = createRoomStore(() => 1_000);
  const { code, host, guest } = open(store);
  store.attach(code, host, ear().listener);
  store.attach(code, guest, ear().listener);
  // Somebody is connected: nothing to give back, and the wait is the room's whole life.
  expect(store.freeOne("owner")).toBe(IDLE_MS / 1000);
  store.leave(code, guest);
  store.leave(code, host);
  expect(store.freeOne("owner")).toBe(0);
  expect(store.size()).toBe(0);
});

type Call = (path: string, init?: { json?: unknown; body?: string; type?: string | null; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

/** The real app with its real guard on a loopback port. `flag` is what PUBLIC_ROOMS is set to; undefined leaves it unset. */
async function serve(flag?: string): Promise<Call> {
  if (flag === undefined) delete process.env.PUBLIC_ROOMS;
  else process.env.PUBLIC_ROOMS = flag;
  const listening = (await createApp({ config, ai: NO_AI })).listen(0, "127.0.0.1");
  await once(listening, "listening");
  server = listening;
  const { port } = listening.address() as AddressInfo;
  return (path, init = {}) => {
    const text = init.body ?? (init.json === undefined ? undefined : JSON.stringify(init.json));
    const type = init.type === undefined ? "application/json" : init.type;
    return fetch(`http://127.0.0.1:${String(port)}${path}`, {
      ...(text === undefined ? {} : { method: "POST", body: type === null ? new Blob([text]) : text }),
      headers: { ...init.headers, ...(text === undefined || type === null ? {} : { "Content-Type": type }) },
      ...(init.signal === undefined ? {} : { signal: init.signal }),
    });
  };
}

async function room(call: Call, headers: Record<string, string> = {}): Promise<{ code: string; host: string; guest: string }> {
  const made = await (await call("/api/rooms", { json: {} })).json() as { code: string; token: string };
  const joined = await (await call(`/api/rooms/${made.code}/join`, { json: {}, headers })).json() as { token: string };
  return { code: made.code, host: made.token, guest: joined.token };
}

/** Starts a long poll and lets it reach the server and be held. `said` is what it is answered with, or null if the test ends first. */
async function held(call: Call, code: string, token: string, after: number, headers: Record<string, string> = {}): Promise<{ said: () => Promise<unknown> }> {
  const poll = call(`/api/rooms/${code}/poll?token=${token}&after=${String(after)}`, { headers }).then((answer) => answer.json() as Promise<unknown>).catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { said: () => poll };
}

test("over HTTP with two long-polling members: a guest's leave reaches the host's poll and frees the seat within a moment, as JSON and as text/plain; a host's leave reaches the guest's poll", async () => {
  const call = await serve();
  const { code, host, guest } = await room(call);
  // Each one's first poll tells the other it is here.
  await held(call, code, host, 0);
  expect(await (await call(`/api/rooms/${code}/poll?token=${guest}&after=0`)).json()).toEqual({ seq: 1, messages: [{ seq: 1, message: HERE }], peer: true });
  expect(await (await call(`/api/rooms/${code}/poll?token=${host}&after=0`)).json()).toEqual({ seq: 1, messages: [{ seq: 1, message: HERE }], peer: true });
  expect((await call(`/api/rooms/${code}/join`, { json: {} })).status).toBe(409);

  const guestPoll = await held(call, code, guest, 1);
  const hostPoll = await held(call, code, host, 1);
  let leftAt = Date.now();
  const left = await call(`/api/rooms/${code}/leave`, { json: { token: guest } });
  expect([left.status, await left.json()]).toEqual([200, { left: true }]);
  expect(await hostPoll.said()).toEqual({ seq: 2, messages: [{ seq: 2, message: GONE }], peer: false });
  // The guest's own held poll is let go with nothing new.
  expect(await guestPoll.said()).toEqual({ seq: 1, messages: [], peer: true });
  const second = await call(`/api/rooms/${code}/join`, { json: {} });
  expect(second.status).toBe(200);
  expect(Date.now() - leftAt).toBeLessThan(1_000);

  // What navigator.sendBeacon sends for a string: the same JSON, labelled text/plain.
  const { token: next } = await second.json() as { token: string };
  await held(call, code, next, 0);
  const hostAgain = await held(call, code, host, 3);
  leftAt = Date.now();
  const beacon = await call(`/api/rooms/${code}/leave`, { body: JSON.stringify({ token: next }), type: "text/plain;charset=UTF-8" });
  expect([beacon.status, await beacon.json()]).toEqual([200, { left: true }]);
  expect(await hostAgain.said()).toEqual({ seq: 4, messages: [{ seq: 4, message: GONE }], peer: false });
  // A Blob with no type carries no Content-Type at all, and is read the same way.
  const third = await (await call(`/api/rooms/${code}/join`, { json: {} })).json() as { token: string };
  expect(Date.now() - leftAt).toBeLessThan(1_000);
  const guestHeld = await held(call, code, third.token, 0);
  leftAt = Date.now();
  expect((await call(`/api/rooms/${code}/leave`, { body: JSON.stringify({ token: host }), type: null })).status).toBe(200);
  expect(await guestHeld.said()).toEqual({ seq: 1, messages: [{ seq: 1, message: GONE }], peer: false });
  expect(Date.now() - leftAt).toBeLessThan(1_000);
  // The host's token still stands: it comes back with a poll, and the guest hears it.
  await held(call, code, host, 5);
  expect(await (await call(`/api/rooms/${code}/poll?token=${third.token}&after=1`)).json()).toEqual({ seq: 2, messages: [{ seq: 2, message: HERE }], peer: true });
});

test("a leave that names no seat gets one answer whatever was wrong, changes nothing, and a body that is not a small JSON object with a token is refused", async () => {
  const call = await serve();
  const { code, host, guest } = await room(call);
  const gone = await room(call);
  expect((await call(`/api/rooms/${gone.code}/leave`, { json: { token: gone.guest } })).status).toBe(200);
  const leave = `/api/rooms/${code}/leave`;
  const answers: string[] = [];
  for (const [path, token] of [[leave, "wrong"], [leave, ""], ["/api/rooms/QQQQ/leave", guest], ["/api/rooms/QQQQ/leave", "wrong"], [`/api/rooms/${gone.code}/leave`, gone.guest], [leave, gone.host]] as const) {
    const answer = await call(path, { json: { token } });
    answers.push(`${String(answer.status)} ${await answer.text()}`);
  }
  expect(new Set(answers)).toEqual(new Set(['404 {"error":"not_in_room"}']));
  // Both members still hold their seats.
  expect((await call(`/api/rooms/${code}/join`, { json: {} })).status).toBe(409);
  expect((await call(`/api/rooms/${code}/send`, { json: { token: guest, message: {} } })).status).toBe(200);
  expect((await call(`/api/rooms/${code}/send`, { json: { token: host, message: {} } })).status).toBe(200);

  for (const json of [{}, { token: 7 }, { token: null }, { token: [guest] }, [], [guest]]) expect((await call(leave, { json })).status, JSON.stringify(json)).toBe(400);
  for (const body of ["", "token", `token=${guest}`, `"${guest}"`, `{"token":"${guest}"`]) expect((await call(leave, { body, type: "text/plain" })).status, body).toBe(400);
  const form = new FormData();
  form.set("token", guest);
  const posted = await fetch((await call("/api/health")).url.replace("/api/health", leave), { method: "POST", body: form });
  expect(posted.status).toBe(400);
  // One byte over the small-body limit is refused unread, in either label.
  const big = JSON.stringify({ token: guest, pad: "x".repeat(SMALL_BODY_BYTES) });
  for (const type of ["application/json", "text/plain"]) expect((await call(leave, { body: big, type })).status, type).toBe(413);
  // Only a POST leaves, and the token is not read from the address.
  expect((await call(`${leave}?token=${guest}`)).status).toBe(404);
  expect((await call(`${leave}?token=${guest}`, { json: {} })).status).toBe(400);
  expect((await call(`/api/rooms/${code}/join`, { json: {} })).status).toBe(409);
});

test("wrong leaves are counted with wrong sends, so they buy no guesses; a member's own leave still goes through", async () => {
  const call = await serve();
  const { code, guest } = await room(call);
  const stranger = tunnelFrom("203.0.113.9");
  for (let n = 0; n < WRONG_CODES_PER_MINUTE; n += 1) expect((await call("/api/rooms/QQQQ/leave", { json: { token: "x" }, headers: stranger })).status).toBe(404);
  const refused = await call("/api/rooms/QQQQ/leave", { json: { token: "x" }, headers: stranger });
  expect([refused.status, refused.headers.get("retry-after"), await refused.json()]).toEqual([429, "60", { error: "too_many_requests" }]);
  // The same budget as a wrong send or poll: neither has any left, and a right code is told nothing either.
  expect((await call("/api/rooms/QQQQ/send", { json: { token: "x", message: {} }, headers: stranger })).status).toBe(429);
  expect((await call(`/api/rooms/${code}/poll?token=x`, { headers: stranger })).status).toBe(429);
  expect((await call(`/api/rooms/${code}/leave`, { json: { token: "x" }, headers: stranger })).status).toBe(429);
  // Wrong joins are counted apart, and another visitor is not held up.
  expect((await call("/api/rooms/QQQQ/join", { json: {}, headers: stranger })).status).toBe(404);
  expect((await call("/api/rooms/QQQQ/leave", { json: { token: "x" }, headers: tunnelFrom("203.0.113.10") })).status).toBe(404);
  // The member itself, from the address that spent the budget, still leaves.
  expect((await call(`/api/rooms/${code}/leave`, { json: { token: guest }, headers: stranger })).status).toBe(200);
  expect((await call(`/api/rooms/${code}/join`, { json: {}, headers: stranger })).status).toBe(200);
});

test("leaves past the poll limit get 429 and free nothing", async () => {
  // The limit counts a second on Date.now, which stands still here: see the same test for polls in roomsPoll.test.ts.
  vi.useFakeTimers({ toFake: ["Date"] });
  const call = await serve();
  const { code, host, guest } = await room(call);
  const answers: number[] = [];
  for (let n = 0; n < POLLS_PER_SECOND + 5; n += 1) answers.push((await call(`/api/rooms/${code}/leave`, { json: { token: host } })).status);
  const firstRefused = answers.indexOf(429);
  expect(firstRefused).toBe(POLLS_PER_SECOND);
  expect(answers.slice(0, firstRefused).every((status) => status === 200)).toBe(true);
  expect(answers.slice(firstRefused).every((status) => status === 429)).toBe(true);
  expect((await call(`/api/rooms/${code}/leave`, { json: { token: guest } })).status).toBe(429);
  expect((await call(`/api/rooms/${code}/join`, { json: {} })).status).toBe(409);
});

test("the guard lets a leave through a tunnel and a proxy, with the flag off and on, and no other method or path with it", () => {
  for (const open of [false, true]) {
    for (const headers of [{}, tunnelFrom("203.0.113.7"), proxyFrom("203.0.113.7")]) {
      for (const path of ["/api/rooms/KXTR/leave", "/API/Rooms/kxtr/LEAVE", "/api/rooms/KXTR/leave/"]) {
        expect(mayAnswer(path, "127.0.0.1", headers, open), `${path} ${String(open)}`).toBe(true);
      }
    }
    expect(mayAnswer("/api/rooms/KXTR/leave", "192.168.1.20", {}, open)).toBe(true);
    for (const path of ["/api/leave", "/api/roomsx/KXTR/leave", "/api/level/leave"]) expect(mayAnswer(path, "127.0.0.1", proxyFrom("203.0.113.7"), open), path).toBe(false);
  }
  expect(isTunnelPath("/api/rooms/kxtr/leave")).toBe(true);
});

test("flag off, through a tunnel: a guest joins, leaves with a beacon, and the next visitor gets the seat", async () => {
  const call = await serve();
  const guestAt = tunnelFrom("203.0.113.7");
  const { code, host, guest } = await room(call, guestAt);
  await held(call, code, guest, 0, guestAt);
  expect(((await (await call(`/api/rooms/${code}/poll?token=${host}&after=0`)).json()) as PollResult).peer).toBe(true);
  expect((await call(`/api/rooms/${code}/join`, { json: {}, headers: tunnelFrom("203.0.113.8") })).status).toBe(409);
  const hostHeld = await held(call, code, host, 1);
  const beacon = await call(`/api/rooms/${code}/leave`, { body: JSON.stringify({ token: guest }), type: "text/plain;charset=UTF-8", headers: guestAt });
  expect([beacon.status, await beacon.json()]).toEqual([200, { left: true }]);
  expect(await hostHeld.said()).toEqual({ seq: 2, messages: [{ seq: 2, message: GONE }], peer: false });
  expect((await call(`/api/rooms/${code}/join`, { json: {}, headers: tunnelFrom("203.0.113.8") })).status).toBe(200);
  // A request that only carries X-Forwarded-For (another proxy) is let through the same way.
  expect((await call(`/api/rooms/${code}/leave`, { json: { token: "wrong" }, headers: { "X-Forwarded-For": "203.0.113.8" } })).status).toBe(404);
});

test("flag on, through the proxy: host and guest are both strangers; the guest's beacon frees the seat and the host's ends the room for the guest", async () => {
  const call = await serve("1");
  const hostAt = proxyFrom("198.51.100.1");
  const guestAt = proxyFrom("198.51.100.2");
  const made = await (await call("/api/rooms", { json: {}, headers: hostAt })).json() as { code: string; token: string };
  const joined = await (await call(`/api/rooms/${made.code}/join`, { json: {}, headers: guestAt })).json() as { token: string };
  await held(call, made.code, joined.token, 0, guestAt);
  const hostHeld = await held(call, made.code, made.token, 1, hostAt);
  const beacon = await call(`/api/rooms/${made.code}/leave`, { body: JSON.stringify({ token: joined.token }), type: "text/plain;charset=UTF-8", headers: guestAt });
  expect([beacon.status, await beacon.json()]).toEqual([200, { left: true }]);
  expect(await hostHeld.said()).toEqual({ seq: 2, messages: [{ seq: 2, message: GONE }], peer: false });
  const again = await call(`/api/rooms/${made.code}/join`, { json: {}, headers: guestAt });
  expect(again.status).toBe(200);
  const { token } = await again.json() as { token: string };
  const guestHeld = await held(call, made.code, token, 0, guestAt);
  expect((await call(`/api/rooms/${made.code}/leave`, { body: JSON.stringify({ token: made.token }), type: "text/plain;charset=UTF-8", headers: hostAt })).status).toBe(200);
  expect(await guestHeld.said()).toEqual({ seq: 1, messages: [{ seq: 1, message: GONE }], peer: false });
  // A stranger with the code and no token gets the one answer.
  const wrong = await call(`/api/rooms/${made.code}/leave`, { json: { token: "wrong" }, headers: proxyFrom("198.51.100.3") });
  expect([wrong.status, await wrong.json()]).toEqual([404, { error: "not_in_room" }]);
});
