// The hero's body when no webcam frame is arriving: a fighting stance computed from the action alone.
// Pure and deterministic. Coordinates match MediaPipe world landmarks as PlayerFigure reads them: metres, origin at
// the hips at rest, y points DOWN, the player's left is -x and "forward" (toward the monster) is -z.
import type { Landmark } from "../core/types";
import { JOINT } from "../pose/signals";

export type HeroAction =
  | "idle" | "block" | "duck" | "dodgeLeft" | "dodgeRight" | "punch" | "thrust" | "hurt" | "victory" | "defeat";

export interface MutableLandmark { x: number; y: number; z: number; visibility: number }
export type Pose = MutableLandmark[];
type V3 = [number, number, number];

const J = JOINT;
/** The landmark numbers the figure draws. */
export const USED: readonly number[] = Object.values(J);
const ANKLE_Y = 0.9;

export function makePose(): Pose {
  return Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
}

function put(out: Pose, index: number, x: number, y: number, z: number): void {
  const point = out[index];
  if (!point) return;
  point.x = x; point.y = y; point.z = z; point.visibility = 1;
}

function mix(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

const smooth = (p: number): number => p * p * (3 - 2 * p);
const clamp01 = (p: number): number => Math.min(1, Math.max(0, p));

/**
 * `tSeconds` drives the idle breathing and weight shift. `progress` (0..1) is how far a one-shot action (punch,
 * thrust, hurt) has run, or how far victory and defeat have settled. Writes into `out` and returns it.
 */
export function syntheticPose(action: HeroAction, tSeconds: number, progress: number, out: Pose = makePose()): Pose {
  const p = clamp01(progress);
  const env = Math.sin(Math.PI * p);
  let shiftX = Math.sin(tSeconds * 1.1) * 0.03;
  let bob = Math.sin(tSeconds * 2.2) * 0.012;
  let drop = 0;
  let lean = 0;
  let step = 0;
  let headDy = -0.72;
  let headZ = -0.08;
  // Wrists and elbows as [x, y, z]; the guard is both fists up in front of the chin.
  const lw: V3 = [-0.14, -0.62, -0.28];
  const rw: V3 = [0.14, -0.62, -0.28];
  const le: V3 = [-0.26, -0.3, -0.1];
  const re: V3 = [0.26, -0.3, -0.1];
  const set = (a: V3, x: number, y: number, z: number): void => { a[0] = x; a[1] = y; a[2] = z; };

  switch (action) {
    case "block":
      set(lw, -0.07, -0.66, -0.3); set(rw, 0.07, -0.66, -0.3);
      set(le, -0.24, -0.36, -0.18); set(re, 0.24, -0.36, -0.18);
      lean = -0.03;
      break;
    case "duck":
      drop = 0.38; lean = -0.1; headDy = -0.66;
      break;
    case "dodgeLeft":
      shiftX = -0.32; step = -0.12; lean = 0.02;
      break;
    case "dodgeRight":
      shiftX = 0.32; step = 0.12; lean = 0.02;
      break;
    case "punch":
      set(rw, 0.1, -0.58, -0.28 - 0.5 * env); set(re, 0.2, -0.46, -0.15 - 0.3 * env);
      lean = -0.08 * env; shiftX += 0.04 * env;
      break;
    case "thrust":
      set(lw, -0.07, -0.5, -0.3 - 0.55 * env); set(rw, 0.07, -0.5, -0.3 - 0.55 * env);
      set(le, -0.2, -0.42, -0.2 - 0.28 * env); set(re, 0.2, -0.42, -0.2 - 0.28 * env);
      lean = -0.12 * env; drop = 0.04 * env;
      break;
    case "hurt":
      set(lw, -0.14 - 0.15 * env, -0.62 + 0.25 * env, -0.28 + 0.25 * env);
      set(rw, 0.14 + 0.15 * env, -0.62 + 0.25 * env, -0.28 + 0.25 * env);
      lean = 0.25 * env; drop = 0.05 * env; headZ += 0.1 * env;
      break;
    case "victory": {
      const k = smooth(p);
      set(lw, mix(-0.14, -0.3, k), mix(-0.62, -1.05, k), mix(-0.28, -0.05, k));
      set(rw, mix(0.14, 0.3, k), mix(-0.62, -1.05, k), mix(-0.28, -0.05, k));
      set(le, mix(-0.26, -0.32, k), mix(-0.3, -0.75, k), mix(-0.1, -0.05, k));
      set(re, mix(0.26, 0.32, k), mix(-0.3, -0.75, k), mix(-0.1, -0.05, k));
      bob = Math.sin(tSeconds * 5) * 0.03 * k;
      headDy = -0.74;
      break;
    }
    case "defeat": {
      const k = smooth(p);
      set(lw, mix(-0.14, -0.25, k), mix(-0.62, -0.05, k), mix(-0.28, -0.25, k));
      set(rw, mix(0.14, 0.25, k), mix(-0.62, -0.05, k), mix(-0.28, -0.25, k));
      set(le, mix(-0.26, -0.26, k), mix(-0.3, -0.25, k), mix(-0.1, -0.2, k));
      set(re, mix(0.26, 0.26, k), mix(-0.3, -0.25, k), mix(-0.1, -0.2, k));
      drop = 0.5 * k; lean = -0.3 * k; headDy = mix(-0.72, -0.55, k); headZ -= 0.1 * k;
      bob = 0; shiftX *= 1 - k;
      break;
    }
    case "idle":
      break;
  }

  const upY = drop + bob;
  const upZ = lean;
  put(out, J.leftHip, -0.1 + shiftX * 0.3, drop, lean * 0.3);
  put(out, J.rightHip, 0.1 + shiftX * 0.3, drop, lean * 0.3);
  put(out, J.leftShoulder, -0.19 + shiftX, -0.5 + upY, upZ);
  put(out, J.rightShoulder, 0.19 + shiftX, -0.5 + upY, upZ);
  put(out, J.nose, shiftX + step * 0.4, headDy + upY, headZ + upZ);
  put(out, J.leftElbow, le[0] + shiftX, le[1] + upY, le[2] + upZ);
  put(out, J.rightElbow, re[0] + shiftX, re[1] + upY, re[2] + upZ);
  put(out, J.leftWrist, lw[0] + shiftX, lw[1] + upY, lw[2] + upZ);
  put(out, J.rightWrist, rw[0] + shiftX, rw[1] + upY, rw[2] + upZ);
  // Feet stay planted (left foot forward); the knees bend forward as the hips come down.
  put(out, J.leftAnkle, -0.17 + step, ANKLE_Y, -0.15);
  put(out, J.rightAnkle, 0.17 + step, ANKLE_Y, 0.15);
  const kneeZ = 0.1 + drop * 0.6;
  put(out, J.leftKnee, -0.15 + step * 0.5 + shiftX * 0.15, (drop + ANKLE_Y) / 2, -0.07 - kneeZ);
  put(out, J.rightKnee, 0.15 + step * 0.5 + shiftX * 0.15, (drop + ANKLE_Y) / 2, 0.07 - kneeZ);
  return out;
}

/** out = from + (to - from) * k, on the joints the figure draws. `out` may be `from`. */
export function blendPose(out: Pose, from: readonly Landmark[], to: readonly Landmark[], k: number): void {
  for (const index of USED) {
    const a = from[index];
    const b = to[index];
    const o = out[index];
    if (!a || !b || !o) continue;
    o.x = mix(a.x, b.x, k); o.y = mix(a.y, b.y, k); o.z = mix(a.z, b.z, k); o.visibility = 1;
  }
}

/** Which action the keyboard or fight state says the hero is in. Pure so it can be tested. */
export interface ActionInput {
  held: ReadonlySet<string>;
  struckMove: string;
  sinceStrike: number;
  sinceHurt: number;
  won: boolean;
  lost: boolean;
  finisherMove: string | null;
}

export const STRIKE_SECONDS = 0.32;
export const HURT_SECONDS = 0.45;
const TWO_HANDED = new Set(["stake_thrust", "double_palm", "spear_thrust"]);

export function chooseAction(input: ActionInput): HeroAction {
  if (input.lost) return "defeat";
  // The killing blow shows first, then the victory pose.
  if (input.won && input.sinceStrike >= STRIKE_SECONDS) return "victory";
  if (input.sinceHurt < HURT_SECONDS) return "hurt";
  if (input.held.has("block")) return "block";
  if (input.held.has("duck")) return "duck";
  if (input.held.has("dodge_left")) return "dodgeLeft";
  if (input.held.has("dodge_right")) return "dodgeRight";
  if (input.sinceStrike < STRIKE_SECONDS) {
    return TWO_HANDED.has(input.struckMove) || input.struckMove === input.finisherMove ? "thrust" : "punch";
  }
  return "idle";
}
