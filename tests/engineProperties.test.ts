// Seeded random fights against every enemy and style: the rules must hold on every step, not just on hand-made cases.
import { describe, expect, test } from "vitest";
import { PLAYER_HP, phaseIndexFor, startFight, step } from "../src/combat/engine";
import type {
  CombatEvent, CombatInput, CombatPhase, CombatState, EnemySpec, FightingStyle, Strike,
} from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";
import { STYLES } from "../src/styles/registry";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DTS = [0, 1, 7, 16, 33, 50, 120, 700, 1600, 7000, 1e12] as const;
const SKILLS = [0.2, 0.6, 0.95, 1] as const;
const MOVE_IDS = [...MOVES.keys(), "not_a_move"];
const DEFEND_IDS = [...MOVES.values()].filter((m) => m.kind === "defend").map((m) => m.id);
const MAX_TICKS = 20000;

function pickOf<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("empty list");
  return item;
}

/** Plays the phase the engine is in, well or badly, with junk mixed in. */
function inputFor(random: () => number, state: CombatState, enemy: EnemySpec, skill: number): CombatInput {
  const held = new Set<string>();
  const struck: Strike[] = [];
  for (const id of DEFEND_IDS) if (random() < 0.2) held.add(id);
  const phase = state.phase;
  if (phase.kind === "defend" && random() < skill) held.add(phase.attack.counter);
  const player = random() < 0.5 ? 0 : 1;
  const quality = random() * 1.2;
  if (phase.kind === "strike" && random() < skill) struck.push({ move: phase.move, quality, player });
  if (phase.kind === "finisher" && random() < 0.3) struck.push({ move: enemy.finisher ?? "", quality, player });
  if (state.players === 2 && phase.kind === "strike" && random() < skill) {
    struck.push({ move: phase.move, quality: random(), player: player === 0 ? 1 : 0 });
  }
  while (random() < 0.3) struck.push({ move: pickOf(random, MOVE_IDS), quality: random(), player: 0 });
  return { held, struck };
}

const NEXT: Record<CombatPhase["kind"], readonly CombatPhase["kind"][]> = {
  intro: ["intro", "defend"],
  recover: ["recover", "defend"],
  defend: ["defend", "strike", "recover", "lost"],
  strike: ["strike", "recover", "finisher", "won"],
  finisher: ["finisher", "won"],
  won: ["won"],
  lost: ["lost"],
};

const count = (events: readonly CombatEvent[], type: CombatEvent["type"]): number =>
  events.filter((event) => event.type === type).length;
const total = (mastery: Readonly<Record<string, number>>): number =>
  Object.values(mastery).reduce((sum, n) => sum + n, 0);

