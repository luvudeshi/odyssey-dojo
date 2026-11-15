// PUBLIC_ROOMS=1 lets a request that was passed on by a proxy make a room, for a room server behind a public page
// (docs/rooms-tunnel.md, "The hosted copy"). Off, which is the default, the guard is what it has always been. On, it opens that one
// path and nothing else, and the room limits hold: per caller, for all callers together, and in rooms alive at once.
// With it on a caller is the entry the server's own proxy wrote, for the join count too, and no header a caller writes buys a fresh budget.
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { JOIN_LIMIT, joinCaller, mayAnswer, publicRooms } from "../lib/localOnly";
import {
  CREATES_PER_MINUTE, HOSTED_CREATES_PER_MINUTE, HOSTED_POLLS_PER_SECOND, HOSTED_ROOMS_PER_CLIENT, HOSTED_STREAMS_PER_CLIENT, MAX_ROOMS_PER_CLIENT,
  MAX_STREAMS_PER_CLIENT, MINUTE_MS, POLLS_PER_SECOND, PUBLIC_CREATES_PER_MINUTE, RELAYED, ROOMS_KEPT_FOR_THIS_MACHINE, THIS_MACHINE,
  clientKey, createRoomLimits, roomsPerClient,
} from "../lib/roomLimits";
import { AWAY_MS, BACKLOG_MESSAGES, MAX_ROOMS, createRoomStore } from "../lib/rooms";
import type { PollResult } from "../lib/rooms";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const LAN = "192.168.1.20";
/** The proxy's own address inside Docker, as the game server sees Caddy in deploy/vultr. */
const PROXY = "172.18.0.3";
/** What a hosting proxy in front of the server puts on a request. The visitor's address is made up. */
const relayedFrom = (address: string): Record<string, string> => ({
  "X-Forwarded-For": address, "X-Forwarded-Proto": "https", "X-Forwarded-Host": "game.example", "X-Real-Ip": address,
});
const RELAYED_HEADERS = relayedFrom("203.0.113.7");
/** Every API path that must stay closed to a request that was passed on, flag or no flag. */
const CLOSED = [
  ["POST", "/api/level"], ["POST", "/api/speech"], ["POST", "/api/reveal"], ["GET", "/api/portrait/x"],
  ["POST", "/api/replays"], ["PUT", "/api/replays/abcdefghij/video"], ["GET", "/api/replays/abcdefghij/qr.svg"],
  ["GET", "/api/facetime/status"], ["POST", "/api/facetime/seat"], ["POST", "/api/facetime/call"], ["POST", "/api/facetime/standin"],
  ["POST", "/api/facetime/hangup"], ["GET", "/api/facetime/call/abc"], ["GET", "/api/facetime/waiting"],
  ["GET", "/api/health"], ["POST", "/API/Level"], ["POST", "/api/rooms//"], ["POST", "/api/roomsx"], ["GET", "/api/nope"],
] as const;

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

type Call = (method: string, path: string, headers?: Record<string, string>) => Promise<Response>;

/** The real app, with its real guard, on a loopback port. `flag` is what PUBLIC_ROOMS is set to; undefined leaves it unset. */
async function serve(flag: string | undefined): Promise<Call> {
  if (flag === undefined) delete process.env.PUBLIC_ROOMS;
  else process.env.PUBLIC_ROOMS = flag;
  const app = await createApp({ config, ai: NO_AI });
  const listening = app.listen(0, "127.0.0.1");
  await once(listening, "listening");
  server = listening;
  const { port } = listening.address() as AddressInfo;
  return (method, path, headers = {}) => fetch(`http://127.0.0.1:${String(port)}${path}`, {
    method, headers: { ...headers, ...(method === "GET" ? {} : { "Content-Type": "application/json" }) }, ...(method === "GET" ? {} : { body: "{}" }),
  });
}

