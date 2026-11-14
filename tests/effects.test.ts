// Hit effects are driven by the difference between two combat states, using the real engine.
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { CombatInput, CombatState, EnemySpec, FightingStyle } from "../src/core/types";
import { MONSTER_CHEST, fxBetween } from "../src/render/effects/events";
import { createPool, emit, stepPool } from "../src/render/effects/sparks";

const enemy: EnemySpec = {
  id: "dummy", name: "Dummy", title: "", order: 0, hp: 20, strikeWindowMs: 1000,
  attacks: [{ id: "swing", name: "Swing", telegraphMs: 1000, damage: 60, counter: "block" }],
  weakSpots: [{ id: "head", label: "head", position: [1, 2, 3], moves: ["jab"] }],
  taunts: [],
};
const style: FightingStyle = { id: "s", name: "S", blurb: "", strikes: ["jab"] };
const idle: CombatInput = { held: new Set(), struck: [] };
const blocking: CombatInput = { held: new Set(["block"]), struck: [] };
const jabbing: CombatInput = { held: new Set(), struck: [{ move: "jab", quality: 1, player: 0 }] };

/** Steps the fight and reports the effects that step should cause. */
function advance(state: CombatState, input: CombatInput, ms: number): { state: CombatState; fx: string[] } {
  const next = step(state, enemy, style, input, ms).state;
  return { state: next, fx: fxBetween(state, next).map((effect) => effect.type) };
}

test("nothing fires on the first frame or while nothing happens", () => {
  const start = startFight(enemy, 1);
  expect(fxBetween(null, start)).toEqual([]);
  expect(fxBetween(start, start)).toEqual([]);
  expect(advance(start, idle, 100).fx).toEqual([]);
  expect(advance(start, idle, 2000).fx).toEqual([]);
});

test("a missed defense fires playerHit, once", () => {
  const defending = advance(startFight(enemy, 1), idle, 2000).state;
  const hit = advance(defending, idle, 1000);
  expect(hit.fx).toEqual(["playerHit"]);
  expect(advance(hit.state, idle, 16).fx).toEqual([]);
});

test("a landed strike sparks at the weak spot, and the killing blow also fires finished", () => {
  let state = advance(startFight(enemy, 1), idle, 2000).state;
  state = advance(state, blocking, 1000).state;
  expect(state.phase.kind).toBe("strike");
  const next = step(state, enemy, style, jabbing, 16).state;
  expect(fxBetween(state, next)).toEqual([{ type: "enemyHit", at: [1, 2, 3] }]);

  state = advance(next, idle, 1000).state;
  state = advance(state, blocking, 1000).state;
  const killed = advance(state, jabbing, 16);
  expect(killed.state.phase.kind).toBe("won");
  expect(killed.fx).toEqual(["enemyHit", "finished"]);
  expect(advance(killed.state, idle, 16).fx).toEqual([]);
});

test("a whiffed strike and a held block fire nothing", () => {
  const defending = advance(startFight(enemy, 1), idle, 2000).state;
  const blocked = advance(defending, blocking, 1000);
  expect(blocked.fx).toEqual([]);
  expect(advance(blocked.state, idle, 5000).fx).toEqual([]);
});

test("a hit with no open weak spot lands on the chest", () => {
  const start = startFight(enemy, 1);
  expect(fxBetween(start, { ...start, enemyHp: start.enemyHp - 5 })).toEqual([{ type: "enemyHit", at: MONSTER_CHEST }]);
});

test("sparks fly out, fade and die, and the pool never overflows", () => {
  const pool = createPool(10);
  expect(stepPool(pool, 0.016)).toBe(0);
  emit(pool, [1, 2, 3], 4, 5);
  expect(stepPool(pool, 0.016)).toBe(4);
  expect(Math.max(...pool.colors)).toBeGreaterThan(0.5);
  expect(pool.positions[0]).not.toBe(1);

  emit(pool, [0, 0, 0], 25, 5);
  expect(stepPool(pool, 0.016)).toBe(10);
  expect(pool.cursor).toBeLessThan(10);

  let alive = 10;
  for (let i = 0; i < 80 && alive > 0; i++) alive = stepPool(pool, 0.016);
  expect(alive).toBe(0);
  expect(Math.max(...pool.colors)).toBe(0);
  expect([...pool.positions].every(Number.isFinite)).toBe(true);
});
