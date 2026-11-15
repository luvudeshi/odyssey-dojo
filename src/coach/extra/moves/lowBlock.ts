// Low block: one arm swept from the opposite shoulder down and out past its own hip. Either arm counts.
// It starts where the knife hand starts; what tells the two apart is where the hand ends: low, under the chest.
// What tells it from a hand just dropped to the side is that it ends clear of the hip.
// For the Training Dojo only: not in the game's registry.
import type { MoveDef } from "../../../core/types";
import { wristOut, wristRise } from "../../../moves/handSignals";
import { elbowAngle } from "../../../pose/signals";
import { atLeast, atMost, eitherSide, now, since } from "../signals";

/** The hand ends at least this far under the shoulder line, in shoulder widths (so the threshold is negative). */
export const LOW = -0.9;
/** ...and at least this far out to its own side of the centre line. A hanging hand is 0.6 out. */
export const CLEAR = 0.9;
export const SWEPT_STRAIGHT = 140;
/** How long ago the hand may have been across the body at chest height or above, in milliseconds. */
export const SWEEP_MS = 500;

const block = eitherSide((side) => [
  atMost(`ms since ${side} hand was across at the other shoulder`, SWEEP_MS, since((frame) => wristOut(frame, side) < 0.1 && wristRise(frame, side) > -0.6)),
  atMost(`${side} hand swept down low, shoulder widths above the shoulder line`, LOW, now((frame) => wristRise(frame, side))),
  atLeast(`${side} hand out past its hip, shoulder widths from the centre line`, CLEAR, now((frame) => wristOut(frame, side))),
  atLeast(`${side} arm ends straight, degrees at the elbow`, SWEPT_STRAIGHT, now((frame) => elbowAngle(frame, side))),
]);
export const measures = block.measures;

export const move: MoveDef = {
  id: "low_block",
  name: "Low block",
  kind: "defend",
  prompt: "LOW BLOCK",
  hint: "Bring one hand up to your other shoulder, then sweep it down and out past your hip",
  key: "x",
  diagram: { leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [70, 47], rightWrist: [79, 60] },
  teaches: "An arm swept down and out moves a low kick aside before it reaches you.",
  detect(history) {
    return block.side(history) ? 1 : 0;
  },
};
