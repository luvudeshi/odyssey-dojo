// The divine power meter: fills on defends and great strikes, is spent by a god gesture when full.
import { expect, test } from "vitest";
import { POWER_DAMAGE, POWER_MOVES, startFight, step } from "../src/combat/engine";
import type { CombatInput, CombatState, EnemySpec, FightingStyle } from "../src/core/types";

const enemy: EnemySpec = {
  id: "d", name: "D", title: "", order: 0, hp: 200, strikeWindowMs: 1000,
  attacks: [{ id: "a", name: "A", telegraphMs: 1000, damage: 5, counter: "block" }],
  weakSpots: [{ id: "h", label: "h", position: [0, 0, 0], moves: ["jab"] }],
  taunts: [],
  phases: [
    { name: "one", belowHp: 1, attackIds: ["a"], telegraphScale: 1 },
    { name: "two", belowHp: 0.5, attackIds: ["a"], telegraphScale: 0.5 },
  ],
  finisher: "stake",
};
const style: FightingStyle = { id: "s", name: "S", blurb: "", strikes: ["jab"] };
const idle: CombatInput = { held: new Set(), struck: [] };
const blocking: CombatInput = { held: new Set(["block"]), struck: [] };
const throwing = (move: string, quality = 0.7, player: 0 | 1 = 0): CombatInput => ({
  held: new Set(),
  struck: [{ move, quality, player }],
});

function inPhase(kind: "defend" | "strike", power: number, over: Partial<CombatState> = {}): CombatState {
  let s: CombatState = { ...startFight(enemy, 7), phase: { kind: "recover", msLeft: 1 }, ...over };
  s = step(s, enemy, style, idle, 10).state;
  if (kind === "strike") s = step(s, enemy, style, blocking, 1000).state;
  expect(s.phase.kind).toBe(kind);
  return { ...s, power }; // set after the setup, which may itself have filled the meter
}

test("a successful defend fills a fifth of the meter", () => {
  const s = inPhase("defend", 0.3);
  expect(step(s, enemy, style, blocking, 1000).state.power).toBeCloseTo(0.5);
});

test("a failed defend fills nothing", () => {
  const s = inPhase("defend", 0.3);
  expect(step(s, enemy, style, idle, 1000).state.power).toBe(0.3);
});

test("GREAT and PERFECT strikes add a little, GOOD adds nothing", () => {
  const s = inPhase("strike", 0.1);
  expect(step(s, enemy, style, throwing("jab", 0.79), 10).state.power).toBeCloseTo(0.1);
  expect(step(s, enemy, style, throwing("jab", 0.8), 10).state.power).toBeCloseTo(0.15);
  expect(step(s, enemy, style, throwing("jab", 1), 10).state.power).toBeCloseTo(0.15);
});

test("the meter caps at 1", () => {
  expect(step(inPhase("defend", 0.95), enemy, style, blocking, 1000).state.power).toBe(1);
  expect(step(inPhase("strike", 0.99), enemy, style, throwing("jab", 1), 10).state.power).toBe(1);
});

test("a god gesture does nothing until the meter is full", () => {
  const s = inPhase("strike", 0.99);
  const r = step(s, enemy, style, throwing("thunderbolt"), 10);
  expect(r.events).toEqual([]);
  expect(r.state.enemyHp).toBe(s.enemyHp);
  expect(r.state.power).toBe(0.99);
});

test("a non-god strike never spends the meter", () => {
  const r = step(inPhase("defend", 1), enemy, style, throwing("jab"), 10);
  expect(r.events).toEqual([]);
  expect(r.state.power).toBe(1);
});

test("every god gesture spends a full meter in a strike window", () => {
  for (const move of POWER_MOVES) {
    const s = inPhase("strike", 1);
    const r = step(s, enemy, style, throwing(move), 10);
    expect(r.events).toEqual([{ type: "powerUnleashed", damage: POWER_DAMAGE }]);
    expect(r.state.enemyHp).toBe(s.enemyHp - POWER_DAMAGE);
    expect(r.state.power).toBe(0);
    expect(r.state.score).toBe(s.score + POWER_DAMAGE * 10);
    expect(r.state.phase.kind).toBe("strike");
  }
});

