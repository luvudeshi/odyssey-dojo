// PUBLIC_ROOMS=1 lets a request that was passed on by a proxy make a room, for a room server behind a public page
// (docs/rooms-tunnel.md, "The hosted copy"). Off, which is the default, the guard is what it has always been. On, it opens that one
// path and nothing else, and the room limits hold: per caller, for all callers together, and in rooms alive at once.
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { mayAnswer, publicRooms } from "../lib/localOnly";
import {
  CREATES_PER_MINUTE, MAX_ROOMS_PER_CLIENT, MINUTE_MS, PUBLIC_CREATES_PER_MINUTE, RELAYED, ROOMS_KEPT_FOR_THIS_MACHINE, THIS_MACHINE,
  clientKey, createRoomLimits,
} from "../lib/roomLimits";
import { MAX_ROOMS } from "../lib/rooms";

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
  // The tunnel's header still comes first from this machine, and still counts for nothing from another device.
  expect(clientKey("127.0.0.1", { "cf-connecting-ip": "198.51.100.1", ...forwarded }, true)).toBe("via 198.51.100.1");
  expect(clientKey(LAN, { "cf-connecting-ip": "198.51.100.1" }, true)).toBe(LAN);
  expect(clientKey("127.0.0.1", {}, true)).toBe(THIS_MACHINE);
});

test("the shared budget only counts with the flag on, and never counts this machine", () => {
  let nowMs = 1_000_000;
  const off = createRoomLimits(() => nowMs, () => false);
  const on = createRoomLimits(() => nowMs, () => true);
  const made = (limits: typeof on): number => {
    let count = 0;
    // More callers than the shared budget has room for, one room each.
    for (let caller = 0; caller < PUBLIC_CREATES_PER_MINUTE + 10; caller += 1) if (limits.create(`via 198.51.100.${String(caller)}`) === 0) count += 1;
    return count;
  };
  expect(made(off)).toBe(PUBLIC_CREATES_PER_MINUTE + 10);
  expect(made(on)).toBe(PUBLIC_CREATES_PER_MINUTE);
  expect(on.create("via 203.0.113.99")).toBeGreaterThan(0);
  for (let index = 0; index < 100; index += 1) expect(on.create(THIS_MACHINE)).toBe(0);
  nowMs += MINUTE_MS;
  expect(on.create("via 203.0.113.99")).toBe(0);
});

test("flag on, over HTTP: one caller's rooms a minute, everybody's rooms a minute and the rooms alive at once are all capped", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const call = await serve("1");
  const create = async (address: string): Promise<number> => (await call("POST", "/api/rooms", { "X-Forwarded-For": address })).status;

  // One caller: CREATES_PER_MINUTE a minute. Past MAX_ROOMS_PER_CLIENT each new room takes the place of an empty one it left.
  for (let index = 0; index < CREATES_PER_MINUTE; index += 1) expect(await create("203.0.113.7"), `room ${String(index)}`).toBe(200);
  expect(await create("203.0.113.7")).toBe(429);
  // Writing other addresses in front does not give a fresh budget: only the proxy's own entry counts.
  expect(await create("198.51.100.200, 203.0.113.7")).toBe(429);
  expect(await create("9.9.9.9,203.0.113.7")).toBe(429);
  // Another caller is not held back by the first.
  expect(await create("203.0.113.8")).toBe(200);

  // Everybody together: PUBLIC_CREATES_PER_MINUTE a minute, however many addresses they come from.
  vi.setSystemTime(Date.now() + MINUTE_MS);
  let made = 0;
  for (let caller = 0; made < PUBLIC_CREATES_PER_MINUTE; caller += 1) {
    for (let index = 0; index < MAX_ROOMS_PER_CLIENT && made < PUBLIC_CREATES_PER_MINUTE; index += 1, made += 1) {
      expect(await create(`198.51.100.${String(caller)}`), `caller ${String(caller)}`).toBe(200);
    }
  }
  expect(await create("192.0.2.1")).toBe(429);
  expect(await create("192.0.2.2")).toBe(429);
  // This machine is not part of that budget.
  expect((await call("POST", "/api/rooms")).status).toBe(200);

  // Rooms alive at once: strangers stop ROOMS_KEPT_FOR_THIS_MACHINE short of MAX_ROOMS, then get 503.
  // So far they hold MAX_ROOMS_PER_CLIENT + 1 + PUBLIC_CREATES_PER_MINUTE rooms; a minute on, new callers fill the rest.
  vi.setSystemTime(Date.now() + MINUTE_MS);
  const room = MAX_ROOMS - ROOMS_KEPT_FOR_THIS_MACHINE - (MAX_ROOMS_PER_CLIENT + 1 + PUBLIC_CREATES_PER_MINUTE);
  expect(room).toBeGreaterThan(0);
  expect(room).toBeLessThan(PUBLIC_CREATES_PER_MINUTE);
  for (let index = 0; index < room; index += 1) expect(await create(`192.0.2.${String(index)}`), `filling ${String(index)}`).toBe(200);
  const full = await call("POST", "/api/rooms", { "X-Forwarded-For": "192.0.2.250" });
  expect(full.status).toBe(503);
  expect(await full.json()).toEqual({ error: "too_many_rooms" });
  // The rooms kept back are still there for the machine that runs the server.
  expect((await call("POST", "/api/rooms")).status).toBe(200);
});
