// Polling and the guest seat: the store on a clock the test moves, and the poll route over real HTTP.
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { POLLS_PER_SECOND } from "../lib/roomLimits";
import { AWAY_MS, BACKLOG_MESSAGES, IDLE_MS, POLL_HOLD_MS, createRoomStore } from "../lib/rooms";
import type { Listener, PollResult, RelayMessage, RoomStore } from "../lib/rooms";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};

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

function ear(): { listener: Listener; heard: RelayMessage[]; ids: number[] } {
  const made = { heard: [] as RelayMessage[], ids: [] as number[], listener: { message: (m: RelayMessage, seq: number) => { made.heard.push(m); made.ids.push(seq); }, end: () => undefined } };
  return made;
}

/** Starts a poll and keeps what it is answered with. */
function poll(store: RoomStore, code: string, token: string, after: number): { answers: PollResult[]; stop: (answer: boolean) => void } {
  const answers: PollResult[] = [];
  const started = store.poll(code, token, after, (result) => { answers.push(result); });
  if (typeof started === "string") throw new Error(started);
  return { answers, stop: started.stop };
}

test("messages are numbered per seat, a poll answers at once with what is after N and holds when there is nothing, and a send wakes it", () => {
  const store = createRoomStore();
  const { code, host, guest } = open(store);
  expect(store.send(code, host, { n: 1 })).toBe("dropped");
  const now = poll(store, code, guest, 0);
  expect(now.answers).toEqual([{ seq: 1, messages: [{ seq: 1, message: { n: 1 } }], peer: false }]);
  const held = poll(store, code, guest, 1);
  expect(held.answers).toEqual([]);
  // The guest polling is here, so the host's send is delivered and answers the held poll with just the new message.
  expect(store.send(code, host, { n: 2 })).toBe("sent");
  expect(held.answers).toEqual([{ seq: 2, messages: [{ seq: 2, message: { n: 2 } }], peer: false }]);
  // The host's own seat has its own numbers: the guest arriving was announced to it as message 1.
  expect(poll(store, code, host, 0).answers[0]?.messages).toEqual([{ seq: 1, message: { type: "peer", joined: true } }]);
  // A number past the newest is treated as the newest.
  expect(poll(store, code, guest, 99).answers).toEqual([]);
});

test("a stream's events carry the same numbers a poll uses", () => {
  const store = createRoomStore();
  const { code, host, guest } = open(store);
  const hostEar = ear();
  store.attach(code, host, hostEar.listener);
  store.attach(code, guest, ear().listener);
  store.send(code, guest, { n: 1 });
  store.send(code, guest, { n: 2 });
  expect(hostEar.ids).toEqual([1, 2, 3]);
  expect(poll(store, code, host, 1).answers[0]?.messages.map((entry) => entry.seq)).toEqual([2, 3]);
});

test("only the newest 256 messages are kept for a seat", () => {
  let now = 1_000;
  const store = createRoomStore(() => now);
  const { code, host, guest } = open(store);
  expect(BACKLOG_MESSAGES).toBe(256);
  for (let n = 1; n <= 300; n += 1) {
    // The send limit is 120 a second, so the clock moves on every 100.
    if (n % 100 === 0) now += 1_000;
    store.send(code, host, { n });
  }
  const answer = poll(store, code, guest, 0).answers[0];
  expect(answer?.seq).toBe(300);
  expect(answer?.messages.length).toBe(256);
  expect(answer?.messages[0]?.seq).toBe(45);
});

test("a newer poll answers the older with nothing, a poll ends the member's stream, and stop(false) lets a poll go without an answer", () => {
  const store = createRoomStore();
  const { code, host, guest } = open(store);
  const stream = { ended: 0, listener: { message: () => undefined, end: () => undefined } };
  stream.listener = { message: () => undefined, end: () => { stream.ended += 1; } };
  store.attach(code, guest, stream.listener);
  const first = poll(store, code, guest, 0);
  expect(stream.ended).toBe(1);
  const second = poll(store, code, guest, 0);
  expect(first.answers).toEqual([{ seq: 0, messages: [], peer: false }]);
  second.stop(false);
  expect(second.answers).toEqual([]);
  // Nothing is held now, so the host's send is kept for the next poll.
  store.send(code, host, { n: 1 });
  expect(second.answers).toEqual([]);
});

