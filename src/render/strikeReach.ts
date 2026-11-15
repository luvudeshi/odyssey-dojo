// How a counted strike reaches the monster, whatever its size or distance: the hero leaps from his mark so the
// striking fist, foot or blade arrives on the contact point (the open weak spot), holds there a beat, and lands back
// home. The monster's reaction and the sparks are timed to the arrival. Pure, so it is tested without a browser.
import { MONSTER_CHEST } from "./effects/events";
import type { Vec3 } from "./effects/events";
import { MONSTER_Z } from "./cameraShots";
import type { EnemySpec } from "../core/types";

/** Seconds out to the contact point, held on it, and back home. The effects wait `out`, so they fire on arrival. */
export const REACH = { out: 0.14, hold: 0.1, back: 0.34 } as const;

/** How far along the reach is, 0 at home and 1 on the contact point, `since` seconds after the strike counted. */
export function reachWeight(since: number): number {
  if (!(since >= 0)) return 0;
  if (since < REACH.out) {
    const p = since / REACH.out;
    return 1 - (1 - p) * (1 - p); // fast off the mark, easing into the blow
  }
  const back = since - REACH.out - REACH.hold;
  if (back < 0) return 1;
  if (back >= REACH.back) return 0;
  const p = back / REACH.back;
  return 1 - p * p * (3 - 2 * p);
}

/** The weak spot (or the monster's chest) in world space; spots are given in the monster rig's own space. */
export function contactPoint(spot: Vec3 | null, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const [x, y, z] = spot ?? MONSTER_CHEST;
  out[0] = x; out[1] = y; out[2] = MONSTER_Z + z;
  return out;
}

/** Where the finishing blow lands: the weak spot that takes the finisher move, else the first (Polyphemus: his eye). */
export function finisherSpot(enemy: Pick<EnemySpec, "weakSpots" | "finisher">): Vec3 {
  const spots = enemy.weakSpots;
  return (spots.find((spot) => enemy.finisher !== undefined && spot.moves.includes(enemy.finisher)) ?? spots[0]).position;
}

/** Strikes thrown with the leg: only these may land with a foot (keyboard play shows them with a fist, for want of a clip). */
export const KICKS: ReadonlySet<string> = new Set(["front_kick", "knee"]);

/** Roughly the hero's chest above his root; limbs are ranked by how far they reach from here toward the target. */
const CHEST_Y = 1.3;

/**
 * Which limb strikes: of the candidates (fists, feet, a held blade's tip, each relative to the hero's root), the one
 * reaching furthest from the chest toward `toTarget` (contact point minus the hero's root). Returns its index, -1 if none.
 */
export function strikingLimb(limbs: readonly (readonly [number, number, number] | null)[], toTarget: Vec3): number {
  const [dx, dy, dz] = [toTarget[0], toTarget[1] - CHEST_Y, toTarget[2]];
  const length = Math.hypot(dx, dy, dz) || 1;
  let best = -1;
  let bestScore = -Infinity;
  limbs.forEach((limb, index) => {
    if (!limb) return;
    const score = (limb[0] * dx + (limb[1] - CHEST_Y) * dy + limb[2] * dz) / length;
    if (score > bestScore) { bestScore = score; best = index; }
  });
  return best;
}

/**
 * How far the hero's root moves so `limb` (relative to the root) sits on `contact`, from a root at `home`.
 * This is the one place to change the reach rule: today he leaps the whole way, up to an eye overhead or across water.
 */
export function travel(contact: Vec3, home: Vec3, limb: Vec3, out: [number, number, number]): [number, number, number] {
  out[0] = contact[0] - home[0] - limb[0];
  out[1] = Math.max(0, contact[1] - home[1] - limb[1]); // never pushed into the floor
  out[2] = contact[2] - home[2] - limb[2];
  return out;
}
