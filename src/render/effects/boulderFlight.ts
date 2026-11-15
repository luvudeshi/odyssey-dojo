// Where Polyphemus's thrown boulder is, as a pure function of how far the telegraph has run, and which ending plays.
// Positions are in the monster rig's space (the rig sits at z = -4 and the hero at about z = +5.2 in it).
// No three.js and no clock: Boulder.tsx feeds it progress = 1 - msLeft / totalMs, so it stays in step with the engine.

export interface RockPose { x: number; y: number; z: number; scale: number; spin: number }
export interface Spot { x: number; y: number; z: number }
export type Ending = "smash" | "shatter" | "miss";

/** Where the rock lies before he picks it up, and where his raised hand holds it. */
export const PICKUP: Spot = { x: 0.2, y: 0.5, z: 1.6 };
export const HAND: Spot = { x: 1.45, y: 4.6, z: 0.9 };
/** The hurl takes this long, ending as the telegraph ends. */
export const THROW_MS = 400;
/** Share of the lift that is the rock rising off the ground; the rest he holds it overhead. */
const RISE = 0.5;
export const FLOOR = 0.5;

const smooth = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/** Telegraph progress at which the hurl starts: the last THROW_MS, but never before the halfway mark. */
export function throwStart(totalMs: number): number {
  return Math.max(0.5, 1 - THROW_MS / totalMs);
}

/**
 * Writes the rock's pose at telegraph progress `p` into `out`. Past 1 the rock keeps flying on the same line,
 * which is how a rock that missed carries on past the hero. `aim` is where it arrives at p = 1.
 */
export function boulderAt(out: RockPose, p: number, totalMs: number, aim: Spot): RockPose {
  const s = throwStart(totalMs);
  if (p < s) {
    const rise = smooth(p / (s * RISE));
    const bob = p > s * RISE ? Math.sin((p - s * RISE) * 18) * 0.06 : 0;
    out.x = PICKUP.x + (HAND.x - PICKUP.x) * rise;
    out.y = PICKUP.y + (HAND.y - PICKUP.y) * rise + bob;
    out.z = PICKUP.z + (HAND.z - PICKUP.z) * rise;
    out.scale = 0.55 + 0.45 * smooth(p / (s * 0.25));
    out.spin = p * 2;
    return out;
  }
  const u = (p - s) / (1 - s);
  out.x = HAND.x + (aim.x - HAND.x) * u;
  out.y = HAND.y + (aim.y - HAND.y) * u;
  out.z = HAND.z + (aim.z - HAND.z) * u;
  out.scale = 1;
  out.spin = s * 2 + u * 7;
  return out;
}

/** Which ending plays when the attack lands: it hit, was blocked (shatters in front of the hero) or was ducked or dodged. */
export function endingFor(hit: boolean, counter: string): Ending {
  if (hit) return "smash";
  return counter === "block" ? "shatter" : "miss";
}

/** For a miss: how many ms after landing the rock reaches the floor and breaks, flying on along its line. */
export function missBreakMs(totalMs: number, aim: Spot): number {
  const drop = HAND.y - aim.y;
  if (drop <= 0) return 0;
  const u = (HAND.y - FLOOR) / drop;
  return Math.max(0, (u - 1) * (1 - throwStart(totalMs)) * totalMs);
}
