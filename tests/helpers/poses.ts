// Synthetic pose sequences for detector tests. Same conventions as the real tracker (src/pose/tracker.ts):
// image x is mirrored so the player's left is screen left (smaller x); y grows downward; world x is negated
// to match, in meters from the hips, with y growing downward and z negative toward the camera.
// Arms are written once for the LEFT side; the right arm is the mirror image.
import type { PoseFrame, PoseHistory } from "../../src/core/types";
import { EMPTY_HISTORY, JOINT, pushFrame } from "../../src/pose/signals";
import { frameAt } from "../poseFixture";

const J = JOINT;
type P2 = readonly [number, number];
type P3 = readonly [number, number, number];

/** One arm in left-side coordinates: elbow and wrist in the image (0..1) and in the world (meters). */
export interface Arm {
  readonly elbow: P2;
  readonly wrist: P2;
  readonly elbow3: P3;
  readonly wrist3: P3;
}

/** One leg in left-side coordinates: knee and ankle in the image (0..1) and in the world (meters from the hips). */
export interface Leg {
  readonly knee: P2;
  readonly ankle: P2;
  readonly knee3: P3;
  readonly ankle3: P3;
}

/** Both arms plus how far the whole upper body has moved in the image (dodge: dx, duck: dy). */
export interface Pose {
  readonly left: Arm;
  readonly right: Arm;
  readonly dx: number;
  readonly dy: number;
  /** Only when the camera sees the whole body. Without it the knees and ankles are out of the picture. */
  readonly legs?: { readonly left: Leg; readonly right: Leg };
}

// Shoulders sit at image x .42 / .58, y .35 and world (-+.2, -.5, 0): see tests/poseFixture.ts.
export const DOWN: Arm = { elbow: [0.4, 0.5], wrist: [0.4, 0.62], elbow3: [-0.22, -0.2, 0], wrist3: [-0.22, 0.05, 0] };
/** Fist drawn back to the shoulder, elbow sharply bent: the start of a punch. */
export const COCKED: Arm = { elbow: [0.38, 0.5], wrist: [0.44, 0.42], elbow3: [-0.25, -0.25, 0], wrist3: [-0.15, -0.45, -0.15] };
/** Arm straight out at shoulder height: the end of a punch. */
export const PUNCH: Arm = { elbow: [0.4, 0.36], wrist: [0.39, 0.33], elbow3: [-0.25, -0.5, -0.25], wrist3: [-0.3, -0.5, -0.5] };
/** Arm straight out to the side at shoulder height: the end of a knife hand, wrist far from the shoulder in the picture. */
export const LATERAL: Arm = { elbow: [0.31, 0.35], wrist: [0.21, 0.35], elbow3: [-0.25, -0.5, -0.25], wrist3: [-0.3, -0.5, -0.5] };
/** Arm straight out in front with the wrist near the middle of the picture. */
export const PALM: Arm = { elbow: [0.44, 0.36], wrist: [0.45, 0.33], elbow3: [-0.2, -0.5, -0.25], wrist3: [-0.2, -0.5, -0.5] };
/** Fist guarding the face. */
export const GUARD: Arm = { elbow: [0.4, 0.42], wrist: [0.45, 0.24], elbow3: [-0.25, -0.25, 0], wrist3: [-0.15, -0.45, -0.15] };
/** Fist pulled back to the hip, elbow bent. */
export const HIP: Arm = { elbow: [0.36, 0.52], wrist: [0.43, 0.6], elbow3: [-0.3, -0.2, 0.1], wrist3: [-0.1, -0.15, 0] };
/** Fist raised above the head. */
export const OVERHEAD: Arm = { elbow: [0.38, 0.2], wrist: [0.42, 0.08], elbow3: [-0.28, -0.65, 0], wrist3: [-0.2, -0.85, -0.05] };
/** Fist swung down in front, below the shoulder line. */
export const CHOP: Arm = { elbow: [0.38, 0.4], wrist: [0.42, 0.45], elbow3: [-0.25, -0.4, -0.1], wrist3: [-0.2, -0.2, -0.3] };
/** Right hand across to the left shoulder, elbow bent (written in left-side coordinates). */
export const ACROSS: Arm = { elbow: [0.52, 0.42], wrist: [0.6, 0.3], elbow3: [0, -0.35, -0.1], wrist3: [0.1, -0.5, -0.2] };
/** Hook start: left elbow out and bent about 70 degrees, fist at shoulder height, on the left side. */
export const HOOK_OUT: Arm = { elbow: [0.3, 0.35], wrist: [0.26, 0.35], elbow3: [-0.35, -0.5, -0.1], wrist3: [-0.1, -0.5, -0.3] };
/** Hook finish: the same bent arm with the fist swung in front of the chest. */
export const HOOK_IN: Arm = { elbow: [0.3, 0.35], wrist: [0.42, 0.35], elbow3: [-0.35, -0.5, -0.1], wrist3: [-0.1, -0.5, -0.3] };
/** One hand of a two-handed stake grip at the chest. */
export const STAKE_CHEST: Arm = { elbow: [0.38, 0.47], wrist: [0.48, 0.42], elbow3: [-0.3, -0.3, -0.05], wrist3: [-0.03, -0.35, -0.2] };
/** One hand of the stake driven forward and down, arm straight. */
export const STAKE_DOWN: Arm = { elbow: [0.45, 0.46], wrist: [0.48, 0.56], elbow3: [-0.12, -0.33, -0.25], wrist3: [-0.03, -0.15, -0.5] };

