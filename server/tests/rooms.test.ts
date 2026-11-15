// The room store on its own: codes and tokens, who hears what, and expiry on a clock the test moves.
import { expect, test } from "vitest";
import { IDLE_MS, MAX_ROOMS, createRoomStore } from "../lib/rooms";
import type { Attached, Listener, RelayMessage, RoomStore } from "../lib/rooms";

interface Ear { readonly listener: Listener; readonly heard: RelayMessage[]; ended: number }

function ear(): Ear {
  const made: Ear = {
    heard: [],
    ended: 0,
    listener: { message: (message) => { made.heard.push(message); }, end: () => { made.ended += 1; } },
  };
  return made;
}

function open(store: RoomStore): { code: string; host: string; guest: string } {
  const room = store.create();
  const joined = room === null ? "unknown" : store.join(room.code.toLowerCase());
  if (room === null || typeof joined === "string") throw new Error("no room");
  return { code: room.code, host: room.token, guest: joined.token };
}

function attach(store: RoomStore, code: string, token: string, to: Ear): Attached {
  const attached = store.attach(code, token, to.listener);
  if (typeof attached === "string") throw new Error(attached);
  return attached;
}

test("a room has a four-letter code with no look-alikes, random tokens, and room for one guest; the server holds fifty", () => {
  const store = createRoomStore();
  const { code, host, guest } = open(store);
  expect(code).toMatch(/^[A-HJKMNP-Z]{4}$/);
  for (const token of [host, guest]) expect(token).toMatch(/^[\w-]{24}$/);
  expect(host).not.toBe(guest);
  expect(store.join(code)).toBe("full");
  expect(store.join("ZZZZZ")).toBe("unknown");
  const codes = new Set([code]);
  for (let index = 1; index < MAX_ROOMS; index += 1) codes.add(store.create()?.code ?? "");
  expect(codes.size).toBe(MAX_ROOMS);
  expect(store.create()).toBeNull();
});

test("each member hears the other, in order and untouched, and nothing of its own", () => {
  const store = createRoomStore();
  const { code, host, guest } = open(store);
  const [hostEar, guestEar] = [ear(), ear()];
  expect(attach(store, code, host, hostEar).peerJoined).toBe(false);
  expect(attach(store, code.toLowerCase(), guest, guestEar).peerJoined).toBe(true);
  const strike = { type: "strike", move: "jab", quality: 0.9 };
  const state = { type: "state", seq: 1, state: { nested: [1, { deep: true }] }, events: [] };
  expect(store.send(code, guest, strike)).toBe("sent");
  expect(store.send(code, host, state)).toBe("sent");
  expect(store.send(code.toLowerCase(), host, { type: "end", won: true })).toBe("sent");
  expect(hostEar.heard).toEqual([{ type: "peer", joined: true }, strike]);
  expect(hostEar.heard[1]).toBe(strike);
  expect(guestEar.heard).toEqual([state, { type: "end", won: true }]);
});

test("a wrong token is denied, an unknown room is unknown, and neither reaches anyone", () => {
  const store = createRoomStore();
  const { code, host, guest } = open(store);
  const other = open(store);
  const hostEar = ear();
  attach(store, code, host, hostEar);
  for (const token of ["", "nope", other.host, other.guest, guest.slice(0, -1), `${guest}x`]) {
    expect(store.send(code, token, { type: "strike" }), token).toBe("denied");
    expect(store.attach(code, token, ear().listener), token).toBe("denied");
  }
  expect(store.send("QQQQQ", guest, {})).toBe("unknown");
  expect(store.attach("QQQQQ", guest, ear().listener)).toBe("unknown");
  expect(hostEar.heard).toEqual([]);
});

test("a member who leaves is reported, messages to an absent member are dropped, and a newer stream replaces the older", () => {
  const store = createRoomStore();
  const { code, host, guest } = open(store);
  const [hostEar, first, second] = [ear(), ear(), ear()];
  // The host listens before the guest does, and still hears the guest come and go.
  attach(store, code, host, hostEar);
  expect(store.send(code, host, { type: "start" })).toBe("dropped");
  const firstStream = attach(store, code, guest, first);
  const secondStream = attach(store, code, guest, second);
  expect([first.ended, second.ended]).toEqual([1, 0]);
  // The replaced stream closing afterwards must not look like the guest leaving.
  firstStream.detach();
  expect(hostEar.heard).toEqual([{ type: "peer", joined: true }]);
  expect(store.send(code, host, { type: "state", seq: 2 })).toBe("sent");
  expect([first.heard, second.heard]).toEqual([[], [{ type: "state", seq: 2 }]]);

  secondStream.detach();
  secondStream.detach();
  expect(hostEar.heard).toEqual([{ type: "peer", joined: true }, { type: "peer", joined: false }]);
  expect(store.send(code, host, { type: "state", seq: 3 })).toBe("dropped");
  expect(attach(store, code, guest, ear()).peerJoined).toBe(true);
});

test("a room idle for thirty minutes is removed and its streams are ended; use keeps a room alive", () => {
  let now = 1_000;
  const store = createRoomStore(() => now);
  const [busy, idle] = [open(store), open(store)];
  const [hostEar, guestEar] = [ear(), ear()];
  const stream = attach(store, idle.code, idle.host, hostEar);
  attach(store, idle.code, idle.guest, guestEar);

  now += IDLE_MS - 1;
  expect(store.send(busy.code, busy.guest, { type: "strike" })).toBe("dropped");
  expect(store.size()).toBe(2);
  now += 1;
  store.sweep();
  expect(store.size()).toBe(1);
  expect([hostEar.ended, guestEar.ended]).toEqual([1, 1]);
  // The ended stream detaching tells nobody, and the code no longer opens anything.
  stream.detach();
  expect(guestEar.heard).toEqual([]);
  expect(store.send(idle.code, idle.host, {})).toBe("unknown");
  expect(store.join(idle.code)).toBe("unknown");
  // An expired room gives its place back.
  now += IDLE_MS;
  for (let index = 0; index < MAX_ROOMS; index += 1) expect(store.create()).not.toBeNull();
  expect(store.create()).toBeNull();
});
