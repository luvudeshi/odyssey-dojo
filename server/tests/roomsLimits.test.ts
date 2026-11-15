// The relay's limits on their own, on a clock the test moves: who a request counts against, and each budget.
import { expect, test } from "vitest";
import { createServer } from "node:http";
import {
  CREATES_PER_MINUTE, HEADERS_TIMEOUT_MS, MAX_STREAMS_PER_CLIENT, MINUTE_MS, RELAYED, REQUEST_TIMEOUT_MS, THIS_MACHINE,
  WRONG_CODES_PER_MINUTE, clientKey, createRoomLimits, limitSlowRequests, network,
} from "../lib/roomLimits";
import { IDLE_MS, SENDS_PER_SECOND, createRoomStore } from "../lib/rooms";

test("a request counts against its socket address, or against Cloudflare's header when it comes from this machine", () => {
  expect(clientKey("192.168.1.7", {})).toBe("192.168.1.7");
  expect(clientKey("::ffff:192.168.1.7", {})).toBe("192.168.1.7");
  // Another device cannot pick its own key by sending the header.
  expect(clientKey("192.168.1.7", { "cf-connecting-ip": "203.0.113.9" })).toBe("192.168.1.7");
  for (const loopback of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    expect(clientKey(loopback, {})).toBe(THIS_MACHINE);
    expect(clientKey(loopback, { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" })).toBe("via 203.0.113.9");
    // Headers the caller can write are never read: whatever they say, such requests share one key.
    for (const name of ["x-real-ip", "x-forwarded-for", "forwarded", "true-client-ip", "via"]) {
      expect([clientKey(loopback, { [name]: "203.0.113.9" }), clientKey(loopback, { [name]: "198.51.100.1, 10.0.0.1" })], name).toEqual([RELAYED, RELAYED]);
    }
    expect(clientKey(loopback, { "cf-connecting-ip": " ", "x-real-ip": "203.0.113.9" })).toBe(RELAYED);
  }
  expect(clientKey(undefined, {})).toBe("unknown");
});

test("every address in one IPv6 /64 is the same caller, and an IPv4 address is its own", () => {
  const home = ["2001:db8:1:2::1", "2001:DB8:1:2::2", "2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd", "2001:db8:1:2:ffff::%en0"];
  expect(home.map(network)).toEqual(home.map(() => "2001:db8:1:2::/64"));
  expect(network("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
  expect([network("2001:db8::7"), network("::1"), network("fe80::1")]).toEqual(["2001:db8:0:0::/64", "0:0:0:0::/64", "fe80:0:0:0::/64"]);
  expect([network("203.0.113.9"), network("203.0.113.10"), network("::ffff:203.0.113.9")]).toEqual(["203.0.113.9", "203.0.113.10", "203.0.113.9"]);
  expect(clientKey("::1", { "cf-connecting-ip": home[0] })).toBe(clientKey("::1", { "cf-connecting-ip": home[2] }));
  expect(clientKey("2001:db8:1:2::9", {})).toBe("2001:db8:1:2::/64");
});

test("a client creates six rooms a minute; this machine is never refused", () => {
  let now = 5_000;
  const limits = createRoomLimits(() => now);
  for (let index = 0; index < CREATES_PER_MINUTE; index += 1) expect(limits.create("a")).toBe(0);
  expect(limits.create("a")).toBe(60);
  expect(limits.create("b")).toBe(0);
  now += MINUTE_MS - 1_500;
  expect(limits.create("a")).toBe(2);
  now += 1_500;
  expect(limits.create("a")).toBe(0);
  for (let index = 0; index < 100; index += 1) expect(limits.create(THIS_MACHINE)).toBe(0);
});

test("the store counts a client's rooms, and at the cap gives back the one nobody is connected to that was used longest ago", () => {
  let now = 0;
  const store = createRoomStore(() => now);
  const listener = { message: () => undefined, end: () => undefined };
  const made = ["a", "a", "a", "b"].map((owner) => {
    now += 1_000;
    const room = store.create(owner);
    if (room === null) throw new Error("no room");
    return room;
  });
  const [first, second, third] = made;
  if (first === undefined || second === undefined || third === undefined) throw new Error("no room");
  expect([store.heldBy("a"), store.heldBy("b"), store.heldBy("c")]).toEqual([3, 1, 0]);
  // Somebody is on the first and the third: the second goes, and only that one.
  const onFirst = store.attach(first.code, first.token, listener);
  const guest = store.join(third.code);
  if (typeof onFirst === "string" || typeof guest === "string") throw new Error("refused");
  store.attach(third.code, guest.token, listener);
  expect([store.freeOne("a"), store.heldBy("a"), store.heldBy("b")]).toEqual([0, 2, 1]);
  expect(store.send(second.code, second.token, {})).toBe("unknown");
  // Somebody on every room: nothing is removed, and the wait is until the one used longest ago would expire.
  now += 60_000;
  expect([store.freeOne("a"), store.heldBy("a")]).toEqual([IDLE_MS / 1000 - 60, 2]);
  onFirst.detach();
  expect([store.freeOne("a"), store.heldBy("a"), store.freeOne("nobody")]).toEqual([0, 1, 0]);
  // An expired room is no longer held.
  now += IDLE_MS;
  expect([store.heldBy("a"), store.heldBy("b")]).toEqual([0, 0]);
});

test("twenty wrong codes a minute, counted apart for joins and for sends and streams, and apart for each client", () => {
  let now = 0;
  const limits = createRoomLimits(() => now);
  for (let index = 0; index < WRONG_CODES_PER_MINUTE; index += 1) {
    expect(limits.wrongWait("a", "join")).toBe(0);
    limits.wrongCount("a", "join");
  }
  expect(limits.wrongWait("a", "join")).toBe(60);
  expect([limits.wrongWait("a", "member"), limits.wrongWait("b", "join")]).toEqual([0, 0]);
  now += MINUTE_MS;
  expect(limits.wrongWait("a", "join")).toBe(0);
});

test("a client holds eight streams, a seat's newer stream uses the same place, and the place comes back when the newest closes", () => {
  const limits = createRoomLimits();
  const held = Array.from({ length: MAX_STREAMS_PER_CLIENT }, (_, index) => limits.openStream("a", `seat ${String(index)}`));
  expect(held.every((release) => release !== null)).toBe(true);
  expect(limits.openStream("a", "one more")).toBeNull();
  expect(limits.openStream("b", "seat 0")).not.toBeNull();
  // At the cap a member can still reopen its own stream: that replaces, it does not add.
  const newer = limits.openStream("a", "seat 0");
  expect(newer).not.toBeNull();
  // The older stream closing gives nothing back, the newer one does, and only once.
  held[0]?.();
  expect(limits.openStream("a", "one more")).toBeNull();
  newer?.();
  newer?.();
  expect(limits.openStream("a", "one more")).not.toBeNull();
  expect(limits.openStream("a", "another")).toBeNull();
});

test("a request has 30 seconds to arrive and its headers 10", () => {
  const server = limitSlowRequests(createServer());
  expect([server.requestTimeout, server.headersTimeout]).toEqual([REQUEST_TIMEOUT_MS, HEADERS_TIMEOUT_MS]);
  expect([REQUEST_TIMEOUT_MS, HEADERS_TIMEOUT_MS]).toEqual([30_000, 10_000]);
});

test("a member's sends past the limit are slow, reach nobody, and do not keep the room alive", () => {
  let now = 1_000;
  const store = createRoomStore(() => now);
  const room = store.create();
  const guest = room === null ? "unknown" : store.join(room.code);
  if (room === null || typeof guest === "string") throw new Error("no room");
  const heard: unknown[] = [];
  store.attach(room.code, guest.token, { message: (message) => { heard.push(message); }, end: () => undefined });
  for (let index = 0; index < SENDS_PER_SECOND; index += 1) expect(store.send(room.code, room.token, { index })).toBe("sent");
  expect(store.send(room.code, room.token, { late: true })).toBe("slow");
  expect(heard).toHaveLength(SENDS_PER_SECOND);
  // The guest has its own count, and the host's starts again a second after its first send.
  expect(store.send(room.code, guest.token, {})).toBe("dropped");
  now += 999;
  expect(store.send(room.code, room.token, {})).toBe("slow");
  now += 1;
  expect(store.send(room.code, room.token, {})).toBe("sent");

  // A refused send is not use: thirty minutes after the last one that got through, the room is gone.
  for (let index = 0; index < SENDS_PER_SECOND; index += 1) store.send(room.code, room.token, {});
  now += 500;
  expect(store.send(room.code, room.token, {})).toBe("slow");
  now += IDLE_MS - 500;
  expect(store.send(room.code, room.token, {})).toBe("unknown");
});
