import { expect, test } from "vitest";
import { phaseIndexFor, startFight, step } from "../src/combat/engine";
import type { CombatInput, CombatState, EnemySpec, FightingStyle, Strike } from "../src/core/types";

const enemy: EnemySpec = {
  id: "d", name: "D", title: "", order: 0, hp: 100, strikeWindowMs: 1000,
  attacks: [
    { id: "a", name: "A", telegraphMs: 1000, damage: 5, counter: "block" },
    { id: "b", name: "B", telegraphMs: 1000, damage: 5, counter: "duck", weight: 0 },
    { id: "c", name: "C", telegraphMs: 1000, damage: 5, counter: "block", weight: 3 },
  ],
  weakSpots: [{ id: "h", label: "h", position: [0, 0, 0], moves: ["jab"] }],
  taunts: [],
  phases: [
    { name: "one", belowHp: 1, attackIds: ["a", "b"], telegraphScale: 2 },
    { name: "two", belowHp: 0.5, attackIds: ["c"], telegraphScale: 0.5 },
  ],
  finisher: "stake",
};
const plain: EnemySpec = {
  id: "d", name: "D", title: "", order: 0, hp: 100, strikeWindowMs: 1000,
  attacks: enemy.attacks, weakSpots: enemy.weakSpots, taunts: [],
};
const style: FightingStyle = { id: "s", name: "S", blurb: "", strikes: ["jab"] };
const idle: CombatInput = { held: new Set(), struck: [] };
const blocking: CombatInput = { held: new Set(["block", "duck"]), struck: [] };
const hit = (quality: number, ...players: (0 | 1)[]): CombatInput => ({
  held: new Set(),
  struck: players.map((player) => ({ move: "jab", quality, player })),
});

function defend(e: EnemySpec, hp: number, phaseIndex: number, seed: number): CombatState {
  const base = { ...startFight(e, seed), enemyHp: hp, phaseIndex, phase: { kind: "recover", msLeft: 1 } as const };
  return step(base, e, style, idle, 10).state;
}
function opening(e: EnemySpec, s: CombatState): CombatState {
  const d = s.phase.kind === "defend" ? s.phase.msLeft : 0;
  return step(s, e, style, blocking, d).state;
}

test("phase follows health thresholds", () => {
  expect([100, 51, 50, 1].map((hp) => phaseIndexFor(enemy, hp))).toEqual([0, 0, 1, 1]);
  expect(phaseIndexFor(plain, 1)).toBe(0);
});

test("defend uses only the phase's attacks, weights and telegraph scale", () => {
  for (let seed = 0; seed < 200; seed++) {
    const one = defend(enemy, 100, 0, seed).phase;
    expect(one.kind === "defend" && one.attack.id === "a" && one.totalMs === 2000).toBe(true); // b has weight 0
    const two = defend(enemy, 40, 1, seed).phase;
    expect(two.kind === "defend" && two.attack.id === "c" && two.totalMs === 500).toBe(true);
    const none = defend(plain, 100, 0, seed).phase;
    expect(none.kind === "defend" && none.totalMs).toBe(1000);
  }
});

test("no phases means every weighted attack can come up", () => {
  const ids = new Set<string>();
  for (let seed = 0; seed < 300; seed++) {
    const p = defend(plain, 100, 0, seed).phase;
    if (p.kind === "defend") ids.add(p.attack.id);
  }
  expect(ids).toEqual(new Set(["a", "c"]));
});

test("phaseChanged fires once per change", () => {
  const open = opening(enemy, defend(enemy, 60, 0, 1));
  const r = step(open, enemy, style, hit(0.5, 0), 16);
  expect(r.events.map((e) => e.type)).toEqual(["enemyHit", "phaseChanged"]);
  expect(r.state.phaseIndex).toBe(1);
  const again = step(opening(enemy, defend(enemy, r.state.enemyHp, 1, 2)), enemy, style, hit(0.5, 0), 16);
  expect(again.events.map((e) => e.type)).toEqual(["enemyHit"]);
});

