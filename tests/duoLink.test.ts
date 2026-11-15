// Two players on one camera: two bodies give two inputs of their own, and player two's strikes and defends reach
// the fight through the same link the online rooms use. The fight is the real engine; the bodies are made up.
import { afterEach, expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { CombatEvent, CombatInput, CombatState, PoseFrame, Strike } from "../src/core/types";
import { createDuoLink } from "../src/duo/duoLink";
import type { DuoOptions } from "../src/duo/duoLink";
import { STANCE_FRAMES, createBodyReader } from "../src/duo/split";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";
import { TOGETHER_MS, forTwo } from "../src/net/host";
import type { HostLink } from "../src/net/host";
import { STYLES } from "../src/styles/registry";
import { GOOD } from "./helpers/ghostCopy";
import { need } from "./helpers/need";
import { DOWN, NEUTRAL, frameOf, pose, sequence } from "./helpers/poses";

const FRAME_MS = 33;
const enemy = need(ENEMIES.find((e) => e.id === "polyphemus"));
const style = need(STYLES.find((s) => s.id === "boxer"));

/** The same frame with the body moved across the picture, as a player standing to one side is. */
function shifted(frame: PoseFrame, dx: number, t = frame.t): PoseFrame {
  return { t, world: frame.world, image: frame.image.map((p) => ({ ...p, x: p.x + dx })) };
}

/** A made-up body at one side of the picture: it stands still until it is told to do a move. */
function puppet(dx: number) {
  let queue: PoseFrame[] = [];
  return {
    /** Does the move from the next frame on. */
    perform(move: string): void { queue = sequence(need(GOOD[move])).slice(20); },
    frame(t: number): PoseFrame { return shifted(queue.shift() ?? frameOf(t, NEUTRAL), dx, t); },
    busy: () => queue.length > 0,
  };
}

const links: HostLink[] = [];
afterEach(() => { links.splice(0).forEach((link) => { link.close(); }); });

/** A fight run the way FightScreen runs it, with player two's body on the link and player one on made-up keys. */
function fight(options: DuoOptions = {}) {
  const second = puppet(0.2);
  let now = 0;
  let players: 1 | 2 = 2;
  let frame: PoseFrame | null = null;
  const link = createDuoLink({ second: () => frame, players: () => players }, MOVES, { ...options, clock: () => now });
  links.push(link);
  let state: CombatState = forTwo(startFight(enemy, 7));
  link.start(enemy.id, style.id, 7);
  const events: CombatEvent[] = [];
  return {
    second,
    state: () => state,
    events,
    setPlayers(next: 1 | 2): void { players = next; },
    /** One frame. `own` is what player one does on it. Returns what happened. */
    tick(own: { held?: readonly string[]; struck?: readonly string[] } = {}): readonly CombatEvent[] {
      now += FRAME_MS;
      frame = players === 2 ? second.frame(now) : null;
      const local: CombatInput = {
        held: new Set(own.held ?? []),
        struck: (own.struck ?? []).map((move): Strike => ({ move, quality: 0.7, player: 0 })),
      };
      const input = link.guestHere() ? link.takeInput(local, now) : local;
      const result = step(state, enemy, style, input, FRAME_MS);
      state = result.state;
      link.publish(state, result.events, now);
      events.push(...result.events);
      return result.events;
    },
    link,
  };
}

type Fight = ReturnType<typeof fight>;

/** Runs frames until `done` says so, at most `max` of them. Returns every event of those frames. */
function until(f: Fight, done: (events: readonly CombatEvent[]) => boolean, own: () => Parameters<Fight["tick"]>[0] = () => ({}), max = 400): CombatEvent[] {
  const all: CombatEvent[] = [];
  for (let i = 0; i < max; i++) {
    const events = f.tick(own());
    all.push(...events);
    if (done(events)) return all;
  }
  throw new Error(`nothing after ${String(max)} frames; phase ${f.state().phase.kind}`);
}

const has = (type: CombatEvent["type"]) => (events: readonly CombatEvent[]): boolean => events.some((event) => event.type === type);

/** The counter of the attack that is coming. */
function counterOf(f: Fight): string {
  const phase = f.state().phase;
  if (phase.kind !== "defend") throw new Error(`not a defend phase: ${phase.kind}`);
  return phase.attack.counter;
}

/** Both players make the defend the attack asks for; returns once the monster is open. */
function defendTogether(f: Fight): string {
  until(f, has("telegraph"));
  const counter = counterOf(f);
  f.second.perform(counter);
  let frames = 0;
  const events = until(f, (now) => has("opening")(now) || has("playerHit")(now), () => (++frames > 8 ? { held: [counter] } : {}));
  expect(events.map((event) => event.type)).toContain("defended");
  const phase = f.state().phase;
  if (phase.kind !== "strike") throw new Error("the monster is not open");
  return phase.move;
}

test("two bodies in one picture give two inputs of their own", () => {
  const left = createBodyReader(MOVES);
  const right = createBodyReader(MOVES);
  const middle = createBodyReader(MOVES);
  const jab = sequence(need(GOOD.jab));
  const leftStruck: string[] = [];
  const rightStruck: string[] = [];
  const middleStruck: string[] = [];
  let rightHeld = false;
  jab.forEach((frame) => {
    // The left body only stands; the right body, 0.4 of the picture away, throws the jab.
    leftStruck.push(...left.read(shifted(frameOf(frame.t, NEUTRAL), -0.2)).struck.map((s) => s.move));
    const input = right.read(shifted(frame, 0.2));
    rightStruck.push(...input.struck.map((s) => s.move));
    rightHeld ||= input.held.size > 0;
    middleStruck.push(...middle.read(frame).struck.map((s) => s.move));
  });
  expect(leftStruck).toEqual([]);
  expect(rightStruck).toContain("jab");
  // Standing to one side changes nothing: the body reads exactly as it would alone in the middle of the picture,
  // and being 0.2 to the right is not a dodge, because each body is measured against its own place.
  expect(rightStruck).toEqual(middleStruck);
  expect(rightHeld).toBe(false);
  // The same frame twice is read once, and no frame is nobody.
  expect(right.read(shifted(need(jab.at(-1)), 0.2)).struck).toEqual([]);
  expect(right.read(null)).toEqual({ held: new Set(), struck: [] });
});

test("a body that left and one that comes much later do not share a history", () => {
  const reader = createBodyReader(MOVES);
  sequence(need(GOOD.jab)).forEach((frame) => { reader.read(frame); });
  expect(reader.history().frames.length).toBeGreaterThan(5);
  reader.read(frameOf(60_000, NEUTRAL));
  expect(reader.history().frames).toHaveLength(1);
  expect(reader.history().baseline).toBeNull();
});

test("player two's strike reaches the fight through the link and hurts the monster", () => {
  const f = fight();
  const move = defendTogether(f);
  const before = f.state().enemyHp;
  f.second.perform(move);
  const events = until(f, (now) => has("enemyHit")(now) || has("whiffed")(now));
  const hit = events.find((event) => event.type === "enemyHit");
  expect(hit).toMatchObject({ type: "enemyHit", move });
  expect(hit && "together" in hit).toBe(false);
  expect(f.state().enemyHp).toBeLessThan(before);
});

test("both players landing the prompted strike in the same window hit twice as hard", () => {
  const f = fight();
  const move = defendTogether(f);
  f.second.perform(move);
  let frames = 0;
  // Player one strikes a few frames in; player two's body finishes the same strike a moment later.
  const events = until(f, (now) => has("enemyHit")(now) || has("whiffed")(now), () => (++frames === 3 ? { struck: [move] } : {}));
  const hit = events.find((event) => event.type === "enemyHit");
  expect(hit).toMatchObject({ type: "enemyHit", move, together: true });

  // The same strike by player one alone, at the same point of another fight, does half of it or less.
  const alone = fight();
  const sameMove = defendTogether(alone);
  expect(sameMove).toBe(move);
  alone.second.perform(move);
  const soloHit = until(alone, (now) => has("enemyHit")(now) || has("whiffed")(now)).find((event) => event.type === "enemyHit");
  if (hit?.type !== "enemyHit" || soloHit?.type !== "enemyHit") throw new Error("no hit");
  expect(hit.damage).toBeGreaterThanOrEqual(Math.round(soloHit.damage * 1.9));
});

test("each player defends for themself: the attack lands when either one misses the defend", () => {
  // Only player one defends.
  const one = fight();
  until(one, has("telegraph"));
  const counter = counterOf(one);
  const first = until(one, (now) => has("defended")(now) || has("playerHit")(now), () => ({ held: [counter] }));
  expect(first.map((event) => event.type)).toContain("playerHit");
  // Only player two defends.
  const two = fight();
  until(two, has("telegraph"));
  two.second.perform(counterOf(two));
  const second = until(two, (now) => has("defended")(now) || has("playerHit")(now));
  expect(second.map((event) => event.type)).toContain("playerHit");
  // Both do: no hit.
  const both = fight();
  defendTogether(both);
  expect(both.events.map((event) => event.type)).not.toContain("playerHit");
  expect(both.state().playerHp).toBe(100);
});

test("with defend set to \"first\" only player one defends, as in an online room", () => {
  const f = fight({ defend: "first" });
  until(f, has("telegraph"));
  const counter = counterOf(f);
  let frames = 0;
  const events = until(f, (now) => has("defended")(now) || has("playerHit")(now), () => (++frames > 8 ? { held: [counter] } : {}));
  expect(events.map((event) => event.type)).toContain("defended");
});

test("player two leaving: the fight goes on with one player at once, and player one's strike still lands", () => {
  const f = fight();
  const move = defendTogether(f);
  // Player one strikes; the link holds it a moment for player two's. Then player two walks out.
  expect(f.tick({ struck: [move] })).toEqual([]);
  f.setPlayers(1);
  const events = until(f, (now) => has("enemyHit")(now) || has("whiffed")(now), undefined, Math.ceil(TOGETHER_MS / FRAME_MS) + 2);
  expect(events.find((event) => event.type === "enemyHit")).toMatchObject({ move });
  // After that nothing waits on the link: it says the guest is gone, and player one defends alone.
  until(f, has("telegraph"));
  expect(f.link.guestHere()).toBe(false);
  const counter = counterOf(f);
  let frames = 0;
  const alone = until(f, (now) => has("defended")(now) || has("playerHit")(now), () => (++frames > 8 ? { held: [counter] } : {}));
  expect(alone.map((event) => event.type)).toContain("defended");
  // And player one's next strike lands on the frame it is thrown: nothing is held back for a player who is gone.
  const phase = f.state().phase;
  if (phase.kind !== "strike") throw new Error("the monster is not open");
  expect(f.tick({ struck: [phase.move] }).map((event) => event.type)).toContain("enemyHit");
});

test("a body that has not joined yet cannot strike", () => {
  const frames = sequence(need(GOOD.jab));
  let frame: PoseFrame | null = null;
  let now = 0;
  const link = createDuoLink({ second: () => frame, players: () => 1 }, MOVES, { clock: () => now });
  links.push(link);
  const struck: Strike[] = [];
  for (let i = 0; i < frames.length + 20; i++) {
    frame = frames[i] ?? frame;
    now = i * FRAME_MS;
    expect(link.guestHere()).toBe(false);
    struck.push(...link.takeInput({ held: new Set(), struck: [] }, now).struck);
  }
  expect(struck).toEqual([]);
});

/** What a reader says a body holds on each frame of standing, dodging to its left, and standing again, at `fps`. */
function dodgeAt(fps: number, standMs: number, reader = createBodyReader(MOVES), from = 0): { during: boolean[]; after: boolean[]; t: number } {
  const step = 1000 / fps;
  let t = from;
  const feed = (ms: number, dx: number): boolean[] => {
    const out: boolean[] = [];
    for (const end = t + ms; t < end; t += step) out.push(reader.read(shifted(frameOf(t, pose(DOWN, DOWN, dx, 0)), 0.2)).held.has("dodge_left"));
    return out;
  };
  feed(standMs, 0);
  const during = feed(600, -0.12);
  const after = feed(1200, 0).slice(Math.ceil(fps / 2));
  return { during, after, t };
}

test("player two's stance is taken from their first frames, also on a camera slower than 20 pictures a second", () => {
  // 15 a second never puts 20 frames inside one second, which is what the shared history waits for.
  for (const fps of [30, 15, 10]) {
    const { during, after } = dodgeAt(fps, 1000);
    expect(during.at(-1), `${String(fps)} fps: the dodge is read`).toBe(true);
    expect(after.some(Boolean), `${String(fps)} fps: standing again is not a dodge`).toBe(false);
  }
});

test("player two's stance is not taken in the middle of a move", () => {
  // The pictures come slowly while the player stands and dodges, then fast: the moment the shared history would
  // have taken the stance (20 frames inside a second) falls inside a later dodge. Seen in the smoke run: standing
  // still then read as the opposite dodge, and a defend made by player one alone counted for both.
  const reader = createBodyReader(MOVES);
  const slow = dodgeAt(15, 1000, reader);
  expect(reader.history().baseline?.centerX).toBeCloseTo(0.7, 3);
  const fast = dodgeAt(30, 100, reader, slow.t);
  expect(fast.during.at(-1)).toBe(true);
  expect(fast.after.some(Boolean)).toBe(false);
  expect(reader.history().baseline?.centerX).toBeCloseTo(0.7, 3);
  // Standing, they hold no dodge either way.
  const still = reader.read(shifted(frameOf(fast.t + 33, NEUTRAL), 0.2));
  expect([...still.held]).toEqual([]);
});

test("a stance asked for before the reader has frames is taken from the next ones", () => {
  const reader = createBodyReader(MOVES);
  reader.settle();
  for (let i = 0; i < STANCE_FRAMES - 1; i++) reader.read(shifted(frameOf(i * 66, NEUTRAL), 0.2));
  expect(reader.history().baseline).toBeNull();
  reader.read(shifted(frameOf(STANCE_FRAMES * 66, NEUTRAL), 0.2));
  expect(reader.history().baseline?.centerX).toBeCloseTo(0.7, 3);
});
