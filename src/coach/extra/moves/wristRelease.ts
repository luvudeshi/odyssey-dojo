// Wrist-grab release: with one arm held out in front (the grabbed wrist), fold the elbow forward so the hand comes
// in to its own shoulder. Either arm counts. This is not a pull straight back: the elbow goes toward the other
// person. What tells it from a punch coming back is that the arm was held out for a moment first, below shoulder
// height, and that the elbow ends in front of the shoulder, not behind it.
// For the Training Dojo only: not in the game's registry.
import type { Baseline, MoveDef, PoseFrame } from "../../../core/types";
import { wristRise } from "../../../moves/handSignals";
import type { Side } from "../../../moves/handSignals";
import { strikeQuality } from "../../../pose/quality";
import { elbowAngle } from "../../../pose/signals";
import { atLeast, atMost, eitherSide, elbowForward, handForward, handToShoulder, lastRun, now, since } from "../signals";

/** The elbow ends bent at most this far, in degrees. */
export const FOLDED = 90;
/** The hand ends no further than this from its own shoulder, in shoulder widths of the picture. */
export const HAND_IN = 1;
/** The elbow ends at least this far in front of its shoulder, in 3D shoulder widths. */
export const ELBOW_FORWARD = 0.3;
/** How long ago the arm may have been held out, in milliseconds. */
export const FOLD_MS = 300;
/** How long the arm has to have been held out first, in milliseconds. A punch is out for less. */
export const OUT_MS = 200;
const OUT_STRAIGHT = 130;
const OUT_REACH = 0.6;

/** The grabbed arm: nearly straight, reaching toward the camera, with the hand between the waist and the shoulders. */
export function heldOut(frame: PoseFrame, side: Side, baseline: Baseline | null): boolean {
  const rise = wristRise(frame, side);
  return elbowAngle(frame, side) >= OUT_STRAIGHT && handForward(frame, side, baseline) >= OUT_REACH && rise <= 0 && rise >= -1.5;
}

const release = eitherSide((side) => [
  atLeast(`ms ${side} arm stayed out first`, OUT_MS, lastRun((frame, baseline) => heldOut(frame, side, baseline))),
  atMost(`ms since ${side} arm was held out in front`, FOLD_MS, since((frame, baseline) => heldOut(frame, side, baseline))),
  atMost(`${side} elbow folded, degrees`, FOLDED, now((frame) => elbowAngle(frame, side))),
  atMost(`${side} hand in at its shoulder, shoulder widths away`, HAND_IN, now((frame) => handToShoulder(frame, side))),
  atLeast(`${side} elbow pointing forward, 3D shoulder widths ahead of its shoulder`, ELBOW_FORWARD, now((frame, baseline) => elbowForward(frame, side, baseline))),
]);
export const measures = release.measures;

export const move: MoveDef = {
  id: "wrist_release",
  name: "Wrist release",
  kind: "strike",
  prompt: "WRIST RELEASE",
  hint: "Hold one arm out in front, then fold your elbow forward so the hand comes in to your shoulder",
  key: "v",
  diagram: { leftElbow: [39, 45], leftWrist: [39, 31], rightElbow: [62, 42], rightWrist: [57, 26] },
  teaches: "Do not pull back from a wrist grab: fold your elbow in toward their arm instead.",
  detect(history) {
    return release.side(history) ? 1 : 0;
  },
  quality(history) {
    const side = release.side(history);
    return side ? strikeQuality(history, { sides: [side], straight: false, tolerance: 1 }) : 0;
  },
};
