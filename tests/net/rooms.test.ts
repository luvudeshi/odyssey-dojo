// Online rooms, client side: the messages, the host and guest links over a made-up line, and the HTTP calls
// against a made-up relay that answers like server/routes/rooms.ts.
import { expect, test } from "vitest";
import { startFight, step } from "../../src/combat/engine";
import type { CombatInput, CombatState, EnemySpec, FightingStyle, Strike } from "../../src/core/types";
import { ENEMIES } from "../../src/enemies/registry";
import { createGuestLink } from "../../src/net/guest";
import { STATE_EVERY_MS, TOGETHER_MS, createHostLink, forTwo } from "../../src/net/host";
import { parseMessage } from "../../src/net/messages";
import type { NetMessage } from "../../src/net/messages";
import { cleanCode, createRoom, joinRoom, openRoom } from "../../src/net/transport";
import type { EventStream, NetDeps, RoomTransport } from "../../src/net/transport";
import { STYLES } from "../../src/styles/registry";

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}
const polyphemus: EnemySpec = need(ENEMIES.find((enemy) => enemy.id === "polyphemus"), "polyphemus");
const boxer: FightingStyle = need(STYLES.find((style) => style.id === "boxer"), "boxer");
const NOTHING: CombatInput = { held: new Set(), struck: [] };

/** Two ends of a line with no relay: what one sends, the other hears at once, after a trip through JSON. */
function line(): { host: RoomTransport; guest: RoomTransport; sent: NetMessage[] } {
  const sent: NetMessage[] = [];
  const ears: Record<"host" | "guest", ((message: NetMessage) => void)[]> = { host: [], guest: [] };
  const end = (self: "host" | "guest", other: "host" | "guest"): RoomTransport => ({
    send(message) {
      sent.push(message);
      const arrived = parseMessage(JSON.parse(JSON.stringify(message)));
      if (arrived) for (const ear of ears[other]) ear(arrived);
      return Promise.resolve(true);
    },
    onMessage(listener) {
      ears[self].push(listener);
    },
    close() {
      ears[self] = [];
    },
  });
  return { host: end("host", "guest"), guest: end("guest", "host"), sent };
}

/** Steps the fight in 20 ms frames until the engine asks for a strike. Returns the state and the clock. */
function untilStrike(state: CombatState, clock: number): { state: CombatState; clock: number } {
  let now = clock;
  let current = state;
  for (let i = 0; i < 2000 && current.phase.kind !== "strike"; i++) {
    const held = new Set(current.phase.kind === "defend" ? [current.phase.attack.counter] : []);
    current = step(current, polyphemus, boxer, { held, struck: [] }, 20).state;
    now += 20;
  }
  if (current.phase.kind !== "strike") throw new Error("the fight never asked for a strike");
  return { state: current, clock: now };
}

test("messages: good ones pass cleaned, anything else is refused without throwing", () => {
  expect(parseMessage({ type: "strike", move: "jab", quality: 7 })).toEqual({ type: "strike", move: "jab", quality: 1 });
  expect(parseMessage({ type: "strike", move: "jab", quality: -3, extra: "x" })).toEqual({ type: "strike", move: "jab", quality: 0 });
  expect(parseMessage({ type: "peer", joined: true })).toEqual({ type: "peer", joined: true });
  expect(parseMessage({ type: "end", won: false })).toEqual({ type: "end", won: false });
  expect(parseMessage({ type: "start", enemyId: "circe", styleId: "boxer", seed: 4 })).toEqual({ type: "start", enemyId: "circe", styleId: "boxer", seed: 4 });
  const state = startFight(polyphemus, 1);
  expect(parseMessage({ type: "state", seq: 1, state, events: [] })).toEqual({ type: "state", seq: 1, state, events: [] });

  const bad: unknown[] = [
    null, 3, "strike", [], {}, { type: "nope" },
    { type: "strike", move: "", quality: 1 }, { type: "strike", move: "jab", quality: "1" },
    { type: "strike", move: "jab", quality: Number.NaN }, { type: "strike", move: "x".repeat(65), quality: 1 },
    { type: "held", moves: "block" }, { type: "held", moves: Array.from({ length: 9 }, () => "block") }, { type: "held", moves: [1] },
    { type: "start", enemyId: "circe", styleId: "boxer" }, { type: "peer", joined: "yes" }, { type: "end" },
    { type: "state", seq: 1, state: null, events: [] }, { type: "state", seq: "1", state, events: [] },
    { type: "state", seq: 1, state: { ...state, enemyHp: "lots" }, events: [] },
    { type: "state", seq: 1, state: { ...state, phase: { kind: "dancing" } }, events: [] },
    { type: "state", seq: 1, state: { ...state, phase: { kind: "strike", msLeft: 1, totalMs: 1 } }, events: [] },
    { type: "state", seq: 1, state: { ...state, players: 3 }, events: [] },
    { type: "state", seq: 1, state, events: [7] }, { type: "state", seq: 1, state, events: Array.from({ length: 33 }, () => ({ type: "whiffed" })) },
  ];
  for (const value of bad) expect(parseMessage(value), JSON.stringify(value)).toBeNull();
});

