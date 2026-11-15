// The hero acting out his god's power, as numbers. Pure (no three.js), so it is tested without a browser. Each god has a
// short track of keys timed to the effect in effects/power (t is seconds since battle.powerAt); this blends between the
// keys and hands leapPose the arm directions to aim at, how much of the clip or webcam pose they replace, and a crouch,
// lean and roll. Scene axes: the hero faces -z, +x is his right, +y is up. Directions need not be unit length.
import type { GodId } from "../../ai/gods/gods";

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
  /** 0..1 how far the chest turns from the clip's side-on stance to face the monster. */
  square: number;
  /** Direction triples: right upper arm, right forearm, left upper arm, left forearm. */
  dirs: Float64Array;
}

export function newPowerPose(): PowerPose {
  return { active: false, wR: 0, wL: 0, crouch: 0, lean: 0, roll: 0, square: 0, dirs: new Float64Array(12) };
}

// A row is [t, e, onR, onL, crouch, lean, roll, square, ...12 direction numbers]; e is the whole pose's weight.
const DIRS = 8;
const COLS = DIRS + 12;
type Dir = readonly [number, number, number];
const HANG: Dir = [0, -1, 0];
interface KeyArgs { e?: number; r?: readonly [Dir, Dir]; l?: readonly [Dir, Dir]; c?: number; n?: number; o?: number; s?: number }

function key(t: number, a: KeyArgs): readonly number[] {
  const [ru, rl] = a.r ?? [HANG, HANG];
  const [lu, ll] = a.l ?? [HANG, HANG];
  return [t, a.e ?? 1, a.r ? 1 : 0, a.l ? 1 : 0, a.c ?? 0, a.n ?? 0, a.o ?? 0, a.s ?? 0, ...ru, ...rl, ...lu, ...ll];
}

const both = (u: Dir, l: Dir = u): readonly [Dir, Dir] => [u, l];
const mirror = (d: Dir): Dir => [-d[0], d[1], d[2]];
const arms = (u: Dir, l: Dir): { r: readonly [Dir, Dir]; l: readonly [Dir, Dir] } => ({ r: both(u, l), l: both(mirror(u), mirror(l)) });

// Every pose is held to near the end of its effect (POWER_SPAN in effects/power) and is drawn for the camera behind
// his right shoulder: the chest squares up to the monster (s) so the arms open left and right, high or wide, where
// they read, instead of straight at the monster where his own back hides them.
// Zeus: both arms flung straight up to the sky, then driven down and out as he drops at the bolt.
const SKY = { ...arms([0.22, 1, 0.05], [0.08, 1, 0]), s: 1 };
const SLAM = { ...arms([0.75, -0.75, -0.35], [0.45, -1, -0.3]), s: 1, c: 0.85, n: 1.3 };
// Poseidon: both hands on one shaft, drawn back past his right hip, swept across to his left.
const DRAW_R: readonly [Dir, Dir] = [[0.65, -0.6, 0.45], [0.55, -0.35, 0.75]];
const DRAW_L: readonly [Dir, Dir] = [[0.8, -0.45, -0.3], [0.95, -0.25, 0.3]];
const MID_R: readonly [Dir, Dir] = [[0.3, -0.3, -1], [-0.3, -0.15, -1]];
const MID_L: readonly [Dir, Dir] = [[-0.3, -0.3, -1], [0.3, -0.15, -1]];
const END_R: readonly [Dir, Dir] = [[-0.85, -0.05, -0.5], [-1, 0.1, -0.2]];
const END_L: readonly [Dir, Dir] = [[-1, 0.1, 0.2], [-0.9, 0.25, 0.4]];
// Athena: the shield (left) arm braced at the chest, then punched out ahead and to his left; the right arm pulls back low.
const BRACE_L: readonly [Dir, Dir] = [[-0.6, -0.55, 0.1], [0.4, 0.5, -0.6]];
const THRUST_L: readonly [Dir, Dir] = [[-0.85, 0.35, -0.75], [-0.8, 0.4, -0.75]];
const BACK_R: readonly [Dir, Dir] = [[0.6, -0.6, 0.6], [0.4, -0.8, 0.6]];
// Hermes: arms swept back and out like wings, a sprinter's dash lean.
const STREAK = arms([0.6, -0.3, 1], [0.5, -0.05, 1]);
// Artemis: half side-on as an archer stands, bow arm straight out ahead and to his left, right elbow high and wide, hand drawn to his cheek.
const BOW: readonly [Dir, Dir] = [[-0.55, 0.2, -0.9], [-0.5, 0.22, -0.9]];
const NOCK: readonly [Dir, Dir] = [[0.15, 0.05, -1], [-0.1, 0.1, -1]];
const DRAWN: readonly [Dir, Dir] = [[1, 0.45, 0.35], [-0.8, 0.15, -0.45]];
const LOOSED: readonly [Dir, Dir] = [[1, 0.3, 0.45], [0.85, 0.1, 0.55]];
// Apollo: arms opened wide and high, chest arched back to the sun.
const RISE = { ...arms([1, 0.15, 0.05], [1, 0.35, 0]), s: 1 };
const SUN = { ...arms([1, 0.65, 0.1], [0.7, 1, 0.05]), s: 1 };