// Hips sit at image x .45 / .55, y .65 and world (-+.1, 0, 0); the floor is near image y .95.
/** Standing leg: knee under the hip, foot on the floor. */
export const LEG_DOWN: Leg = { knee: [0.45, 0.8], ankle: [0.45, 0.95], knee3: [-0.1, 0.45, 0], ankle3: [-0.1, 0.88, 0] };
/** Knee lifted only a little, foot just off the floor: too low to be a knee strike. */
export const LEG_HALF: Leg = { knee: [0.45, 0.76], ankle: [0.45, 0.9], knee3: [-0.1, 0.35, -0.2], ankle3: [-0.1, 0.75, -0.1] };
/** Kick chamber: thigh level, lower leg folded under the knee. */
export const LEG_CHAMBER: Leg = { knee: [0.45, 0.67], ankle: [0.45, 0.8], knee3: [-0.1, 0.05, -0.4], ankle3: [-0.1, 0.4, -0.3] };
/** Front kick finish: leg straight out toward the camera, foot at hip height. */
export const LEG_KICK: Leg = { knee: [0.45, 0.66], ankle: [0.45, 0.68], knee3: [-0.1, 0.05, -0.42], ankle3: [-0.1, 0, -0.85] };
/** Knee strike: knee driven above the hip, foot tucked under it. */
export const LEG_KNEE: Leg = { knee: [0.45, 0.62], ankle: [0.45, 0.78], knee3: [-0.1, -0.05, -0.42], ankle3: [-0.1, 0.3, -0.35] };

export function pose(left: Arm, right: Arm = left, dx = 0, dy = 0): Pose {
  return { left, right, dx, dy };
}
export const NEUTRAL: Pose = pose(DOWN);

