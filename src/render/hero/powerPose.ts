// The hero acting out his god's power, as numbers. Pure (no three.js), so it is tested without a browser. Each god has a
// short track of keys timed to the effect in effects/power (t is seconds since battle.powerAt); this blends between the
// keys and hands leapPose the arm directions to aim at, how much of the clip or webcam pose they replace, and a crouch,
// lean and roll. Scene axes: the hero faces -z, +x is his right, +y is up. Directions need not be unit length.
import type { GodId } from "../../../ai/gods/gods";

/** Seconds the pose eases in from the clip, so it never pops. */
export const EASE_IN = 0.1;
/** Share of the pose kept on webcam play, where the tracked body already moves his arms. The numbers to nudge. */
export const WEBCAM_SHARE = 0.6;

export interface PowerPose {
  active: boolean;
  /** 0..1 how much of each arm's pose replaces the clip or webcam. */
  wR: number;
  wL: number;
  crouch: number;
  lean: number;
  /** Radians the chest tips sideways: positive tips toward his left. */
  roll: number;
  /** Direction triples: right upper arm, right forearm, left upper arm, left forearm. */
  dirs: Float64Array;
}

export function newPowerPose(): PowerPose {
  return { active: false, wR: 0, wL: 0, crouch: 0, lean: 0, roll: 0, dirs: new Float64Array(12) };
}

// A row is [t, e, onR, onL, crouch, lean, roll, ...12 direction numbers]; e is the whole pose's weight.
const COLS = 19;
type Dir = readonly [number, number, number];
const HANG: Dir = [0, -1, 0];
interface KeyArgs { e?: number; r?: readonly [Dir, Dir]; l?: readonly [Dir, Dir]; c?: number; n?: number; o?: number }

function key(t: number, a: KeyArgs): readonly number[] {
  const [ru, rl] = a.r ?? [HANG, HANG];
  const [lu, ll] = a.l ?? [HANG, HANG];
  return [t, a.e ?? 1, a.r ? 1 : 0, a.l ? 1 : 0, a.c ?? 0, a.n ?? 0, a.o ?? 0, ...ru, ...rl, ...lu, ...ll];
}

const both = (u: Dir, l: Dir = u): readonly [Dir, Dir] => [u, l];
const mirror = (d: Dir): Dir => [-d[0], d[1], d[2]];
const UP: Dir = [0.3, 1, 0.05];
const THROWN: Dir = [0, -0.35, -1];
const FWD: Dir = [0, 0.05, -1];
const SWEEP_BACK: Dir = [0.7, -0.35, 0.6];
const SWEEP_MID: Dir = [0.1, -0.2, -1];
const SWEEP_END: Dir = [-0.7, -0.15, -0.8];

