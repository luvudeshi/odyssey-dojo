// The relay's limits on their own, on a clock the test moves: who a request counts against, and each budget.
import { expect, test } from "vitest";
import {
  CREATES_PER_MINUTE, MAX_ROOMS_PER_CLIENT, MAX_STREAMS_PER_CLIENT, MINUTE_MS, ROOMS_HELD_RETRY_S, THIS_MACHINE,
  WRONG_CODES_PER_MINUTE, clientKey, createRoomLimits,
} from "../lib/roomLimits";
import { IDLE_MS, SENDS_PER_SECOND, createRoomStore } from "../lib/rooms";

test("a request counts against its socket address, or against the tunnel's header when it comes from this machine", () => {
  expect(clientKey("192.168.1.7", {})).toBe("192.168.1.7");
  // Another device cannot pick its own key by sending the header.
  expect(clientKey("192.168.1.7", { "cf-connecting-ip": "203.0.113.9" })).toBe("192.168.1.7");
  for (const loopback of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    expect(clientKey(loopback, {})).toBe(THIS_MACHINE);
    expect(clientKey(loopback, { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" })).toBe("via 203.0.113.9");
  }
  // Only the entry the nearest proxy added is believed.
  expect(clientKey("::1", { "x-forwarded-for": "10.0.0.1, 203.0.113.9" })).toBe("via 203.0.113.9");
  expect(clientKey("::1", { "x-forwarded-for": " , " })).toBe(THIS_MACHINE);
  expect(clientKey(undefined, {})).toBe("unknown");
});

test("a client creates six rooms a minute and holds three; this machine is never refused", () => {
  let now = 5_000;
  const limits = createRoomLimits(() => now);
  for (let index = 0; index < CREATES_PER_MINUTE; index += 1) expect(limits.create("a", 0)).toBe(0);
  expect(limits.create("a", 0)).toBe(60);
  expect(limits.create("b", 0)).toBe(0);
  now += MINUTE_MS - 1_500;
  expect(limits.create("a", 0)).toBe(2);
  now += 1_500;
  expect(limits.create("a", MAX_ROOMS_PER_CLIENT - 1)).toBe(0);
  expect(limits.create("a", MAX_ROOMS_PER_CLIENT)).toBe(ROOMS_HELD_RETRY_S);
  for (let index = 0; index < 100; index += 1) expect(limits.create(THIS_MACHINE, 50)).toBe(0);

  // The store says how many rooms a client holds, and an expired room is no longer held.
  const store = createRoomStore(() => now);
  for (const owner of ["a", "a", "b"]) store.create(owner);
  expect([store.heldBy("a"), store.heldBy("b"), store.heldBy("c")]).toEqual([2, 1, 0]);
  now += IDLE_MS;
  expect(store.heldBy("a")).toBe(0);
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

test("a client holds eight streams, and a stream that closes gives its place back once", () => {
  const limits = createRoomLimits();
  const held = Array.from({ length: MAX_STREAMS_PER_CLIENT }, () => limits.openStream("a"));
  expect(held.every((release) => release !== null)).toBe(true);
  expect(limits.openStream("a")).toBeNull();
  expect(limits.openStream("b")).not.toBeNull();
  held[0]?.();
  held[0]?.();
  expect(limits.openStream("a")).not.toBeNull();
  expect(limits.openStream("a")).toBeNull();
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