test("it also works in a defend window, and the attack still has to be blocked", () => {
  const s = inPhase("defend", 1);
  const r = step(s, enemy, style, throwing("sun_burst"), 10);
  expect(r.events[0]).toEqual({ type: "powerUnleashed", damage: POWER_DAMAGE });
  expect(r.state.phase.kind).toBe("defend");
  expect(step(r.state, enemy, style, idle, 2000).state.playerHp).toBeLessThan(s.playerHp);
});

test("it is ignored in the intro, recover and finisher phases", () => {
  const input = throwing("thunderbolt");
  for (const phase of [
    { kind: "intro", msLeft: 500 },
    { kind: "recover", msLeft: 500 },
    { kind: "finisher", move: "stake", msLeft: 500, totalMs: 500 },
  ] as const) {
    const s: CombatState = { ...startFight(enemy, 1), enemyHp: phase.kind === "finisher" ? 0 : 200, power: 1, phase };
    const r = step(s, enemy, style, input, 10);
    expect(r.state.power).toBe(1);
    expect(r.events.some((e) => e.type === "powerUnleashed")).toBe(false);
  }
});

test("it is spent once, however many gestures arrive in a frame or players throw", () => {
  const s = inPhase("strike", 1, { players: 2 });
  const both: CombatInput = {
    held: new Set(),
    struck: [
      { move: "thunderbolt", quality: 1, player: 0 },
      { move: "moon_arrow", quality: 1, player: 1 },
    ],
  };
  const r = step(s, enemy, style, both, 10);
  expect(r.events.filter((e) => e.type === "powerUnleashed")).toHaveLength(1);
  expect(r.state.enemyHp).toBe(s.enemyHp - POWER_DAMAGE);
  // Player 1 alone can spend it too.
  const alone = step(s, enemy, style, throwing("sun_burst", 0.7, 1), 10);
  expect(alone.state.power).toBe(0);
});

test("a power hit that crosses a phase threshold reports the new phase", () => {
  const s = inPhase("strike", 1, { enemyHp: 110 });
  const r = step(s, enemy, style, throwing("thunderbolt"), 10);
  expect(r.state.phaseIndex).toBe(1);
  expect(r.events.map((e) => e.type)).toEqual(["powerUnleashed", "phaseChanged"]);
});

test("a power hit that empties health still goes to the finisher", () => {
  const s = inPhase("strike", 1, { enemyHp: 20 });
  const r = step(s, enemy, style, throwing("thunderbolt"), 10);
  expect(r.state.enemyHp).toBe(0);
  expect(r.state.phase.kind).toBe("finisher");
  expect(r.events[0]).toEqual({ type: "powerUnleashed", damage: 20 });
  expect(r.events.some((e) => e.type === "won")).toBe(false);
  // Power in the defend window does the same.
  const d = step(inPhase("defend", 1, { enemyHp: 20 }), enemy, style, throwing("thunderbolt"), 10);
  expect(d.state.phase.kind).toBe("finisher");
});

test("without a finisher, emptying health wins", () => {
  const plain: EnemySpec = {
    id: "p", name: "P", title: "", order: 0, hp: 200, strikeWindowMs: 1000,
    attacks: enemy.attacks, weakSpots: enemy.weakSpots, taunts: [], phases: [{ name: "one", belowHp: 1, attackIds: ["a"], telegraphScale: 1 }, { name: "two", belowHp: 0.5, attackIds: ["a"], telegraphScale: 0.5 }],
  };
  const s: CombatState = { ...inPhase("strike", 1, { enemyHp: 20 }) };
  const r = step(s, plain, style, throwing("thunderbolt"), 10);
  expect(r.state.phase.kind).toBe("won");
  expect(r.events.map((e) => e.type)).toEqual(["powerUnleashed", "phaseChanged", "won"]);
});

test("a full meter plus a normal strike and a god gesture in one frame does both", () => {
  const s = inPhase("strike", 1);
  const move = s.phase.kind === "strike" ? s.phase.move : "";
  const input: CombatInput = {
    held: new Set(),
    struck: [
      { move: "thunderbolt", quality: 1, player: 0 },
      { move, quality: 0.7, player: 0 },
    ],
  };
  const r = step(s, enemy, style, input, 10);
  expect(r.events.map((e) => e.type)).toContain("powerUnleashed");
  expect(r.events.map((e) => e.type)).toContain("enemyHit");
  expect(r.state.power).toBe(0);
});

test("the same input gives the same result", () => {
  const run = (): ReturnType<typeof step> => step(inPhase("strike", 1), enemy, style, throwing("thunderbolt"), 10);
  expect(run()).toEqual(run());
});