/** Every rule that must hold between two states one step apart. */
function check(
  prev: CombatState, next: CombatState, events: readonly CombatEvent[],
  enemy: EnemySpec, style: FightingStyle, input: CombatInput, dt: number,
): void {
  expect(next.playerHp).toBeGreaterThanOrEqual(0);
  expect(next.playerHp).toBeLessThanOrEqual(prev.playerHp);
  expect(next.playerHp).toBeLessThanOrEqual(PLAYER_HP);
  expect(next.enemyHp).toBeGreaterThanOrEqual(0);
  expect(next.enemyHp).toBeLessThanOrEqual(prev.enemyHp);
  expect(next.phaseIndex).toBeGreaterThanOrEqual(prev.phaseIndex);
  expect(next.phaseIndex).toBe(phaseIndexFor(enemy, next.enemyHp));
  expect(next.score).toBeGreaterThanOrEqual(prev.score);
  expect(next.combo).toBeGreaterThanOrEqual(0);
  for (const [move, n] of Object.entries(prev.mastery)) expect(next.mastery[move] ?? 0).toBeGreaterThanOrEqual(n);
  expect(NEXT[prev.phase.kind]).toContain(next.phase.kind);
  expect(count(events, "won") + count(events, "lost")).toBe(next.phase.kind === "won" || next.phase.kind === "lost" ? (prev.phase.kind === next.phase.kind ? 0 : 1) : 0);
  if (next.phase.kind === "won") expect(next.enemyHp).toBe(0);
  if (next.phase.kind === "lost") expect(next.playerHp).toBe(0);
  if (next.phase.kind === "finisher") {
    expect(next.enemyHp).toBe(0);
    expect(next.phase.move).toBe(enemy.finisher);
  }

  if (prev.phase.kind === "won" || prev.phase.kind === "lost") {
    expect(next).toBe(prev);
    expect(events).toEqual([]);
    return;
  }
  // Nothing happened: only the clock moved.
  if (events.length === 0) {
    expect(next.phase.kind).toBe(prev.phase.kind);
    expect(next).toEqual({ ...prev, phase: next.phase });
    if ("msLeft" in prev.phase && "msLeft" in next.phase) expect(next.phase.msLeft).toBe(prev.phase.msLeft - dt);
  }
  // Something happened: the state says the same thing as the events.
  for (const event of events) {
    switch (event.type) {
      case "telegraph":
        expect(enemy.attacks).toContain(event.attack);
        expect(next.phase.kind === "defend" && next.phase.attack === event.attack).toBe(true);
        break;
      case "defended":
        expect(prev.phase.kind === "defend" && prev.phase.attack === event.attack).toBe(true);
        expect(input.held.has(event.attack.counter)).toBe(true);
        expect(next.score).toBe(prev.score + 50);
        expect(next.mastery[event.attack.counter]).toBe((prev.mastery[event.attack.counter] ?? 0) + 1);
        break;
      case "playerHit":
        expect(prev.phase.kind === "defend" && prev.phase.attack === event.attack).toBe(true);
        expect(input.held.has(event.attack.counter)).toBe(false);
        expect(event.damage).toBe(event.attack.damage);
        expect(next.playerHp).toBe(Math.max(0, prev.playerHp - event.damage));
        expect(next.combo).toBe(0);
        break;
      case "opening":
        expect(enemy.weakSpots).toContain(event.weakSpot);
        expect(style.strikes).toContain(event.move);
        expect(MOVES.has(event.move)).toBe(true);
        expect(next.phase.kind === "strike" && next.phase.move === event.move && next.phase.weakSpot === event.weakSpot).toBe(true);
        break;
      case "enemyHit": {
        expect(prev.phase.kind === "strike" && prev.phase.move === event.move).toBe(true);
        expect(input.struck.some((s) => s.move === event.move)).toBe(true);
        expect(event.quality).toBeGreaterThanOrEqual(0);
        expect(event.quality).toBeLessThanOrEqual(1);
        expect(Number.isInteger(event.damage)).toBe(true);
        expect(event.damage).toBeGreaterThanOrEqual(6); // 12 x 0.5 at worst
        expect(event.damage).toBeLessThanOrEqual(54); // 12 x 1.5 combo x 1.5 quality x 2 together
        expect(next.enemyHp).toBe(Math.max(0, prev.enemyHp - event.damage));
        expect(next.combo).toBe(prev.combo + 1);
        expect(next.score).toBe(prev.score + event.damage * 10);
        expect(next.mastery[event.move]).toBe((prev.mastery[event.move] ?? 0) + 1);
        break;
      }
      case "phaseChanged":
        expect(next.phaseIndex).toBe(event.index);
        expect(event.index).toBeGreaterThan(prev.phaseIndex);
        expect(event.name).toBe(enemy.phases?.[event.index]?.name);
        break;
      case "finished":
        expect(prev.phase.kind).toBe("finisher");
        expect(event.move).toBe(enemy.finisher);
        expect(next.phase.kind).toBe("won");
        expect(next.mastery[event.move]).toBe((prev.mastery[event.move] ?? 0) + 1);
        break;
      case "whiffed":
        expect(["strike", "finisher"]).toContain(prev.phase.kind);
        expect(next.combo).toBe(prev.phase.kind === "strike" ? 0 : prev.combo);
        break;
      case "powerUnleashed":
        break;
      case "won":
        expect(next.phase.kind).toBe("won");
        break;
      case "lost":
        expect(next.phase.kind).toBe("lost");
        break;
    }
  }
  // And the other way round: every change shows up as an event.
  expect(count(events, "telegraph")).toBe(next.phase.kind === "defend" && prev.phase.kind !== "defend" ? 1 : 0);
  expect(count(events, "opening")).toBe(next.phase.kind === "strike" && prev.phase.kind !== "strike" ? 1 : 0);
  expect(count(events, "phaseChanged")).toBe(next.phaseIndex > prev.phaseIndex ? 1 : 0);
  expect(total(next.mastery) - total(prev.mastery)).toBe(count(events, "defended") + count(events, "enemyHit") + count(events, "finished"));
}

