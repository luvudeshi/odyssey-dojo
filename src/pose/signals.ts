// Small measurements on pose frames that move detectors share.
import type { Baseline, Landmark, PoseFrame, PoseHistory } from "../core/types";

/** MediaPipe pose landmark numbers. "left" is the player's own left. */
export const JOINT = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

const MISSING: Landmark = { x: 0, y: 0, z: 0, visibility: 0 };
const HISTORY_MS = 1000;
const BASELINE_FRAMES = 20;

export function joint(list: readonly Landmark[], index: number): Landmark {
  return list[index] ?? MISSING;
}

/**
 * The lowest visibility at which a joint is trusted. On a desk camera MediaPipe lite reports a plainly visible
 * elbow at 0.3 to 0.5, so 0.5 would throw real arms away.
 */
export const SEEN = 0.3;

/**
 * The lower of `read` on each of the newest two frames: the quickest reading that one bad frame cannot set off on
 * its own. With a single frame, that frame's reading.
 */
export function bothNewest(history: PoseHistory, read: (frames: readonly PoseFrame[]) => number): number {
  return Math.min(...history.frames.slice(-2).map((frame) => read([frame])));
}

/** The mean of `read` over the frames, 0 with none. */
export function meanOf(frames: readonly PoseFrame[], read: (frame: PoseFrame) => number): number {
  return frames.length === 0 ? 0 : frames.reduce((sum, frame) => sum + read(frame), 0) / frames.length;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function distance2d(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function latest(history: PoseHistory): PoseFrame | null {
  return history.frames.at(-1) ?? null;
}

/** Frames from the last `ms` milliseconds, oldest first. */
export function recent(history: PoseHistory, ms: number): readonly PoseFrame[] {
  const now = latest(history)?.t ?? 0;
  return history.frames.filter((frame) => now - frame.t <= ms);
}

export function shoulderWidth(frame: PoseFrame): number {
  return distance2d(joint(frame.image, JOINT.leftShoulder), joint(frame.image, JOINT.rightShoulder));
}

export function shoulderCenter(frame: PoseFrame): { x: number; y: number } {
  const left = joint(frame.image, JOINT.leftShoulder);
  const right = joint(frame.image, JOINT.rightShoulder);
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

/** How far the nose is to the player's right of the middle of the shoulders, in shoulder widths. About 0 facing the camera. */
export function headOffset(frame: PoseFrame): number {
  const width = shoulderWidth(frame);
  return width === 0 ? 0 : (joint(frame.image, JOINT.nose).x - shoulderCenter(frame).x) / width;
}

/** How far the nose is above the shoulder line, in shoulder widths. 0.55 to 0.95 standing, under 0.2 bent forward. */
export function headHeight(frame: PoseFrame): number {
  const width = shoulderWidth(frame);
  return width === 0 ? 0 : (shoulderCenter(frame).y - joint(frame.image, JOINT.nose).y) / width;
}

function arm(frame: PoseFrame, side: "left" | "right"): [Landmark, Landmark, Landmark] {
  const left = side === "left";
  return [
    joint(frame.world, left ? JOINT.leftShoulder : JOINT.rightShoulder),
    joint(frame.world, left ? JOINT.leftElbow : JOINT.rightElbow),
    joint(frame.world, left ? JOINT.leftWrist : JOINT.rightWrist),
  ];
}

/** Elbow bend in degrees, in 3D: 180 is a straight arm. */
export function elbowAngle(frame: PoseFrame, side: "left" | "right"): number {
  const [shoulder, elbow, wrist] = arm(frame, side);
  const a = [shoulder.x - elbow.x, shoulder.y - elbow.y, shoulder.z - elbow.z] as const;
  const b = [wrist.x - elbow.x, wrist.y - elbow.y, wrist.z - elbow.z] as const;
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const lengths = Math.hypot(...a) * Math.hypot(...b);
  return lengths === 0 ? 180 : (Math.acos(Math.min(1, Math.max(-1, dot / lengths))) * 180) / Math.PI;
}

function between(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function middle(a: Landmark, b: Landmark): Landmark {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, visibility: Math.min(a.visibility, b.visibility) };
}

/** Shoulder to shoulder on this frame's 3D body, in metres. About 0.4 for an adult. */
export function shoulderWidth3d(frame: PoseFrame): number {
  return between(joint(frame.world, JOINT.leftShoulder), joint(frame.world, JOINT.rightShoulder));
}

/** Middle of the shoulders to middle of the hips on this frame's 3D body, in metres. About 0.5 for an adult. */
export function torsoLength3d(frame: PoseFrame): number {
  const shoulders = middle(joint(frame.world, JOINT.leftShoulder), joint(frame.world, JOINT.rightShoulder));
  const hips = middle(joint(frame.world, JOINT.leftHip), joint(frame.world, JOINT.rightHip));
  return between(shoulders, hips);
}

/** The middle value, so one frame the tracker got wrong does not move the ruler. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[half] ?? 0) : ((sorted[half - 1] ?? 0) + (sorted[half] ?? 0)) / 2;
}

export function baselineOf(frames: readonly PoseFrame[]): Baseline {
  const count = frames.length;
  const sum = frames.reduce(
    (total, frame) => {
      const center = shoulderCenter(frame);
      return { x: total.x + center.x, y: total.y + center.y, w: total.w + shoulderWidth(frame) };
    },
    { x: 0, y: 0, w: 0 },
  );
  return {
    centerX: sum.x / count,
    shoulderY: sum.y / count,
    shoulderWidth: sum.w / count,
    shoulderWidth3d: median(frames.map(shoulderWidth3d)),
    torsoLength3d: median(frames.map(torsoLength3d)),
  };
}

export const EMPTY_HISTORY: PoseHistory = { frames: [], baseline: null };

/** Add a frame, drop frames older than a second, and set the baseline from the first frames seen. */
export function pushFrame(history: PoseHistory, frame: PoseFrame): PoseHistory {
  const frames = [...history.frames, frame].filter((old) => frame.t - old.t <= HISTORY_MS);
  const baseline =
    history.baseline ?? (frames.length >= BASELINE_FRAMES ? baselineOf(frames) : null);
  return { frames, baseline };
}