test("a guest strike and a host strike a moment apart land together and do double damage", () => {
  const solo = untilStrike(startFight(polyphemus, 3), 0);
  const move = solo.state.phase.kind === "strike" ? solo.state.phase.move : "";
  const alone = step(solo.state, polyphemus, boxer, { held: new Set(), struck: [{ move, quality: 0.7, player: 0 }] }, 20);
  const aloneDamage = solo.state.enemyHp - alone.state.enemyHp;
  expect(aloneDamage).toBeGreaterThan(0);

  const wire = line();
  const host = createHostLink(wire.host);
  const guest = createGuestLink(wire.guest);
  let { state, clock } = untilStrike(forTwo(startFight(polyphemus, 3)), 0);
  // The guest strikes first; the host player strikes 200 ms later.
  guest.sendInput({ held: new Set(), struck: [{ move, quality: 0.7, player: 0 }] });
  for (let i = 0; i < 10; i++) {
    const input = host.takeInput(NOTHING, clock);
    expect(input.struck, "the guest strike waits for the host").toEqual([]);
    state = step(state, polyphemus, boxer, input, 20).state;
    clock += 20;
  }
  const before = state.enemyHp;
  const both = host.takeInput({ held: new Set(), struck: [{ move, quality: 0.7, player: 0 }] }, clock);
  expect(both.struck.map((strike) => strike.player).sort()).toEqual([0, 1]);
  state = step(state, polyphemus, boxer, both, 20).state;
  // The engine rounds after doubling, so twice the rounded single hit can be one point off.
  expect(Math.abs(before - state.enemyHp - aloneDamage * 2)).toBeLessThanOrEqual(1);
  expect(before - state.enemyHp).toBeGreaterThan(aloneDamage * 1.8);
  expect(host.takeInput(NOTHING, clock + 20).struck).toEqual([]);
});

test("a strike nobody joins is released alone after the wait, and a different move does not pair with it", () => {
  const wire = line();
  const host = createHostLink(wire.host);
  const guest = createGuestLink(wire.guest);
  const jab: Strike = { move: "jab", quality: 0.6, player: 0 };
  expect(host.takeInput({ held: new Set(["block"]), struck: [jab] }, 1000)).toEqual({ held: new Set(["block"]), struck: [] });
  guest.sendInput({ held: new Set(), struck: [{ move: "hook", quality: 0.9, player: 0 }] });
  expect(host.takeInput(NOTHING, 1200).struck).toEqual([]);
  expect(host.takeInput(NOTHING, 1000 + TOGETHER_MS).struck).toEqual([jab]);
  expect(host.takeInput(NOTHING, 1200 + TOGETHER_MS).struck).toEqual([{ move: "hook", quality: 0.9, player: 1 }]);
  // A guest cannot claim to be player 0, and a flood of strikes is cut off.
  for (let i = 0; i < 100; i++) guest.sendInput({ held: new Set(), struck: [jab] });
  const flood = host.takeInput(NOTHING, 5000 + TOGETHER_MS * 2);
  expect(flood.struck.length).toBe(0);
  const later = host.takeInput(NOTHING, 5000 + TOGETHER_MS * 3);
  expect(later.struck.length).toBeLessThanOrEqual(16);
  expect(later.struck.every((strike) => strike.player === 1)).toBe(true);
});

