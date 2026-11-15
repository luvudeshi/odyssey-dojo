import type { Baseline, MoveDef, PoseFrame, PoseHistory } from "../../core/types";
import { clamp01, bothNewest, headOffset, latest, meanOf, recent, shoulderCenter, shoulderWidth } from "../../pose/signals";

/** A webcam's landmarks shake by about 1% of the frame; the shift is also read from this many milliseconds of frames. */
const STEADY_MS = 200;
/** A player who has backed away since calibration looks smaller, and so does their step: allow for up to this much. */
const SMALLEST = 0.75;
/**
 * How much of the head's own sideways tilt is added to the shoulders' shift. Seated, a dodge is a lean: the owner's
 * shoulders moved 0.17 widths while his head went 0.43 further. Half of it keeps a turned head (0.27) or the twist
 * of a punch (0.35) under the line.
 */
const HEAD = 0.5;
/** The shift, in calibrated shoulder widths, that reads as a full dodge. The hold level (0.5) is half of it, about 10 cm. */
const FULL = 0.45;

/** How far the upper body has moved since calibration, in calibrated shoulder widths: negative to the player's left. */
export function shiftOver(frames: readonly PoseFrame[], baseline: Baseline): number {
  if (frames.length === 0 || baseline.shoulderWidth <= 0) return 0;
  const centre = meanOf(frames, (frame) => shoulderCenter(frame).x);
  const size = Math.min(1, Math.max(SMALLEST, meanOf(frames, shoulderWidth) / baseline.shoulderWidth));
  const shoulders = (centre - baseline.centerX) / (baseline.shoulderWidth * size);
  return shoulders + HEAD * meanOf(frames, headOffset);
}

/**
 * How sure it is that the upper body has moved to one side since calibration: -1 for the player's left, 1 for
 * their right. The newest two frames start the dodge at once; the steadied reading keeps it through the shake.
 * Shared with dodge right.
 */
export function sideStep(history: PoseHistory, side: -1 | 1): number {
  const baseline = history.baseline;
  if (!latest(history) || !baseline) return 0;
  const quick = bothNewest(history, (frames) => side * shiftOver(frames, baseline));
  const steady = side * shiftOver(recent(history, STEADY_MS), baseline);
  return clamp01(Math.max(quick, steady) / FULL);
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