test("a removed room answers a held poll, and a poll counts as use of the room", () => {
  let now = 1_000;
  const store = createRoomStore(() => now);
  const kept = open(store);
  const gone = open(store);
  const held = poll(store, gone.code, gone.guest, 0);
  now += IDLE_MS - 1_000;
  poll(store, kept.code, kept.host, 0);
  now += 1_000;
  store.sweep();
  expect(store.size()).toBe(1);
  expect(held.answers).toEqual([{ seq: 0, messages: [], peer: false }]);
  expect(store.poll(gone.code, gone.guest, 0, () => undefined)).toBe("unknown");
});

test("the guest's seat is given back after 20 seconds without a stream or a poll; a reconnect inside that keeps it", () => {
  let now = 1_000;
  const store = createRoomStore(() => now);
  const { code, host, guest } = open(store);
  const hostEar = ear();
  store.attach(code, host, hostEar.listener);
  const first = store.attach(code, guest, ear().listener);
  if (typeof first === "string") throw new Error(first);
  expect(AWAY_MS).toBe(20_000);

  // A short blip: the stream drops and the same token is back 19 seconds later.
  first.detach();
  now += AWAY_MS - 1_000;
  expect(store.join(code)).toBe("full");
  const back = store.attach(code, guest, ear().listener);
  expect(typeof back).toBe("object");

  // Gone for good: no stream and no poll. The seat is still held at 19 s and given away at 20.
  if (typeof back === "string") throw new Error(back);
  back.detach();
  now += AWAY_MS - 1;
  expect(store.attach(code, guest, ear().listener)).not.toBe("denied");
  const again = store.attach(code, guest, ear().listener);
  if (typeof again === "string") throw new Error(again);
  again.detach();
  now += AWAY_MS;
  const fresh = store.join(code);
  if (typeof fresh === "string") throw new Error(fresh);
  expect(fresh.token).not.toBe(guest);
  // The old token is refused everywhere, and the new guest is a different member.
  expect(store.attach(code, guest, ear().listener)).toBe("denied");
  expect(store.poll(code, guest, 0, () => undefined)).toBe("denied");
  expect(store.send(code, guest, { n: 1 })).toBe("denied");
  expect(typeof store.attach(code, fresh.token, ear().listener)).toBe("object");
  expect(hostEar.heard.filter((message) => message.type === "peer").map((message) => message.joined)).toEqual([true, false, true, false, true, false, true]);
});

test("a guest that polls keeps the seat, one that stops loses it, and the host's seat is never given back", () => {
  let now = 1_000;
  const store = createRoomStore(() => now);
  const { code, host, guest } = open(store);
  const held = poll(store, code, guest, 0);
  now += POLL_HOLD_MS * 3;
  // A held poll is a connection: even a minute later the seat is held.
  expect(store.join(code)).toBe("full");
  held.stop(true);
  const next = poll(store, code, guest, 0);
  now += AWAY_MS - 1;
  expect(store.join(code)).toBe("full");
  next.stop(false);
  now += AWAY_MS;
  expect(typeof store.join(code)).toBe("object");
  // The host has been silent through all of it, and still owns the room.
  expect(store.send(code, host, { n: 1 })).toBe("dropped");
});

/** The real app on a loopback port; calls GET or POST with JSON. */
async function serve(): Promise<(path: string, json?: unknown, signal?: AbortSignal) => Promise<Response>> {
  const listening = (await createApp({ config, ai: NO_AI })).listen(0, "127.0.0.1");
  await once(listening, "listening");
  server = listening;
  const { port } = listening.address() as AddressInfo;
  return (path, json, signal) => fetch(`http://127.0.0.1:${String(port)}${path}`, {
    ...(json === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) }),
    ...(signal === undefined ? {} : { signal }),
  });
}

async function room(call: Awaited<ReturnType<typeof serve>>): Promise<{ code: string; host: string; guest: string }> {
  const made = await (await call("/api/rooms", {})).json() as { code: string; token: string };
  const joined = await (await call(`/api/rooms/${made.code}/join`, {})).json() as { token: string };
  return { code: made.code, host: made.token, guest: joined.token };
}