/** The same pose with the legs in view. */
export function withLegs(p: Pose, left: Leg = LEG_DOWN, right: Leg = LEG_DOWN): Pose {
  return { ...p, legs: { left, right } };
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const mix2 = (a: P2, b: P2, k: number): P2 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const mix3 = (a: P3, b: P3, k: number): P3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const mixArm = (a: Arm, b: Arm, k: number): Arm => ({
  elbow: mix2(a.elbow, b.elbow, k),
  wrist: mix2(a.wrist, b.wrist, k),
  elbow3: mix3(a.elbow3, b.elbow3, k),
  wrist3: mix3(a.wrist3, b.wrist3, k),
});
const mixLeg = (a: Leg, b: Leg, k: number): Leg => ({
  knee: mix2(a.knee, b.knee, k),
  ankle: mix2(a.ankle, b.ankle, k),
  knee3: mix3(a.knee3, b.knee3, k),
  ankle3: mix3(a.ankle3, b.ankle3, k),
});
const STANDING_LEGS = { left: LEG_DOWN, right: LEG_DOWN };
/** Legs stay out of the picture only when neither pose has them; otherwise a missing pair counts as standing. */
const mixLegs = (a: Pose, b: Pose, k: number): Pick<Pose, "legs"> => {
  if (!a.legs && !b.legs) return {};
  const from = a.legs ?? STANDING_LEGS;
  const to = b.legs ?? STANDING_LEGS;
  return { legs: { left: mixLeg(from.left, to.left, k), right: mixLeg(from.right, to.right, k) } };
};
const mixPose = (a: Pose, b: Pose, k: number): Pose => ({
  left: mixArm(a.left, b.left, k),
  right: mixArm(a.right, b.right, k),
  dx: lerp(a.dx, b.dx, k),
  dy: lerp(a.dy, b.dy, k),
  ...mixLegs(a, b, k),
});

export function frameOf(t: number, p: Pose): PoseFrame {
  const at = (x: number, y: number): P2 => [x + p.dx, y + p.dy];
  const mirror = (point: P2): P2 => at(1 - point[0], point[1]);
  const flip = (point: P3): P3 => [-point[0], point[1], point[2]];
  const legs = p.legs;
  return frameAt(
    t,
    {
      [J.nose]: at(0.5, 0.2),
      [J.leftShoulder]: at(0.42, 0.35), [J.rightShoulder]: at(0.58, 0.35),
      [J.leftHip]: at(0.45, 0.65), [J.rightHip]: at(0.55, 0.65),
      [J.leftElbow]: at(...p.left.elbow), [J.rightElbow]: mirror(p.right.elbow),
      [J.leftWrist]: at(...p.left.wrist), [J.rightWrist]: mirror(p.right.wrist),
      ...(legs && {
        [J.leftKnee]: at(...legs.left.knee), [J.rightKnee]: mirror(legs.right.knee),
        [J.leftAnkle]: at(...legs.left.ankle), [J.rightAnkle]: mirror(legs.right.ankle),
      }),
    },
    {
      [J.leftElbow]: p.left.elbow3, [J.rightElbow]: flip(p.right.elbow3),
      [J.leftWrist]: p.left.wrist3, [J.rightWrist]: flip(p.right.wrist3),
      ...(legs && {
        [J.leftHip]: [-0.1, 0, 0], [J.rightHip]: [0.1, 0, 0],
        [J.leftKnee]: legs.left.knee3, [J.rightKnee]: flip(legs.right.knee3),
        [J.leftAnkle]: legs.left.ankle3, [J.rightAnkle]: flip(legs.right.ankle3),
      }),
    },
  );
}

/** A pose reached `t` milliseconds after the action starts. Keys are in time order. */
export interface Key {
  readonly t: number;
  readonly pose: Pose;
}

const FRAME_MS = 33;
const SETTLE_FRAMES = 20;

function poseAt(keys: readonly Key[], t: number): Pose {
  const after = keys.findIndex((key) => key.t >= t);
  const next = keys[after];
  const prev = keys[after - 1];
  if (!next) return keys.at(-1)?.pose ?? NEUTRAL;
  if (!prev) return next.pose;
  return mixPose(prev.pose, next.pose, (t - prev.t) / (next.t - prev.t));
}

/** Frames a webcam would give: 20 still frames (they set the baseline), then the keyframes blended at about 30 fps. */
export function sequence(keys: readonly Key[]): PoseFrame[] {
  const frames: PoseFrame[] = [];
  for (let i = 0; i < SETTLE_FRAMES; i++) frames.push(frameOf(i * FRAME_MS, NEUTRAL));
  const start = SETTLE_FRAMES * FRAME_MS;
  const end = keys.at(-1)?.t ?? 0;
  for (let t = 0; t < end; t += FRAME_MS) frames.push(frameOf(start + t, poseAt(keys, t)));
  frames.push(frameOf(start + end, poseAt(keys, end)));
  return frames;
}

/** Standing still for `ms`, with the small wobble a real person has. */
export function standing(ms = 2000): PoseFrame[] {
  const frames: PoseFrame[] = [];
  for (let i = 0; i * FRAME_MS <= ms; i++) {
    frames.push(frameOf(i * FRAME_MS, pose(DOWN, DOWN, 0.004 * Math.sin(i / 3), 0.003 * Math.cos(i / 4))));
  }
  return frames;
}

/** The history the game would hold after each frame: every prefix of the sequence. */
export function histories(frames: readonly PoseFrame[]): PoseHistory[] {
  const out: PoseHistory[] = [];
  let history = EMPTY_HISTORY;
  for (const frame of frames) {
    history = pushFrame(history, frame);
    out.push(history);
  }
  return out;
}

/** The highest confidence a detector reaches at any frame of the sequence. */
export function peak(detect: (history: PoseHistory) => number, frames: readonly PoseFrame[]): number {
  return Math.max(0, ...histories(frames).map(detect));
}