/** The tracks. Each starts and ends at e = 0, and eases in to e = 1 over EASE_IN, so the clip pose shows at both ends. */
const TRACKS: Readonly<Record<GodId, readonly (readonly number[])[]>> = {
  // Right arm up 0-0.3, thrown down at 0.5, recovers 0.8-1.2.
  zeus: [
    key(0, { e: 0, r: both(UP) }), key(EASE_IN, { r: both(UP) }), key(0.3, { r: both(UP), n: -0.2 }),
    key(0.5, { r: both(THROWN, [0, -0.5, -1]), n: 0.6 }), key(0.8, { r: both(THROWN, [0, -0.5, -1]), n: 0.5 }), key(1.2, { e: 0, r: both(THROWN) }),
  ],
  // Draws back low 0-0.3, sweeps wide 0.3-0.95, holds to 1.2.
  poseidon: [
    key(0, { e: 0, r: both(SWEEP_BACK), l: both(SWEEP_BACK) }), key(EASE_IN, { r: both(SWEEP_BACK), l: both(SWEEP_BACK), c: 0.2, o: -0.1 }),
    key(0.3, { r: both(SWEEP_BACK), l: both(SWEEP_BACK), c: 0.6, o: -0.25 }), key(0.62, { r: both(SWEEP_MID), l: both(SWEEP_MID), c: 0.4, n: 0.5 }),
    key(0.95, { r: both(SWEEP_END), l: both(SWEEP_END), c: 0.2, n: 0.4, o: 0.3 }), key(1.05, { r: both(SWEEP_END), l: both(SWEEP_END), c: 0.2, n: 0.4, o: 0.3 }),
    key(1.2, { e: 0, r: both(SWEEP_END), l: both(SWEEP_END) }),
  ],
  // The shield (left) arm comes in across the chest, then thrusts forward 0.3-0.75, held to 1.0.
  athena: [
    key(0, { e: 0, l: [[-0.2, -0.4, -0.5], [0.25, 0.7, -0.5]] }), key(EASE_IN, { l: [[-0.2, -0.4, -0.5], [0.25, 0.7, -0.5]] }),
    key(0.3, { l: [[-0.2, -0.4, -0.5], [0.25, 0.7, -0.5]], c: 0.3, n: -0.2 }), key(0.75, { l: both(FWD), c: 0.2, n: 0.8 }),
    key(0.85, { l: both(FWD), c: 0.2, n: 0.8 }), key(1.0, { e: 0, l: both(FWD) }),
  ],
  // Crouches 0-0.3, then streaks off low with arms swept back, back by 1.4.
  hermes: [
    key(0, { e: 0, r: both([0.3, -0.3, 0.9]), l: both([-0.3, -0.3, 0.9]) }), key(EASE_IN, { r: both([0.3, -0.3, 0.9]), l: both([-0.3, -0.3, 0.9]), c: 0.3 }),
    key(0.3, { r: both([0.3, -0.3, 0.9]), l: both([-0.3, -0.3, 0.9]), c: 1 }), key(0.5, { r: both([0.25, -0.1, 1]), l: both([-0.25, -0.1, 1]), c: 0.7, n: 1 }),
    key(1.3, { r: both([0.25, -0.1, 1]), l: both([-0.25, -0.1, 1]), c: 0.7, n: 1 }), key(1.4, { e: 0, r: both([0.25, -0.1, 1]), l: both([-0.25, -0.1, 1]) }),
  ],
  // The bow arm (left) points at the target and the right hand draws back 0-0.3; the string is let go at 0.3, held to 0.85, lowered by 1.2.
  artemis: [
    key(0, { e: 0, r: both([0.1, 0, -1]), l: both(FWD) }), key(EASE_IN, { r: both([0.1, 0, -1]), l: both(FWD) }),
    key(0.3, { r: [[0.9, 0.1, 0.1], [-0.2, 0.15, 1]], l: both(FWD), n: 0.2 }), key(0.4, { r: [[1, 0.1, 0.25], [1, 0.1, 0.5]], l: both(FWD), n: 0.1 }),
    key(0.85, { r: [[1, 0.1, 0.25], [1, 0.1, 0.5]], l: both(FWD), n: 0.1 }), key(1.2, { e: 0, r: both([1, 0.1, 0.25]), l: both(FWD) }),
  ],
  // Both arms up 0-0.45, thrown forward 0.45-0.85, held to 1.4.
  apollo: [
    key(0, { e: 0, r: both(UP), l: both(mirror(UP)) }), key(EASE_IN, { r: both(UP), l: both(mirror(UP)) }), key(0.3, { r: both(UP), l: both(mirror(UP)), n: -0.3 }),
    key(0.45, { r: both(UP), l: both(mirror(UP)), n: -0.3 }), key(0.85, { r: both([0.15, 0.1, -1]), l: both([-0.15, 0.1, -1]), n: 0.7 }),
    key(1.25, { r: both([0.15, 0.1, -1]), l: both([-0.15, 0.1, -1]), n: 0.6 }), key(1.4, { e: 0, r: both([0.15, 0.1, -1]), l: both([-0.15, 0.1, -1]) }),
  ],
};

/** When each pose is over, seconds after battle.powerAt. */
export function powerPoseEnd(god: GodId): number {
  const rows = TRACKS[god];
  return rows[rows.length - 1]?.[0] ?? 0;
}

const smooth = (x: number): number => x * x * (3 - 2 * x);

/**
 * Fills `out` with the pose `t` seconds after `god`'s power fired and returns true, or returns false (and `out.active`
 * false) before it, after its end or with no god: nothing to change. `share` scales it down where the webcam already moves him.
 */
export function powerPoseAt(god: GodId | null, t: number, share: number, out: PowerPose): boolean {
  out.active = false;
  if (god === null) return false;
  const rows = TRACKS[god];
  if (!(t >= 0) || t >= powerPoseEnd(god)) return false;
  let i = 1;
  while (i < rows.length - 1 && (rows[i]?.[0] ?? 0) <= t) i++;
  const a = rows[i - 1];
  const b = rows[i];
  if (!a || !b) return false;
  const span = (b[0] ?? 0) - (a[0] ?? 0);
  const k = span > 0 ? smooth(Math.min(1, Math.max(0, (t - (a[0] ?? 0)) / span))) : 1;
  const at = (c: number): number => (a[c] ?? 0) + ((b[c] ?? 0) - (a[c] ?? 0)) * k;
  const e = at(1) * share;
  out.wR = at(2) * e;
  out.wL = at(3) * e;
  out.crouch = at(4) * e;
  out.lean = at(5) * e;
  out.roll = at(6) * e;
  for (let c = 7; c < COLS; c++) out.dirs[c - 7] = at(c);
  out.active = true;
  return true;
}
