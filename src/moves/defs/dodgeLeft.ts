import type { Baseline, MoveDef, PoseFrame, PoseHistory } from "../../core/types";
import { clamp01, latest, recent, shoulderCenter, shoulderWidth } from "../../pose/signals";

/** A webcam's landmarks shake by about 1% of the frame; the shift is read from this many milliseconds of frames. */
const STEADY_MS = 200;
/** A player who has backed away since calibration looks smaller, and so does their step: allow for up to this much. */
const SMALLEST = 0.75;

function shiftOver(frames: readonly PoseFrame[], baseline: Baseline): number {
  const centre = frames.reduce((sum, frame) => sum + shoulderCenter(frame).x, 0) / frames.length;
  const width = frames.reduce((sum, frame) => sum + shoulderWidth(frame), 0) / frames.length;
  const size = Math.min(1, Math.max(SMALLEST, width / baseline.shoulderWidth));
  return (centre - baseline.centerX) / (baseline.shoulderWidth * size);
}

/**
 * How sure it is that the shoulders have moved to one side since calibration: -1 for the player's left, 1 for
 * their right. The newest frame alone starts the dodge at once; the steadied reading keeps it through the shake.
 * Shared with dodge right.
 */
export function sideStep(history: PoseHistory, side: -1 | 1): number {
  const frame = latest(history);
  if (!frame || !history.baseline) return 0;
  const now = side * shiftOver([frame], history.baseline);
  const steady = side * shiftOver(recent(history, STEADY_MS), history.baseline);
  return clamp01(Math.max(now, steady) / 0.6);
}

export const move: MoveDef = {
  id: "dodge_left",
  name: "Dodge left",
  kind: "defend",
  prompt: "DODGE LEFT",
  hint: "Lean or step to your left",
  key: "ArrowLeft",
  diagram: { leftElbow: [34, 46], leftWrist: [33, 60], rightElbow: [66, 46], rightWrist: [67, 60], shiftX: -14 },
  teaches: "Step off the line of a rush: a moving target is hard to reach and free to get away",
  detect(history) {
    return sideStep(history, -1);
  },
};