test("the flag is on only when PUBLIC_ROOMS is exactly 1", () => {
  expect(publicRooms({ PUBLIC_ROOMS: "1" })).toBe(true);
  expect(publicRooms({ PUBLIC_ROOMS: " 1 " })).toBe(true);
  for (const value of [undefined, "", " ", "0", "true", "yes", "on", "2", "11", "1x"]) expect(publicRooms({ PUBLIC_ROOMS: value }), String(value)).toBe(false);
  expect(publicRooms({})).toBe(false);
});

test("flag off: the guard answers exactly as before, for every kind of caller", () => {
  const relayed = { "x-forwarded-for": "203.0.113.7" };
  for (const address of ["127.0.0.1", "::1", LAN, PROXY, undefined]) {
    // Not passing the flag and passing false are the same thing.
    for (const path of ["/api/rooms", "/api/rooms/", "/API/Rooms", ...CLOSED.map(([, path]) => path)]) {
      expect(mayAnswer(path, address, relayed), `${path} from ${String(address)}`).toBe(false);
      expect(mayAnswer(path, address, relayed, false), `${path} from ${String(address)}`).toBe(false);
    }
    for (const path of ["/api/rooms/KXTR/join", "/api/rooms/kxtr/events", "/api/rooms/KXTR/poll", "/api/rooms/KXTR/send", "/api/rooms/address", "/", "/replays/abc"]) {
      expect(mayAnswer(path, address, relayed), `${path} from ${String(address)}`).toBe(true);
    }
  }
  // With no proxy header: another device makes rooms, this machine reaches everything.
  expect(mayAnswer("/api/rooms", LAN)).toBe(true);
  expect(mayAnswer("/api/level", LAN)).toBe(false);
  expect(mayAnswer("/api/level", "127.0.0.1")).toBe(true);
});