test("quality scales damage and is clamped", () => {
  const dmg = (q: number): number => {
    const r = step(opening(enemy, defend(enemy, 100, 0, 1)), enemy, style, hit(q, 0), 16);
    return 100 - r.state.enemyHp;
  };
  expect([dmg(0), dmg(0.7), dmg(1), dmg(5), dmg(-3)]).toEqual([6, 14, 18, 18, 6]);
});

test("two players landing together double the damage, one alone does not", () => {
  const two = (s: CombatState): CombatState => ({ ...s, players: 2 });
  const open = opening(enemy, defend(enemy, 100, 0, 1));
  const both = step(two(open), enemy, style, hit(0.5, 0, 1), 16);
  const solo = step(two(open), enemy, style, hit(0.5, 1), 16);
  const oneP = step(open, enemy, style, hit(0.5, 0, 1), 16);
  expect(100 - both.state.enemyHp).toBe(24);
  expect(100 - solo.state.enemyHp).toBe(12);
  expect(100 - oneP.state.enemyHp).toBe(12);
});

test("finisher flow: zero hp enters finisher, only the move wins, timeout re-prompts", () => {
  const open = opening(enemy, defend(enemy, 5, 1, 1));
  const down = step(open, enemy, style, hit(1, 0), 16);
  expect(down.state.enemyHp).toBe(0);
  expect(down.state.phase).toEqual({ kind: "finisher", move: "stake", msLeft: 6000, totalMs: 6000 });
  expect(down.events.map((e) => e.type)).toEqual(["enemyHit"]);
  expect(step(down.state, enemy, style, hit(1, 0), 16).state.phase.kind).toBe("finisher");
  const late = step(down.state, enemy, style, idle, 6000);
  expect(late.events.map((e) => e.type)).toEqual(["whiffed"]);
  expect(late.state.phase).toEqual(down.state.phase);
  const finish: CombatInput = { held: new Set(), struck: [{ move: "stake", quality: 1, player: 0 }] };
  const done = step(down.state, enemy, style, finish, 16);
  expect(done.events.map((e) => e.type)).toEqual(["finished", "won"]);
  expect(done.state.phase.kind).toBe("won");
});

test("no finisher: win at zero", () => {
  const r = step(opening(plain, defend(plain, 5, 0, 1)), plain, style, hit(1, 0), 16);
  expect(r.events.map((e) => e.type)).toEqual(["enemyHit", "won"]);
});

test("1000 seeded random fights stay sane and terminate", () => {
  for (let f = 0; f < 1000; f++) {
    const e = f % 2 ? enemy : plain;
    let s: CombatState = { ...startFight(e, f + 1), players: f % 3 === 0 ? 2 : 1 };
    let rng = f * 7919 + 13;
    const next = (): number => {
      rng = (Math.imul(rng, 1103515245) + 12345) >>> 0;
      return rng / 4294967296;
    };
    let steps = 0;
    while (s.phase.kind !== "won" && s.phase.kind !== "lost" && steps++ < 20000) {
      const ph = s.phase;
      const struck: Strike[] =
        next() < 0.4
          ? [{ move: ph.kind === "finisher" ? ph.move : "jab", quality: next() * 1.4 - 0.2, player: (next() < 0.5 ? 0 : 1) }]
          : [];
      const held = new Set(next() < 0.5 ? ["block", "duck"] : []);
      s = step(s, e, style, { held, struck }, 16 + Math.floor(next() * 400)).state;
      expect(Number.isFinite(s.enemyHp) && s.enemyHp >= 0 && s.playerHp >= 0).toBe(true);
      expect(Number.isFinite(s.score)).toBe(true);
    }
    expect(["won", "lost"]).toContain(s.phase.kind);
  }
});