/** The tracks. Each starts and ends at e = 0, and eases in to e = 1 over EASE_IN, so the clip pose shows at both ends. */
const TRACKS: Readonly<Record<GodId, readonly (readonly number[])[]>> = {
  // Up 0-0.38, driven down by the hit at 0.55, held to 1.2, back by 1.6.
  zeus: [
    key(0, { e: 0, ...SKY }), key(EASE_IN, { ...SKY, n: -0.4 }), key(0.38, { ...SKY, n: -0.8 }),
    key(0.55, SLAM), key(1.2, { ...SLAM, c: 0.7, n: 1.1 }), key(1.6, { e: 0, ...SLAM }),
  ],
  // Drawn back low 0-0.35, swept across to his left by the hit at 0.95, held to 1.4, back by 1.75.
  poseidon: [
    key(0, { e: 0, r: DRAW_R, l: DRAW_L, s: 1 }), key(EASE_IN, { r: DRAW_R, l: DRAW_L, s: 1, c: 0.4, o: -0.2 }),
    key(0.35, { r: DRAW_R, l: DRAW_L, s: 1, c: 0.7, o: -0.35, n: 0.3 }), key(0.65, { r: MID_R, l: MID_L, s: 1, c: 0.5, n: 0.7 }),
    key(0.95, { r: END_R, l: END_L, s: 1, c: 0.35, n: 0.5, o: 0.4 }), key(1.4, { r: END_R, l: END_L, s: 1, c: 0.3, n: 0.4, o: 0.35 }),
    key(1.75, { e: 0, r: END_R, l: END_L, s: 1 }),
  ],
  // Braced 0-0.35, punched out by the hit at 0.75 with a lunge, held to 1.1, back by 1.4.
  athena: [
    key(0, { e: 0, r: BACK_R, l: BRACE_L, s: 0.9 }), key(EASE_IN, { r: BACK_R, l: BRACE_L, s: 0.9, c: 0.2 }),
    key(0.35, { r: BACK_R, l: BRACE_L, s: 0.9, c: 0.45, n: -0.2, o: -0.2 }), key(0.75, { r: BACK_R, l: THRUST_L, s: 0.9, c: 0.5, n: 1.4, o: 0.3 }),
    key(1.1, { r: BACK_R, l: THRUST_L, s: 0.9, c: 0.45, n: 1.3, o: 0.25 }), key(1.4, { e: 0, r: BACK_R, l: THRUST_L, s: 0.9 }),
  ],
  // Coils low 0-0.3, then streaks off leaning hard with the arms swept back, held to 1.15, back by 1.4.
  hermes: [
    key(0, { e: 0, ...STREAK, s: 1 }), key(EASE_IN, { ...STREAK, s: 1, c: 0.4 }), key(0.3, { ...STREAK, s: 1, c: 0.9, n: 0.6 }),
    key(0.55, { ...STREAK, s: 1, c: 0.6, n: 2 }), key(1.15, { ...STREAK, s: 1, c: 0.6, n: 2 }), key(1.4, { e: 0, ...STREAK, s: 1 }),
  ],
  // Nocks 0-0.1, drawn by 0.4 and held to the hit at 0.85, the hand flies back on release by 1.0, lowered by 1.5.
  artemis: [
    key(0, { e: 0, r: NOCK, l: BOW, s: 0.45 }), key(EASE_IN, { r: NOCK, l: BOW, s: 0.45, n: 0.1 }), key(0.4, { r: DRAWN, l: BOW, s: 0.45, n: 0.15, o: -0.15 }),
    key(0.85, { r: DRAWN, l: BOW, s: 0.45, n: 0.15, o: -0.15 }), key(1.0, { r: LOOSED, l: BOW, s: 0.45, n: 0.1 }), key(1.2, { r: LOOSED, l: BOW, s: 0.45, n: 0.1 }),
    key(1.5, { e: 0, r: LOOSED, l: BOW, s: 0.45 }),
  ],
  // Arms open 0-0.3, wide and high with the chest arched back by 0.5, held through the hit at 0.85 to 1.45, back by 1.8.
  apollo: [
    key(0, { e: 0, ...RISE }), key(EASE_IN, { ...RISE, n: -0.4 }), key(0.5, { ...SUN, n: -1.3 }),
    key(0.85, { ...SUN, n: -1.6 }), key(1.45, { ...SUN, n: -1.5 }), key(1.8, { e: 0, ...SUN }),
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
  out.square = at(7) * e;
  for (let c = DIRS; c < COLS; c++) out.dirs[c - DIRS] = at(c);
  out.active = true;
  return true;
}