test("over HTTP a held poll answers within a moment of a send, and a poll after N asks for the rest", async () => {
  const call = await serve();
  const { code, host, guest } = await room(call);
  const poll1 = call(`/api/rooms/${code}/poll?token=${guest}&after=0`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const sentAt = Date.now();
  expect(await (await call(`/api/rooms/${code}/send`, { token: host, message: { type: "end", won: true } })).json()).toEqual({ delivered: true });
  const answered = await poll1;
  expect(Date.now() - sentAt).toBeLessThan(500);
  expect(answered.headers.get("cache-control")).toBe("no-store");
  expect(await answered.json()).toEqual({ seq: 1, messages: [{ seq: 1, message: { type: "end", won: true } }], peer: false });
  // Asking again from 0 is answered at once from the backlog; from 1 it holds until the client hangs up.
  expect(((await (await call(`/api/rooms/${code}/poll?token=${guest}&after=0`)).json()) as PollResult).seq).toBe(1);
  const hangUp = new AbortController();
  const held = call(`/api/rooms/${code}/poll?token=${guest}&after=1`, undefined, hangUp.signal);
  await new Promise((resolve) => setTimeout(resolve, 50));
  hangUp.abort();
  await expect(held).rejects.toThrow();
});

test("a poll with nothing to say answers with an empty list when POLL_HOLD_MS has passed", async () => {
  const call = await serve();
  const { code, guest } = await room(call);
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  const held = call(`/api/rooms/${code}/poll?token=${guest}`);
  // Let the request reach the server and be held before the clock moves.
  for (let turn = 0; turn < 5; turn += 1) await new Promise<void>((resolve) => { setImmediate(resolve); });
  await vi.advanceTimersByTimeAsync(POLL_HOLD_MS);
  const answered = await held;
  expect(answered.status).toBe(200);
  expect(await answered.json()).toEqual({ seq: 0, messages: [], peer: false });
});

test("a poll refuses a wrong token, an unknown room and a junk position like the stream does, and polls past the limit get 429", async () => {
  // The poll limit counts a second on Date.now. The date stands still here, from before the app and its limits are made,
  // so how many polls fit in "one second" does not depend on how fast this machine answers them.
  vi.useFakeTimers({ toFake: ["Date"] });
  const startedMs = Date.now();
  const call = await serve();
  const { code, host, guest } = await room(call);
  await call(`/api/rooms/${code}/send`, { token: host, message: { type: "end", won: true } });
  expect((await call(`/api/rooms/${code}/poll?token=wrong`)).status).toBe(401);
  expect((await call(`/api/rooms/${code}/poll`)).status).toBe(401);
  expect((await call(`/api/rooms/QQQQ/poll?token=${guest}`)).status).toBe(404);
  for (const after of ["-1", "x", "1.5", "9999999999999999"]) expect((await call(`/api/rooms/${code}/poll?token=${guest}&after=${after}`)).status, after).toBe(400);
  // A message is waiting, so every poll answers at once. One at a time, more than a second's budget is asked for.
  const next = (): Promise<Response> => call(`/api/rooms/${code}/poll?token=${guest}&after=0`);
  const asked = POLLS_PER_SECOND + 40;
  const answers: number[] = [];
  for (let n = 0; n < asked; n += 1) answers.push((await next()).status);
  expect(Date.now()).toBe(startedMs);
  // Polls are let through up to the limit and every one after that is refused: no more than the limit got an answer.
  const firstRefused = answers.indexOf(429);
  expect(firstRefused).toBeGreaterThan(0);
  expect(firstRefused).toBeLessThanOrEqual(POLLS_PER_SECOND);
  expect(answers.slice(0, firstRefused).every((status) => status === 200)).toBe(true);
  expect(answers.slice(firstRefused).every((status) => status === 429)).toBe(true);
  expect(answers.length - firstRefused).toBeGreaterThanOrEqual(asked - POLLS_PER_SECOND);
  // The refusal says when to come back, and lasts until the second is over and no longer.
  const refused = await next();
  expect(refused.status).toBe(429);
  expect(refused.headers.get("retry-after")).toBe("1");
  expect(await refused.json()).toEqual({ error: "too_many_requests" });
  vi.setSystemTime(startedMs + 999);
  expect((await next()).status).toBe(429);
  vi.setSystemTime(startedMs + 1_000);
  expect((await next()).status).toBe(200);
});