test("flag on: a request that was passed on may make a room, and no other closed path opened with it", () => {
  const relayed = { "x-forwarded-for": "203.0.113.7" };
  for (const address of ["127.0.0.1", "::1", LAN, PROXY, undefined]) {
    for (const path of ["/api/rooms", "/api/rooms/", "/API/Rooms", "/Api/Rooms/"]) {
      expect(mayAnswer(path, address, relayed, true), `${path} from ${String(address)}`).toBe(true);
    }
    for (const [, path] of CLOSED) expect(mayAnswer(path, address, relayed, true), `${path} from ${String(address)}`).toBe(false);
    for (const path of ["/api/rooms?x", "/api/room", "/api/rooms-admin", "/api/roomsx/"]) {
      expect(mayAnswer(path, address, relayed, true), `${path} from ${String(address)}`).toBe(false);
    }
    // Making a room is a POST. No other method opens the path, so a route added there later stays closed.
    expect(mayAnswer("/api/rooms", address, relayed, true, "post")).toBe(true);
    for (const method of ["GET", "HEAD", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      expect(mayAnswer("/api/rooms", address, relayed, true, method), `${method} from ${String(address)}`).toBe(false);
      expect(mayAnswer("/api/rooms/", address, relayed, true, method), `${method} from ${String(address)}`).toBe(false);
      // Inside a room nothing changed: the guard never looked at the method there.
      expect(mayAnswer("/api/rooms/KXTR/poll", address, relayed, true, method)).toBe(true);
    }
  }
  // The flag grants nothing to a caller with no proxy header: another device is still refused the spending routes
  // and the account paths, and this machine still reaches everything.
  for (const path of ["/api/level", "/api/speech", "/api/account/signin", "/api/heroes"]) {
    expect(mayAnswer(path, LAN, {}, true), path).toBe(false);
    expect(mayAnswer(path, PROXY, relayed, true), path).toBe(false);
    expect(mayAnswer(path, "127.0.0.1", {}, true), path).toBe(true);
  }
  // Through a tunnel on this machine the account paths and the hall of heroes answer as they do with the flag off,
  // and the spending routes stay closed.
  for (const flag of [false, true]) {
    for (const path of ["/api/account/status", "/api/account/signin", "/api/account/save", "/api/heroes"]) expect(mayAnswer(path, "127.0.0.1", relayed, flag), path).toBe(true);
    for (const path of ["/api/level", "/api/speech", "/api/account/other"]) expect(mayAnswer(path, "127.0.0.1", relayed, flag), path).toBe(false);
  }
});

test("flag off, over HTTP: a relayed caller cannot make a room, with the flag unset, empty, 0 or true", async () => {
  for (const flag of [undefined, "", "0", "true"]) {
    const call = await serve(flag);
    expect((await call("POST", "/api/rooms", RELAYED_HEADERS)).status, String(flag)).toBe(403);
    expect((await call("POST", "/api/rooms", { "X-Forwarded-For": "" })).status, String(flag)).toBe(403);
    for (const [method, path] of CLOSED) expect((await call(method, path, RELAYED_HEADERS)).status, `${method} ${path}`).toBe(403);
    // This machine is untouched.
    expect((await call("POST", "/api/rooms")).status).toBe(200);
    expect((await call("GET", "/api/health")).status).toBe(200);
    server?.close();
    server?.closeAllConnections();
    server = null;
  }
});

test("flag on, over HTTP: a relayed caller makes a room and a second one joins it, and AI, speech, FaceTime, replay upload and health are still refused", async () => {
  const call = await serve("1");
  const made = await call("POST", "/api/rooms", RELAYED_HEADERS);
  expect(made.status).toBe(200);
  const room = await made.json() as { code: string; token: string };
  expect(room.code).toMatch(/^[A-Z]{4}$/);
  expect(room.token.length).toBeGreaterThan(20);
  const joined = await call("POST", `/api/rooms/${room.code}/join`, relayedFrom("198.51.100.9"));
  expect(joined.status).toBe(200);
  for (const [method, path] of CLOSED) {
    const answer = await call(method, path, RELAYED_HEADERS);
    expect(answer.status, `${method} ${path}`).toBe(403);
    expect(await answer.json(), `${method} ${path}`).toEqual({ error: "local_only" });
  }
  // One proxy header of any kind is still enough to close a spending route.
  for (const header of ["X-Real-Ip", "Forwarded", "Via", "X-Forwarded-Host", "X-Forwarded-Proto"]) {
    expect((await call("POST", "/api/level", { [header]: "x" })).status, header).toBe(403);
  }
  // Only the POST opened: a relayed GET or PUT on the same path is refused by the guard, as with the flag off.
  for (const method of ["GET", "PUT", "DELETE"]) expect((await call(method, "/api/rooms", RELAYED_HEADERS)).status, method).toBe(403);
});

test("the counting key: unchanged with the flag off, the proxy's own entry with it on", () => {
  const forwarded = { "x-forwarded-for": "203.0.113.7" };
  // Off: what it has always been.
  expect(clientKey("127.0.0.1", {})).toBe(THIS_MACHINE);
  expect(clientKey("127.0.0.1", forwarded)).toBe(RELAYED);
  expect(clientKey("127.0.0.1", { "cf-connecting-ip": "203.0.113.7", ...forwarded })).toBe("via 203.0.113.7");
  expect(clientKey(PROXY, forwarded)).toBe(PROXY);
  expect(clientKey(LAN, { "cf-connecting-ip": "203.0.113.7" })).toBe(LAN);
  expect(clientKey(PROXY, forwarded, false)).toBe(PROXY);
  // On: the last entry, which the nearest proxy wrote. Entries before it are the caller's own words and are not read.
  expect(clientKey(PROXY, forwarded, true)).toBe("via 203.0.113.7");
  expect(clientKey("127.0.0.1", forwarded, true)).toBe("via 203.0.113.7");
  expect(clientKey(PROXY, { "x-forwarded-for": "1.2.3.4, 5.6.7.8 , 203.0.113.7" }, true)).toBe("via 203.0.113.7");
  expect(clientKey(PROXY, { "x-forwarded-for": "2001:db8:1:2:3:4:5:6" }, true)).toBe("via 2001:db8:1:2::/64");
  // Not an address: the caller is counted as before.
  for (const value of ["", "unknown", "203.0.113.7:443", "203.0.113.7, ", "a".repeat(200)]) {
    expect(clientKey(PROXY, { "x-forwarded-for": value }, true), value).toBe(PROXY);
    expect(clientKey("127.0.0.1", { "x-forwarded-for": value }, true), value).toBe(RELAYED);
  }
  expect(clientKey(PROXY, { "x-real-ip": "203.0.113.7" }, true)).toBe(PROXY);
  // On, the tunnel's header is not read at all: the proxy passes it on as the caller wrote it, so it must not be a key.
  expect(clientKey("127.0.0.1", { "cf-connecting-ip": "198.51.100.1", ...forwarded }, true)).toBe("via 203.0.113.7");
  expect(clientKey("127.0.0.1", { "cf-connecting-ip": "anything at all", ...forwarded }, true)).toBe("via 203.0.113.7");
  expect(clientKey("127.0.0.1", { "cf-connecting-ip": "198.51.100.1" }, true)).toBe(RELAYED);
  expect(clientKey(LAN, { "cf-connecting-ip": "198.51.100.1" }, true)).toBe(LAN);
  // On, whatever the guard calls passed on is never this machine, which is not counted for rooms.
  for (const name of ["x-forwarded-proto", "x-forwarded-host", "x-forwarded-port", "cf-ray", "cdn-loop", "cf-connecting-ip", "via", "forwarded"]) {
    expect(clientKey("127.0.0.1", { [name]: "" }, true), name).toBe(RELAYED);
    expect(clientKey("::1", { [name]: "x" }, true), name).toBe(RELAYED);
  }
  // Off, those headers count as they always have.
  for (const name of ["x-forwarded-proto", "cf-ray", "cdn-loop"]) expect(clientKey("127.0.0.1", { [name]: "x" }), name).toBe(THIS_MACHINE);
  expect(clientKey("127.0.0.1", {}, true)).toBe(THIS_MACHINE);
});

test("the join count: unchanged with the flag off, the proxy's own entry with it on", () => {
  const forwarded = { "x-forwarded-for": "203.0.113.7" };
  const tunnel = { "cf-connecting-ip": "198.51.100.1", ...forwarded };
  // Off: the tunnel's visitor from this machine, the socket's address otherwise.
  expect(joinCaller("127.0.0.1", tunnel)).toBe("198.51.100.1");
  expect(joinCaller("127.0.0.1", forwarded)).toBe("127.0.0.1");
  expect(joinCaller(PROXY, tunnel)).toBe(PROXY);
  expect(joinCaller(PROXY, tunnel, false)).toBe(PROXY);
  expect(joinCaller(undefined, {})).toBe("unknown");
  // On: every request comes from the proxy's socket, so the socket would be one count for the whole world.
  expect(joinCaller(PROXY, forwarded, true)).toBe("203.0.113.7");
  expect(joinCaller(PROXY, { "x-forwarded-for": "198.51.100.200, 203.0.113.7" }, true)).toBe("203.0.113.7");
  expect(joinCaller(PROXY, { "x-forwarded-for": "2001:db8:1:2:3:4:5:6" }, true)).toBe("2001:db8:1:2::/64");
  expect(joinCaller("127.0.0.1", tunnel, true)).toBe("203.0.113.7");
  // Not an address: the socket again, never a header the caller wrote.
  expect(joinCaller(PROXY, { "x-forwarded-for": "unknown", "cf-connecting-ip": "198.51.100.1" }, true)).toBe(PROXY);
  expect(joinCaller("127.0.0.1", { "cf-connecting-ip": "198.51.100.1" }, true)).toBe("127.0.0.1");
});

test("flag on, over HTTP: one stranger's wrong joins do not stop another visitor joining, and no header buys more", async () => {
  const call = await serve("1");
  const room = await (await call("POST", "/api/rooms", RELAYED_HEADERS)).json() as { code: string };
  const stranger = "198.51.100.66";
  for (let attempt = 0; attempt < JOIN_LIMIT; attempt += 1) {
    expect((await call("POST", "/api/rooms/ZZZZ/join", { "X-Forwarded-For": stranger })).status, `attempt ${String(attempt + 1)}`).toBe(404);
  }
  const refused = await call("POST", "/api/rooms/ZZZZ/join", { "X-Forwarded-For": stranger });
  expect(refused.status).toBe(429);
  expect(await refused.json()).toEqual({ error: "too_many_joins" });
  // A new Cf-Connecting-Ip each time, or addresses written in front, is still the same caller.
  for (let index = 0; index < 5; index += 1) {
    expect((await call("POST", "/api/rooms/ZZZZ/join", { "X-Forwarded-For": stranger, "Cf-Connecting-Ip": `10.0.0.${String(index)}` })).status).toBe(429);
    expect((await call("POST", "/api/rooms/ZZZZ/join", { "X-Forwarded-For": `10.0.0.${String(index)}, ${stranger}` })).status).toBe(429);
  }
  // The stranger is refused the right code too. A visitor from another address joins.
  expect((await call("POST", `/api/rooms/${room.code}/join`, { "X-Forwarded-For": stranger })).status).toBe(429);
  expect((await call("POST", `/api/rooms/${room.code}/join`, { "X-Forwarded-For": "203.0.113.9" })).status).toBe(200);
});

test("flag on, over HTTP: a made-up Cf-Connecting-Ip or a lone X-Forwarded-Proto gives no fresh budget for rooms", async () => {
  const call = await serve("1");
  for (let index = 0; index < HOSTED_CREATES_PER_MINUTE; index += 1) {
    expect((await call("POST", "/api/rooms", { "X-Forwarded-For": "203.0.113.7", "Cf-Connecting-Ip": `10.0.0.${String(index)}` })).status, `room ${String(index)}`).toBe(200);
  }
  expect((await call("POST", "/api/rooms", { "X-Forwarded-For": "203.0.113.7", "Cf-Connecting-Ip": "anything at all" })).status).toBe(429);
  // Passed on, but with no address to count: these share one key, and are not "this machine", which is never refused.
  const unnamed = [{ "X-Forwarded-Proto": "https" }, { "Cf-Ray": "1" }, { "Cdn-Loop": "x" }, { "Cf-Connecting-Ip": "" }, { "X-Forwarded-Host": "game.example" }];
  const answers: number[] = [];
  for (let index = 0; index < HOSTED_CREATES_PER_MINUTE + unnamed.length; index += 1) {
    answers.push((await call("POST", "/api/rooms", unnamed[index % unnamed.length])).status);
  }
  expect(answers.slice(0, HOSTED_CREATES_PER_MINUTE).every((status) => status === 200)).toBe(true);
  expect(answers.slice(HOSTED_CREATES_PER_MINUTE)).toEqual(unnamed.map(() => 429));
  // This machine's own browser, with no proxy header, is still let through.
  expect((await call("POST", "/api/rooms")).status).toBe(200);
});

test("the shared budget only counts with the flag on, counts rooms that were made, and never counts this machine", () => {
  let nowMs = 1_000_000;
  const off = createRoomLimits(() => nowMs, () => false);
  const on = createRoomLimits(() => nowMs, () => true);
  const made = (limits: typeof on): number => {
    let count = 0;
    // More callers than the shared budget has room for, one room each.
    for (let caller = 0; caller < PUBLIC_CREATES_PER_MINUTE + 10; caller += 1) {
      const who = `via 198.51.100.${String(caller)}`;
      if (limits.create(who) !== 0) continue;
      limits.made(who);
      count += 1;
    }
    return count;
  };
  expect(made(off)).toBe(PUBLIC_CREATES_PER_MINUTE + 10);
  expect(made(on)).toBe(PUBLIC_CREATES_PER_MINUTE);
  expect(on.create("via 203.0.113.99")).toBeGreaterThan(0);
  for (let index = 0; index < 100; index += 1) {
    expect(on.create(THIS_MACHINE)).toBe(0);
    on.made(THIS_MACHINE);
  }
  nowMs += MINUTE_MS;
  expect(on.create("via 203.0.113.99")).toBe(0);
  // A create that was let through and then got no room (the server was full) spends nothing of the shared budget.
  const full = createRoomLimits(() => nowMs, () => true);
  for (let caller = 0; caller < PUBLIC_CREATES_PER_MINUTE * 3; caller += 1) expect(full.create(`via 192.0.2.${String(caller)}`)).toBe(0);
});

test("with the flag on one caller's caps are sized for a hall behind one address; off they are the laptop's", () => {
  let nowMs = 0;
  const off = createRoomLimits(() => nowMs, () => false);
  const on = createRoomLimits(() => nowMs, () => true);
  expect([roomsPerClient(false), roomsPerClient(true)]).toEqual([MAX_ROOMS_PER_CLIENT, HOSTED_ROOMS_PER_CLIENT]);
  // One key never gets more than half of what all outside callers share.
  expect(HOSTED_CREATES_PER_MINUTE * 2).toBeLessThanOrEqual(PUBLIC_CREATES_PER_MINUTE);
  expect(HOSTED_ROOMS_PER_CLIENT * 2).toBeLessThanOrEqual(MAX_ROOMS - ROOMS_KEPT_FOR_THIS_MACHINE);
  const creates = (limits: typeof on): number => {
    let count = 0;
    while (limits.create("via 203.0.113.7") === 0) count += 1;
    return count;
  };
  expect([creates(off), creates(on)]).toEqual([CREATES_PER_MINUTE, HOSTED_CREATES_PER_MINUTE]);
  const streams = (limits: typeof on): number => {
    let count = 0;
    while (limits.openStream("via 203.0.113.7", `seat ${String(count)}`) !== null) count += 1;
    return count;
  };
  expect([streams(off), streams(on)]).toEqual([MAX_STREAMS_PER_CLIENT, HOSTED_STREAMS_PER_CLIENT]);
  const polls = (limits: typeof on): number => {
    let count = 0;
    while (limits.poll("via 203.0.113.7") === 0) count += 1;
    return count;
  };
  expect([polls(off), polls(on)]).toEqual([POLLS_PER_SECOND, HOSTED_POLLS_PER_SECOND]);
  nowMs += 1_000;
  expect(on.poll("via 203.0.113.7")).toBe(0);
});

test("at the cap the store gives a stranger the place of a room strangers left, never a room in use, a new one or this machine's", () => {
  let nowMs = 0;
  const store = createRoomStore(() => nowMs);
  const listener = { message: () => undefined, end: () => undefined };
  const make = (owner: string): { code: string; token: string } => {
    nowMs += 1_000;
    const room = store.create(owner);
    if (room === null) throw new Error("no room");
    return room;
  };
  const mine = make(THIS_MACHINE);
  const first = make("via a");
  const second = make("via b");
  // Made a moment ago: the host's page may not have connected yet.
  expect(store.freeOther(THIS_MACHINE, AWAY_MS)).toBe(false);
  expect(store.freeOne("via a", AWAY_MS)).toBeGreaterThan(0);
  expect(store.size()).toBe(3);
  nowMs += AWAY_MS;
  // Somebody connects to the older room, so the other one goes.
  expect(typeof store.attach(first.code, first.token, listener)).toBe("object");
  expect(store.freeOther(THIS_MACHINE, AWAY_MS)).toBe(true);
  expect([store.heldBy("via a"), store.heldBy("via b"), store.heldBy(THIS_MACHINE)]).toEqual([1, 0, 1]);
  expect(store.join(second.code)).toBe("unknown");
  // What is left is in use, or this machine's: nothing more is given up, however long it has been.
  nowMs += 10 * AWAY_MS;
  expect(store.freeOther(THIS_MACHINE, AWAY_MS)).toBe(false);
  expect(store.freeOne("via a", AWAY_MS)).toBeGreaterThan(0);
  expect(typeof store.join(mine.code)).toBe("object");
  // With no grace, an owner's own room goes as it always has.
  const third = make("via c");
  expect(store.freeOne("via c")).toBe(0);
  expect(store.join(third.code)).toBe("unknown");
});

// The memory this saves was measured outside the tests (docs/rooms-tunnel.md, "The hosted copy"): 256 messages of
// 16 KB of "{},{},..." kept as objects held 85 MB a seat, kept as text 4 MB.
test("the backlog keeps each message as its text: a poll reads back what was sent, fresh each time", () => {
  let nowMs = 0;
  const store = createRoomStore(() => nowMs);
  const room = store.create("via a");
  if (room === null) throw new Error("no room");
  const guest = store.join(room.code);
  if (typeof guest === "string") throw new Error(guest);
  const read = (): PollResult => {
    const answers: PollResult[] = [];
    store.poll(room.code, guest.token, 0, (result) => { answers.push(result); });
    const [answer] = answers;
    if (answer === undefined) throw new Error("the poll was held");
    return answer;
  };
  const list = [1, 2];
  const message = { type: "state", list, nested: { empty: {}, none: null, text: "café ☃" } };
  expect(store.send(room.code, room.token, message)).toBe("dropped");
  // The sender's object changing afterwards changes nothing that was kept.
  list.push(3);
  const first = read();
  const second = read();
  const sent = { type: "state", list: [1, 2], nested: { empty: {}, none: null, text: "café ☃" } };
  expect(first.messages).toEqual([{ seq: 1, message: sent }]);
  expect(second.messages).toEqual(first.messages);
  // Each answer is read back from the text: the store holds no object a caller could reach or that could grow.
  expect(first.messages[0]?.message).not.toBe(message);
  expect(second.messages[0]?.message).not.toBe(first.messages[0]?.message);
  // The newest BACKLOG_MESSAGES are kept, in order, with their numbers.
  for (let index = 0; index < BACKLOG_MESSAGES + 10; index += 1) {
    nowMs += 10;
    expect(store.send(room.code, room.token, { n: index, holes: [[], [], {}] })).toBe("sent");
  }
  const all = read();
  expect(all.messages.length).toBe(BACKLOG_MESSAGES);
  expect(all.messages[0]).toEqual({ seq: 12, message: { n: 10, holes: [[], [], {}] } });
  expect(all.seq).toBe(BACKLOG_MESSAGES + 11);
});

interface Made { readonly code: string; readonly token: string }

test("flag on, over HTTP: one address makes fifteen rooms a minute and holds twenty; its next one takes the place of a room it left", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const call = await serve("1");
  const hall = { "X-Forwarded-For": "203.0.113.7" };
  const rooms: Made[] = [];
  const create = async (): Promise<number> => {
    const answer = await call("POST", "/api/rooms", hall);
    if (answer.status === 200) rooms.push(await answer.json() as Made);
    return answer.status;
  };
  for (let index = 0; index < HOSTED_CREATES_PER_MINUTE; index += 1) expect(await create(), `room ${String(index)}`).toBe(200);
  const refused = await call("POST", "/api/rooms", hall);
  expect(refused.status).toBe(429);
  expect(refused.headers.get("retry-after")).toBe("60");
  // Writing other addresses in front does not give a fresh budget: only the proxy's own entry counts.
  expect((await call("POST", "/api/rooms", { "X-Forwarded-For": "198.51.100.200, 203.0.113.7" })).status).toBe(429);
  expect((await call("POST", "/api/rooms", { "X-Forwarded-For": "9.9.9.9,203.0.113.7" })).status).toBe(429);
  // Another caller is not held back by the first.
  expect((await call("POST", "/api/rooms", { "X-Forwarded-For": "203.0.113.8" })).status).toBe(200);

  vi.setSystemTime(Date.now() + MINUTE_MS);
  while (rooms.length < HOSTED_ROOMS_PER_CLIENT) expect(await create()).toBe(200);
  // The hall holds its twenty. Nobody is connected to any of them, so the next one replaces the one used longest ago.
  expect(await create()).toBe(200);
  const [oldest, next] = rooms;
  const guest = { "X-Forwarded-For": "203.0.113.50" };
  expect((await call("POST", `/api/rooms/${oldest?.code ?? ""}/join`, guest)).status).toBe(404);
  expect((await call("POST", `/api/rooms/${next?.code ?? ""}/join`, guest)).status).toBe(200);
});

