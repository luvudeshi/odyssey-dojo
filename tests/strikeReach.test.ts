// The leap that carries a counted strike to the monster: timing, contact point, limb choice and travel, and how the
// fight store and the hit effects time the monster's reaction to the hero's arrival. Uses the real engine and enemies.
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { CombatInput, CombatState, EnemySpec, FightingStyle } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { battle, decay, resetBattle, syncBattle } from "../src/render/battle";
import type { Battle } from "../src/render/battle";
import { MONSTER_Z } from "../src/render/cameraShots";
import { MONSTER_CHEST, fxBetween } from "../src/render/effects/events";
import { REACH, contactPoint, finisherSpot, reachWeight, strikingLimb, travel } from "../src/render/strikeReach";

test("the reach snaps out, holds on the blow and eases home", () => {
  expect(reachWeight(-0.01)).toBe(0);
  expect(reachWeight(-Infinity)).toBe(0);
  expect(reachWeight(0)).toBe(0);
  expect(reachWeight(REACH.out / 2)).toBeGreaterThan(0.5); // fast off the mark
  expect(reachWeight(REACH.out)).toBe(1);
  expect(reachWeight(REACH.out + REACH.hold / 2)).toBe(1);
  expect(reachWeight(REACH.out + REACH.hold + REACH.back / 2)).toBeCloseTo(0.5);
  expect(reachWeight(REACH.out + REACH.hold + REACH.back)).toBe(0);
  // A snap, as the engine counts the hit the frame the strike is seen.
  expect(REACH.out).toBeGreaterThanOrEqual(0.1);
  expect(REACH.out).toBeLessThanOrEqual(0.18);
});

test("the contact point is the weak spot in world space, or the chest without one", () => {
  expect(contactPoint([1, 2, 3])).toEqual([1, 2, MONSTER_Z + 3]);
  expect(contactPoint(null)).toEqual([MONSTER_CHEST[0], MONSTER_CHEST[1], MONSTER_Z + MONSTER_CHEST[2]]);
});

test("the finishing blow lands on the spot that takes it, else the first one", () => {
  const byId = (id: string): EnemySpec => {
    const enemy = ENEMIES.find((e) => e.id === id);
    if (!enemy) throw new Error(id);
    return enemy;
  };
  expect(finisherSpot(byId("polyphemus"))).toEqual(byId("polyphemus").weakSpots.find((s) => s.id === "eye")?.position);
  expect(finisherSpot(byId("suitors"))).toEqual(byId("suitors").weakSpots.find((s) => s.id === "throat")?.position);
  expect(finisherSpot(byId("charybdis"))).toEqual(byId("charybdis").weakSpots[0].position);
});

test("the limb reaching furthest toward the target strikes; hidden ones are skipped", () => {
  const leftHigh: [number, number, number] = [-0.1, 1.9, -1.0];
  const rightLow: [number, number, number] = [0.2, 1.0, -1.3];
  expect(strikingLimb([leftHigh, rightLow], [0, 3.8, -3.7])).toBe(0); // an eye overhead
  expect(strikingLimb([leftHigh, rightLow], [0, 1.0, -5])).toBe(1); // straight ahead, low
  expect(strikingLimb([null, rightLow], [0, 3.8, -3.7])).toBe(1);
  expect(strikingLimb([null, null], [0, 1, -1])).toBe(-1);
});

test("travel puts the limb on the contact point, and never pushes him into the floor", () => {
  const contact: [number, number, number] = [0.1, 3.75, -2.55];
  const home: [number, number, number] = [0, 0, 1.2];
  const fist: [number, number, number] = [-0.13, 1.33, -1.36];
  const out = travel(contact, home, fist, [0, 0, 0]);
  expect(out.map((v, i) => +((home[i] ?? 0) + v + (fist[i] ?? 0)).toFixed(6))).toEqual(contact);
  expect(travel([0, 0.2, -3], home, fist, [0, 0, 0])[1]).toBe(0);
});

const dummy: EnemySpec = {
  id: "dummy", name: "Dummy", title: "", order: 0, hp: 20, strikeWindowMs: 1000,
  attacks: [{ id: "swing", name: "Swing", telegraphMs: 1000, damage: 60, counter: "block" }],
  weakSpots: [{ id: "head", label: "head", position: [1, 2, 3], moves: ["jab"] }],
  taunts: [],
};
const style: FightingStyle = { id: "s", name: "S", blurb: "", strikes: ["jab"] };
const idle: CombatInput = { held: new Set(), struck: [] };
const blocking: CombatInput = { held: new Set(["block"]), struck: [] };
const jabbing: CombatInput = { held: new Set(), struck: [{ move: "jab", quality: 1, player: 0 }] };

function strikePhase(): CombatState {
  let state = step(startFight(dummy, 1), dummy, style, idle, 2000).state;
  state = step(state, dummy, style, blocking, 1000).state;
  expect(state.phase.kind).toBe("strike");
  return state;
}

test("a counted strike sets the hero off now and shows the monster struck on arrival", () => {
  const b: Battle = { ...battle };
  resetBattle(b);
  const open = strikePhase();
  syncBattle(b, open, 10);
  syncBattle(b, step(open, dummy, style, jabbing, 16).state, 11);
  expect(b.reachAt).toBe(11);
  expect(b.hitSpot).toEqual([1, 2, 3]);
  expect(b.enemyHitAt).toBeCloseTo(11 + REACH.out);
  // Nothing reacts before the blow arrives.
  expect(decay(11 + REACH.out / 2, b.enemyHitAt, 0.4)).toBe(0);
  expect(decay(b.enemyHitAt, b.enemyHitAt, 0.4)).toBe(1);
});

test("sparks wait for the hero's arrival on a strike, at the weak spot", () => {
  const open = strikePhase();
  const next = step(open, dummy, style, jabbing, 16).state;
  expect(fxBetween(open, next, MONSTER_CHEST, REACH.out)).toEqual([{ type: "enemyHit", at: [1, 2, 3], delay: REACH.out }]);
});
