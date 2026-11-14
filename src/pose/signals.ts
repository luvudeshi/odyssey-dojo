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

/** True when the arm is straight and the fist is at shoulder height. */
export function armOut(frame: PoseFrame, side: "left" | "right"): boolean {
  const [shoulder, , wrist] = arm(frame, side);
  return elbowAngle(frame, side) > 145 && Math.abs(wrist.y - shoulder.y) < 0.3;
}

/** True when the arm just went from bent to straight at shoulder height: a punch. */
export function armThrust(history: PoseHistory, side: "left" | "right"): boolean {
  const now = latest(history);
  if (!now || !armOut(now, side)) return false;
  return recent(history, 450).some((frame) => elbowAngle(frame, side) < 115);
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
  return { centerX: sum.x / count, shoulderY: sum.y / count, shoulderWidth: sum.w / count };
}

export const EMPTY_HISTORY: PoseHistory = { frames: [], baseline: null };

/** Add a frame, drop frames older than a second, and set the baseline from the first frames seen. */
export function pushFrame(history: PoseHistory, frame: PoseFrame): PoseHistory {
  const frames = [...history.frames, frame].filter((old) => frame.t - old.t <= HISTORY_MS);
  const baseline =
    history.baseline ?? (frames.length >= BASELINE_FRAMES ? baselineOf(frames) : null);
  return { frames, baseline };
}