test("flag on, over HTTP: everybody's rooms a minute and the rooms alive at once are capped, a full server gives a left room's place, and a refusal spends nothing", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const call = await serve("1");
  const rooms: Made[] = [];
  const create = async (address: string): Promise<number> => {
    const answer = await call("POST", "/api/rooms", { "X-Forwarded-For": address });
    if (answer.status === 200) rooms.push(await answer.json() as Made);
    return answer.status;
  };

  // Everybody together: PUBLIC_CREATES_PER_MINUTE a minute, however many addresses they come from.
  for (let caller = 0; caller < PUBLIC_CREATES_PER_MINUTE; caller += 1) expect(await create(`198.51.100.${String(caller)}`), `caller ${String(caller)}`).toBe(200);
  for (const address of ["192.0.2.1", "192.0.2.2"]) {
    const refused = await call("POST", "/api/rooms", { "X-Forwarded-For": address });
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("60");
  }
  // This machine is not part of that budget.
  expect((await call("POST", "/api/rooms")).status).toBe(200);

  // Rooms alive at once: strangers stop ROOMS_KEPT_FOR_THIS_MACHINE short of MAX_ROOMS.
  vi.setSystemTime(Date.now() + MINUTE_MS);
  const cap = MAX_ROOMS - ROOMS_KEPT_FOR_THIS_MACHINE;
  for (let caller = 0; rooms.length < cap; caller += 1) expect(await create(`192.0.2.${String(caller)}`), `filling ${String(caller)}`).toBe(200);
  // Nobody is connected to any of them, so at the cap a new host gets the place of the one used longest ago.
  expect(await create("192.0.2.100")).toBe(200);
  const gone = rooms.shift();
  expect((await call("POST", `/api/rooms/${gone?.code ?? ""}/join`, { "X-Forwarded-For": "192.0.2.101" })).status).toBe(404);

  // A host connects to every room. Now there is no place to give: 503, as often as it is asked.
  const streams: Response[] = [];
  for (const [index, room] of rooms.entries()) {
    const stream = await call("GET", `/api/rooms/${room.code}/events?token=${room.token}`, { "X-Forwarded-For": `198.18.0.${String(index)}` });
    expect(stream.status, `stream ${String(index)}`).toBe(200);
    streams.push(stream);
  }
  expect(rooms.length).toBe(cap);
  for (let caller = 0; caller < PUBLIC_CREATES_PER_MINUTE; caller += 1) {
    const full = await call("POST", "/api/rooms", { "X-Forwarded-For": `198.18.1.${String(caller)}` });
    expect(full.status, `refusal ${String(caller)}`).toBe(503);
    expect(await full.json()).toEqual({ error: "too_many_rooms" });
  }
  // The rooms kept back are still there for the machine that runs the server.
  expect((await call("POST", "/api/rooms")).status).toBe(200);

  // One host leaves. Once the room has been left alone for AWAY_MS a new host gets its place: the refusals above
  // spent nothing of the minute's shared budget, or this would be 429.
  await streams[0]?.body?.cancel();
  vi.setSystemTime(Date.now() + AWAY_MS);
  let status = 0;
  for (let attempt = 0; attempt < 80 && status !== 200; attempt += 1) {
    status = await create(`198.18.2.${String(attempt)}`);
    expect([200, 503]).toContain(status);
    if (status !== 200) await new Promise((resolve) => setTimeout(resolve, 25));
  }
  expect(status).toBe(200);
  for (const stream of streams.slice(1)) await stream.body?.cancel();
});
