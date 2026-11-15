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
import { LEAP_SECONDS, REACH, arcHeight, contactPoint, finisherSpot, leapAt, newLeap, strikingLimb, travel } from "../src/render/strikeReach";
import type { Leap } from "../src/render/strikeReach";

test("the leap coils, flies, strikes, falls home and lands, with no jump in any part of the pose", () => {
  const at = (since: number): Leap => leapAt(since);
  expect(at(-0.01)).toEqual(newLeap());
  expect(at(-Infinity)).toEqual(newLeap());
  expect(at(Number.NaN)).toEqual(newLeap());
  expect(at(LEAP_SECONDS)).toEqual(newLeap());
  // Coil: crouched on planted feet, not yet moving.
  const coiled = at(REACH.crouch - 1e-4);
  expect(coiled.crouch).toBeGreaterThan(0.95);
  expect(coiled.across).toBe(0);
  // Arrival: on the contact point, legs drawn up, crouch gone, the monster reacting `out` after the count.
  const struck = at(REACH.out - 1e-4);
  expect(struck.across).toBeGreaterThan(0.99);
  expect(struck.up).toBeGreaterThan(0.99);
  expect(struck.air).toBeGreaterThan(0.99);
  expect(struck.crouch).toBe(0);
  // Mid-flight he is off the straight line, in the air.
  expect(at((REACH.crouch + REACH.out) / 2).arc).toBeGreaterThan(0.9);
  // The landing: back on the mark, legs down, knees absorbing.
  const landed = at(REACH.out + REACH.back + 0.2 * REACH.land);
  expect(landed.across).toBe(0);
  expect(landed.air).toBe(0);
  expect(landed.crouch).toBeGreaterThan(0.8);
  // Every field is continuous: sampled each millisecond, nothing moves more than a fast flight allows in one step.
  // The blow is the one hard stop, in speed only, never in position.
  const keys = ["across", "up", "arc", "crouch", "air", "lean"] as const;
  let last = at(0);
  for (let ms = 1; ms <= LEAP_SECONDS * 1000 + 1; ms++) {
    const now = at(ms / 1000);
    for (const key of keys) expect(Math.abs(now[key] - last[key]), `${key} at ${String(ms)} ms`).toBeLessThan(0.06);
    last = now;
  }
  // A snap, as the engine counts the hit the frame the strike is seen; the crouch comes out of that time.
  expect(REACH.out).toBeLessThanOrEqual(0.14);
  expect(REACH.crouch).toBeLessThan(REACH.out / 2);
  // He lands with no slide: the floor share eases to rest at the mark.
  const nearHome = REACH.out + REACH.back - 0.005;
  expect(at(nearHome).across).toBeLessThan(0.001);
});

test("the arc is a hop for a near spot and a bound for a far one", () => {
  expect(arcHeight(0)).toBe(0.3);
  expect(arcHeight(4)).toBeCloseTo(0.44);
  expect(arcHeight(20)).toBe(0.6);
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
