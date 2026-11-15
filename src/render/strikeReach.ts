// How a counted strike reaches the monster, whatever its size or distance: the hero leaps from his mark so the
// striking fist, foot or blade arrives on the contact point (the open weak spot), holds there a beat, and lands back
// home. The monster's reaction and the sparks are timed to the arrival. Pure, so it is tested without a browser.
import { MONSTER_CHEST } from "./effects/events";
import type { Vec3 } from "./effects/events";
import { MONSTER_Z } from "./cameraShots";
import type { EnemySpec } from "../core/types";

/**
 * The leap in seconds: a quick crouch, the launch and flight (the crouch comes out of `out`, so the monster still reacts
 * `out` after the strike counts), the hop back home after the blow, and the landing the legs absorb.
 */
export const REACH = { crouch: 0.045, out: 0.14, back: 0.36, land: 0.26 } as const;

/** Where the leap is at one moment. Every field runs 0..1 and is continuous in time, so nothing snaps or pops. */
export interface Leap {
  /** Share of the way to the contact point along the floor. */
  across: number;
  /** Share of the way up to the contact point's height. */
  up: number;
  /** Height of the jump's arc above the straight line, as a share of the arc height. */
  arc: number;
  /** How deep he crouches on planted feet: the take-off coil and the landing that the legs absorb. */
  crouch: number;
  /** How far the legs are drawn up into the jumping pose (or thrown out, for a kick). */
  air: number;
  /** How far the upper body leans into the blow. */
  lean: number;
}

export function newLeap(): Leap {
  return { across: 0, up: 0, arc: 0, crouch: 0, air: 0, lean: 0 };
}

const smooth = (p: number): number => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));
const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);

/** Seconds from the strike counting to the hero standing settled on his mark again. */
export const LEAP_SECONDS = REACH.out + REACH.back + REACH.land;

/** The leap `since` seconds after the strike counted, written into `out`. */
export function leapAt(since: number, out: Leap = newLeap()): Leap {
  Object.assign(out, newLeap());
  if (!(since >= 0) || since >= LEAP_SECONDS) return out;
  if (since < REACH.crouch) {
    // Coil: drop fast onto bent knees and lean in.
    out.crouch = easeOut(since / REACH.crouch);
    out.lean = 0.8 * out.crouch;
  } else if (since < REACH.out) {
    // Push off and fly: the legs straighten as the body launches at full speed, then draw up; no easing into the
    // blow, so it lands hard.
    const p = (since - REACH.crouch) / (REACH.out - REACH.crouch);
    out.across = p;
    out.up = p;
    out.arc = 4 * p * (1 - p);
    out.crouch = p < 0.4 ? (1 - p / 0.4) ** 2 : 0;
    out.air = smooth(p / 0.7);
    out.lean = 0.8 + 0.2 * p;
  } else if (since < REACH.out + REACH.back) {
    // The blow stops him dead for a beat, then he kicks off and drops hard to his mark, legs reaching for the floor.
    // Along the floor he eases in, so he lands without sliding; he falls with speed, so the legs have work to do.
    const u = (since - REACH.out) / REACH.back;
    out.across = 1 - smooth(u);
    out.up = 1 - u ** 1.4;
    out.arc = 0.3 * 4 * u * (1 - u);
    out.air = 1 - smooth((u - 0.45) / 0.45);
    out.lean = 1 - u;
  } else {
    // Touchdown: the knees take the fall, then he rises into his stance.
    const v = (since - REACH.out - REACH.back) / REACH.land;
    const PEAK = 0.85;
    const AT = 0.2;
    out.crouch = v < AT ? PEAK * easeOut(v / AT) : PEAK * (1 - smooth((v - AT) / (1 - AT)));
    out.lean = 0.5 * out.crouch;
  }
  return out;
}

/** How high the arc of a leap of `distance` metres (along the floor) rises: a hop for a near spot, a bound for a far one. */
export function arcHeight(distance: number): number {
  return Math.min(0.6, Math.max(0.3, 0.2 + 0.06 * distance));
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