interface Trace {
  readonly states: CombatState[];
  readonly events: CombatEvent[][];
  readonly inputs: CombatInput[];
  readonly dts: number[];
}

function fight(enemy: EnemySpec, style: FightingStyle, seed: number, players: 1 | 2, skill: number, verify: boolean): Trace {
  const random = rng(seed * 7919 + 13);
  let state: CombatState = { ...startFight(enemy, seed), players };
  const trace: Trace = { states: [state], events: [], inputs: [], dts: [] };
  for (let tick = 0; tick < MAX_TICKS && state.phase.kind !== "won" && state.phase.kind !== "lost"; tick++) {
    const dt = pickOf(random, DTS);
    const input = inputFor(random, state, enemy, skill);
    const result = step(state, enemy, style, input, dt);
    if (verify) check(state, result.state, result.events, enemy, style, input, dt);
    trace.states.push(result.state);
    trace.events.push([...result.events]);
    trace.inputs.push(input);
    trace.dts.push(dt);
    state = result.state;
  }
  return trace;
}

const SEEDS = [1, 2, 3, 42, 1234, 99991] as const;
const COMBOS = SEEDS.flatMap((seed) => SKILLS.flatMap((skill) => ([1, 2] as const).map((players) => ({ seed, skill, players }))));
const COMBO_STRIDE = 6;
/** Every enemy x style pair gets 1/6 of the seed, skill and player combos, rotating so all of them are covered across pairs. The cost stays flat as enemies and styles are added. */
const CASES = ENEMIES.flatMap((enemy, e) =>
  STYLES.flatMap((style, s) =>
    COMBOS.filter((_, i) => i % COMBO_STRIDE === (e + s) % COMBO_STRIDE).map((combo) => ({ enemy, style, ...combo })),
  ),
);
const STATES_PER_FIGHT = 8;

describe("random fights keep every rule", () => {
  const seen = new Set<string>();
  test.each(ENEMIES.map((enemy) => [enemy.id, enemy] as const))("%s, every style, seed and skill", (_id, enemy) => {
    for (const c of CASES.filter((k) => k.enemy === enemy)) {
      const trace = fight(c.enemy, c.style, c.seed, c.players, c.skill, true);
      const last = trace.states.at(-1);
      // Every fight ends, in exactly one of won or lost, announced exactly once.
      expect(last?.phase.kind === "won" || last?.phase.kind === "lost").toBe(true);
      expect(trace.events.flat().filter((e) => e.type === "won" || e.type === "lost")).toHaveLength(1);
      for (const event of trace.events.flat()) seen.add(event.type);
    }
  });
  test("the random play reached every kind of event, so the checks above were not idle", () => {
    for (const type of ["telegraph", "defended", "playerHit", "opening", "enemyHit", "phaseChanged", "finished", "whiffed", "won", "lost"]) {
      expect(seen.has(type), type).toBe(true);
    }
  });
});

describe("a finished fight never changes again", () => {
  test.each(ENEMIES.map((enemy) => [enemy.id, enemy] as const))("%s", (_id, enemy) => {
    for (const style of STYLES) {
      for (const seed of SEEDS) {
        const done = fight(enemy, style, seed, 1, 1, false).states.at(-1);
        if (!done) throw new Error("no state");
        const random = rng(seed);
        for (let i = 0; i < 50; i++) {
          const result = step(done, enemy, style, inputFor(random, done, enemy, 1), pickOf(random, DTS));
          expect(result.state).toBe(done);
          expect(result.events).toEqual([]);
        }
      }
    }
  });
});