test("the guest sees the host's whole fight: start, states in order, every event once, and the result", () => {
  const wire = line();
  const host = createHostLink(wire.host);
  const guest = createGuestLink(wire.guest);
  expect(guest.fight()).toBeNull();
  expect(guest.view()).toBeNull();
  host.start("polyphemus", "boxer", 9);
  expect(guest.fight()).toEqual({ enemyId: "polyphemus", styleId: "boxer", seed: 9 });

  let state = forTwo(startFight(polyphemus, 9));
  let clock = 0;
  const hostEvents: string[] = [];
  const guestEvents: string[] = [];
  for (let i = 0; i < 200000 && state.phase.kind !== "won" && state.phase.kind !== "lost"; i++) {
    const phase = state.phase;
    const held = new Set(phase.kind === "defend" ? [phase.attack.counter] : []);
    const wanted = phase.kind === "strike" || phase.kind === "finisher" ? phase.move : null;
    const mine: Strike[] = wanted === null ? [] : [{ move: wanted, quality: 0.8, player: 0 }];
    if (wanted !== null) guest.sendInput({ held: new Set(), struck: mine });
    const result = step(state, polyphemus, boxer, host.takeInput({ held, struck: mine }, clock), 20);
    state = result.state;
    clock += 20;
    host.publish(state, result.events, clock);
    for (const event of result.events) hostEvents.push(event.type);
    const seen = guest.view();
    for (const event of seen?.events ?? []) guestEvents.push(event.type);
    if (i % 50 === 0 && seen) expect(Math.abs(seen.state.enemyHp - state.enemyHp)).toBeLessThanOrEqual(polyphemus.hp);
  }
  expect(state.phase.kind).toBe("won");
  expect(guest.view()?.state).toEqual(state);
  expect(guestEvents).toEqual(hostEvents);
  expect(guest.result()).toBe(true);

  // About 15 states a second, not one per frame, and numbered upward with no gaps.
  const states = wire.sent.filter((message) => message.type === "state");
  expect(states.length).toBeLessThan((clock / STATE_EVERY_MS) * 1.5);
  expect(states.length).toBeGreaterThan(clock / STATE_EVERY_MS / 2);
  expect(states.map((message) => message.seq)).toEqual(states.map((_, index) => index + 1));
  expect(wire.sent.filter((message) => message.type === "end")).toEqual([{ type: "end", won: true }]);
  // Nothing more goes out once the fight is over.
  const total = wire.sent.length;
  host.publish(state, [], clock + 1000);
  expect(wire.sent.length).toBe(total);
});

test("the guest never goes back to an older state, and a new start clears the last fight", () => {
  const ears: ((message: NetMessage) => void)[] = [];
  const guest = createGuestLink({ send: () => Promise.resolve(true), onMessage: (listener) => ears.push(listener), close: () => undefined });
  const tell = (message: NetMessage) => { for (const ear of ears) ear(message); };
  const first = startFight(polyphemus, 1);
  const second = { ...first, enemyHp: first.enemyHp - 20 };
  expect(guest.hostHere()).toBe(false);
  tell({ type: "peer", joined: true });
  expect(guest.hostHere()).toBe(true);
  tell({ type: "state", seq: 2, state: second, events: [{ type: "whiffed" }] });
  tell({ type: "state", seq: 1, state: first, events: [{ type: "won" }] });
  tell({ type: "state", seq: 2, state: first, events: [{ type: "won" }] });
  expect(guest.view()).toEqual({ state: second, events: [{ type: "whiffed" }] });
  expect(guest.view()).toEqual({ state: second, events: [] });
  tell({ type: "end", won: false });
  expect(guest.result()).toBe(false);
  tell({ type: "start", enemyId: "circe", styleId: "karate", seed: 2 });
  expect(guest.result()).toBeNull();
  expect(guest.view()).toBeNull();
  tell({ type: "state", seq: 1, state: first, events: [] });
  expect(guest.view()?.state).toEqual(first);
});

