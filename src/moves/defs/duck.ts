import type { Baseline, MoveDef, PoseFrame } from "../../core/types";
import { bothNewest, clamp01, headHeight, headOffset, latest, meanOf, recent, shoulderCenter } from "../../pose/signals";
import { bodyWent } from "../looseSignals";

/** The head's sideways offset is read from this many milliseconds of frames: one frame of it shakes by 0.08 widths. */
const STEADY_MS = 200;

/** A shoulder drop since calibration, in calibrated shoulder widths, that reads as a full duck. Held from half of it. */
const FULL_DROP = 0.55;
/**
 * The nose this far above the shoulder line has started to go down, and this much lower is a full duck. Standing it
 * sits 0.55 to 0.95 above; seated, the owner's duck was a bend forward that took it to 0.3 below.
 */
const HEAD_TOP = 0.45;
const HEAD_RANGE = 0.5;
/**
 * A lean to the side lowers the shoulders and head too (0.29 widths on the owner's dodge right). The head moving
 * off the middle of the shoulders tells it apart: from this far off a duck starts to fade...
 */
const SIDEWAYS = 0.2;
/** ...and from this much further it is gone. A duck keeps the head within 0.1 of the middle; a dodge takes it 0.43 off. */
const SIDEWAYS_RANGE = 0.2;

function crouch(frames: readonly PoseFrame[], baseline: Baseline): number {
  const drop = (meanOf(frames, (frame) => shoulderCenter(frame).y) - baseline.shoulderY) / baseline.shoulderWidth;
  const headDown = (HEAD_TOP - meanOf(frames, headHeight)) / HEAD_RANGE;
  return clamp01(Math.max(drop / FULL_DROP, headDown));
}

export const move: MoveDef = {
  id: "duck",
  name: "Duck",
  kind: "defend",
  prompt: "DUCK",
  hint: "Bend your knees to drop under the swing",
  key: "ArrowDown",
  diagram: { leftElbow: [34, 46], leftWrist: [33, 60], rightElbow: [66, 46], rightWrist: [67, 60], shiftY: 16 },
  teaches: "Bend your knees, not your waist, to drop under a swing and still see what is coming",
  detect(history) {
    const baseline = history.baseline;
    if (!latest(history) || !baseline || baseline.shoulderWidth <= 0) return 0;
    // Two frames, so one bad frame cannot duck on its own. Needs only the head and shoulders: no hips or knees.
    const sideways = clamp01((Math.abs(meanOf(recent(history, STEADY_MS), headOffset)) - SIDEWAYS) / SIDEWAYS_RANGE);
    return bothNewest(history, (frames) => crouch(frames, baseline)) * (1 - sideways);
  },
  detectAsked(history) {
    return Math.max(move.detect(history), bodyWent(history, "down"));
  },
};