describe("the same seed and inputs always give the same fight", () => {
  test("replaying the recorded inputs reproduces every state and event", () => {
    for (const c of CASES.filter((k) => k.seed === 42)) {
      const first = fight(c.enemy, c.style, c.seed, c.players, c.skill, false);
      let state: CombatState = { ...startFight(c.enemy, c.seed), players: c.players };
      first.inputs.forEach((input, i) => {
        const result = step(state, c.enemy, c.style, input, first.dts[i] ?? 0);
        expect(result.state).toEqual(first.states[i + 1]);
        expect(result.events).toEqual(first.events[i]);
        state = result.state;
      });
      expect(fight(c.enemy, c.style, c.seed, c.players, c.skill, false)).toEqual(first);
    }
  });
  test("different seeds do not all play out the same", () => {
    const enemy = ENEMIES[0];
    const style = STYLES[0];
    if (!enemy || !style) throw new Error("no content");
    const attacks = new Set(
      SEEDS.map((seed) => JSON.stringify(fight(enemy, style, seed, 1, 0.6, false).events.flat().flatMap((e) => (e.type === "telegraph" ? [e.attack.id] : [])))),
    );
    expect(attacks.size).toBeGreaterThan(1);
  });
});

describe("time of zero and time that is huge", () => {
  // Built once and shared by the three tests below. Per fight: evenly spaced states, plus the first of every phase kind.
  const states = CASES.filter((k) => k.players === 1).flatMap((c) => {
    const all = fight(c.enemy, c.style, c.seed, c.players, c.skill, false).states;
    const stride = Math.max(1, Math.floor(all.length / STATES_PER_FIGHT));
    const firstOfKind = new Map<string, CombatState>();
    for (const state of all) if (!firstOfKind.has(state.phase.kind)) firstOfKind.set(state.phase.kind, state);
    const picked = new Set([...all.filter((_, i) => i % stride === 0), ...firstOfKind.values()]);
    return [...picked].map((state) => ({ state, enemy: c.enemy, style: c.style }));
  });
  const idle: CombatInput = { held: new Set(), struck: [] };

  test("dt 0 with no input moves nothing", () => {
    for (const { state, enemy, style } of states) {
      const phase = state.phase;
      if ("msLeft" in phase && phase.msLeft <= 0) continue;
      const result = step(state, enemy, style, idle, 0);
      expect(result.events).toEqual([]);
      expect(result.state).toEqual(state);
    }
  });

  test("dt 0 with a correct input still obeys every rule", () => {
    const random = rng(5);
    for (const { state, enemy, style } of states) {
      const input = inputFor(random, state, enemy, 1);
      const result = step(state, enemy, style, input, 0);
      check(state, result.state, result.events, enemy, style, input, 0);
    }
  });

  test("a huge dt advances one phase at most and every number stays finite and in range", () => {
    const random = rng(6);
    for (const { state, enemy, style } of states) {
      for (const input of [idle, inputFor(random, state, enemy, 1)]) {
        const result = step(state, enemy, style, input, 1e12);
        check(state, result.state, result.events, enemy, style, input, 1e12);
        const phase = result.state.phase;
        if ("msLeft" in phase) {
          expect(Number.isFinite(phase.msLeft)).toBe(true);
          expect(phase.msLeft).toBeGreaterThan(0);
        }
        expect(Number.isFinite(result.state.score)).toBe(true);
        expect(Number.isFinite(result.state.seed)).toBe(true);
      }
    }
  });
});

describe("a fresh fight", () => {
  test.each(ENEMIES.map((enemy) => [enemy.id, enemy] as const))("%s starts at full health in its intro", (_id, enemy) => {
    const state = startFight(enemy, 7);
    expect(state.playerHp).toBe(PLAYER_HP);
    expect(state.enemyHp).toBe(enemy.hp);
    expect(state.phase.kind).toBe("intro");
    expect(state.phaseIndex).toBe(0);
  });
});