/** A made-up relay that answers like the real one, for one room. */
function relay(): { deps: NetDeps; calls: string[]; streams: { url: string; stream: EventStream; closed: boolean }[]; push(index: number, data: unknown): void } {
  const calls: string[] = [];
  const streams: { url: string; stream: EventStream; closed: boolean }[] = [];
  let guestToken: string | null = null;
  const answer = (status: number, data: unknown) => Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(data) });
  const deps: NetDeps = {
    fetch(url, init) {
      calls.push(`${init.method} ${url} ${init.body ?? ""}`);
      if (url.endsWith("/api/rooms")) return answer(200, { code: "KXTR", token: "host-token" });
      if (url.endsWith("/api/rooms/KXTR/join")) {
        if (guestToken) return answer(409, { error: "room_full" });
        guestToken = "guest-token";
        return answer(200, { token: guestToken });
      }
      if (url.endsWith("/join")) return answer(404, { error: "unknown_room" });
      if (url.endsWith("/api/rooms/KXTR/send")) return answer(200, { delivered: streams.length > 1 });
      return Promise.reject(new Error("network down"));
    },
    openStream(url) {
      const entry = { url, stream: { onmessage: null, close: () => { entry.closed = true; } } as EventStream, closed: false };
      streams.push(entry);
      return entry.stream;
    },
  };
  return { deps, calls, streams, push: (index, data) => streams[index]?.stream.onmessage?.({ data }) };
}

test("the HTTP calls: create, join, a stream that only passes good messages, and send", async () => {
  const fake = relay();
  expect(cleanCode(" kx-tr 9")).toBe("KXTR");
  const made = await createRoom(fake.deps, "http://host:8787");
  expect(made).toEqual({ code: "KXTR", token: "host-token" });
  expect(await joinRoom(fake.deps, "zzzz")).toBe("unknown_room");
  expect(await joinRoom(fake.deps, " ")).toBe("unknown_room");
  expect(await joinRoom(fake.deps, "kxtr")).toEqual({ code: "KXTR", token: "guest-token" });
  expect(await joinRoom(fake.deps, "KXTR")).toBe("room_full");

  const host = openRoom(fake.deps, { code: "KXTR", token: "host token/1" }, "http://host:8787");
  expect(fake.streams[0]?.url).toBe("http://host:8787/api/rooms/KXTR/events?token=host%20token%2F1");
  const heard: NetMessage[] = [];
  host.onMessage((message) => heard.push(message));
  fake.push(0, JSON.stringify({ type: "peer", joined: true }));
  fake.push(0, "not json");
  fake.push(0, JSON.stringify({ type: "strike", move: "jab" }));
  fake.push(0, 42);
  fake.push(0, JSON.stringify({ type: "strike", move: "jab", quality: 0.5 }));
  expect(heard).toEqual([{ type: "peer", joined: true }, { type: "strike", move: "jab", quality: 0.5 }]);

  expect(await host.send({ type: "end", won: true })).toBe(false);
  openRoom(fake.deps, { code: "KXTR", token: "guest-token" }, "http://host:8787");
  expect(await host.send({ type: "end", won: true })).toBe(true);
  expect(fake.calls.at(-1)).toBe('POST http://host:8787/api/rooms/KXTR/send {"token":"host token/1","message":{"type":"end","won":true}}');
  host.close();
  expect(fake.streams[0]?.closed).toBe(true);
  fake.push(0, JSON.stringify({ type: "peer", joined: false }));
  expect(heard.length).toBe(2);
});

test("a relay that cannot be reached is an answer, not an exception", async () => {
  const down: NetDeps = { fetch: () => Promise.reject(new Error("offline")), openStream: () => ({ onmessage: null, close: () => undefined }) };
  expect(await createRoom(down)).toBe("unreachable");
  expect(await joinRoom(down, "KXTR")).toBe("unreachable");
  expect(await openRoom(down, { code: "KXTR", token: "t" }).send({ type: "end", won: true })).toBe(false);
  const full: NetDeps = { ...down, fetch: () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ error: "too_many_rooms" }) }) };
  expect(await createRoom(full)).toBe("too_many_rooms");
  const odd: NetDeps = { ...down, fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error("not json")) }) };
  expect(await createRoom(odd)).toBe("unreachable");
});
