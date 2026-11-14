// How well a strike was thrown, 0 to 1, from the pose history. Shared by every strike move's `quality`.
import type { PoseHistory } from "../core/types";
import { JOINT, clamp01, distance2d, elbowAngle, joint, latest, recent, shoulderWidth } from "./signals";
import { wristRise } from "../moves/handSignals";
import type { Side } from "../moves/handSignals";

const WINDOW_MS = 400;
/** Wrist speed in shoulder widths per second that counts as a full-speed strike. A full arm (about 2 widths) in 200 ms is 10. */
const FULL_SPEED = 11;
const MIN_VISIBILITY = 0.5;
const MIN_SPAN_MS = 100;
const MAX_SPAN_MS = 250;
const BENT = 90;
const STRAIGHT = 170;

export interface StrikeShape {
  /** Hands that threw the strike. */
  readonly sides: readonly Side[];
  /** Where the wrist should end up, in shoulder widths above the shoulder line. Default 0: shoulder height. */
  readonly rise?: number;
  /** How far from `rise` the wrist can be before aim reaches zero. Default 0.8. */
  readonly tolerance?: number;
  /** False for bent-arm strikes (hook, uppercut, palm): then the elbow angle is not scored. Default true. */
  readonly straight?: boolean;
}

/** Fastest wrist movement over the window, in shoulder widths per second. 0 with fewer than two usable frames. */
function peakSpeed(history: PoseHistory, side: Side): number {
  const joints = side === "left" ? JOINT.leftWrist : JOINT.rightWrist;
  // Skip frames where the wrist or a shoulder was guessed, so one bad detection cannot spike the speed.
  const frames = recent(history, WINDOW_MS).filter((frame) =>
    [joints, JOINT.leftShoulder, JOINT.rightShoulder].every((index) => joint(frame.image, index).visibility >= MIN_VISIBILITY),
  );
  let peak = 0;
  // Net displacement across MIN_SPAN_MS..MAX_SPAN_MS, never frame to frame: jitter / dt would grow with frame rate.
  for (const [i, b] of frames.entries()) {
    for (const a of frames.slice(0, i)) {
      const dt = (b.t - a.t) / 1000;
      const width = shoulderWidth(b);
      if (dt * 1000 < MIN_SPAN_MS || dt * 1000 > MAX_SPAN_MS || width === 0) continue;
      peak = Math.max(peak, distance2d(joint(a.image, joints), joint(b.image, joints)) / width / dt);
    }
  }
  return peak;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 0..1: speed counts half (or 0.7 for bent-arm strikes), then arm extension and aim at the end. Never NaN. */
export function strikeQuality(history: PoseHistory, shape: StrikeShape): number {
  const frame = latest(history);
  if (!frame || shape.sides.length === 0) return 0;
  const { rise = 0, tolerance = 0.8, straight = true } = shape;
  const speed = clamp01(mean(shape.sides.map((side) => peakSpeed(history, side))) / FULL_SPEED);
  const aim = clamp01(1 - mean(shape.sides.map((side) => Math.abs(wristRise(frame, side) - rise))) / tolerance);
  const reach = clamp01((mean(shape.sides.map((side) => elbowAngle(frame, side))) - BENT) / (STRAIGHT - BENT));
  const score = straight ? 0.5 * speed + 0.3 * reach + 0.2 * aim : 0.7 * speed + 0.3 * aim;
  return Number.isFinite(score) ? clamp01(score) : 0;
}

export type Rating = "GOOD" | "GREAT" | "PERFECT";

/** The word to flash for a strike, or null when it was too weak to praise. */
export function rating(quality: number): Rating | null {
  if (quality >= 0.92) return "PERFECT";
  if (quality >= 0.8) return "GREAT";
  return quality >= 0.55 ? "GOOD" : null;
}
