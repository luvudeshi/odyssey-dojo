// High block: one forearm lifted level above the forehead, elbow out to the side, to cover the head. Either arm
// counts. What tells it from the two-fisted block is one arm, above the nose, with the forearm lying across; what
// tells it from a hand raised to chop is that same forearm, which a raised hand stands upright.
// For the Training Dojo only: not in the game's registry.
import type { MoveDef, PoseFrame } from "../../../core/types";
import { otherSide, wristRise } from "../../../moves/handSignals";
import type { Side } from "../../../moves/handSignals";
import { joint, shoulderWidth } from "../../../pose/signals";
import { atLeast, atMost, eitherSide, elbowRise, heldFor, limb, met, now, wristOverNose } from "../signals";

/** The wrist is no more than this far under the nose, in shoulder widths: at the forehead or above. */
export const WRIST_UP = -0.1;
/** The elbow is no more than this far under the shoulder line. */
export const ELBOW_UP = -0.1;
/** The forearm covers at least this much of the picture from side to side, in shoulder widths. */
export const ACROSS = 0.5;
/** ...and rises no more than this many times as far as it runs across: about 50 degrees. */
export const TILT = 1.2;
/** The block has to stay up this long, in milliseconds, so one odd frame is not a block. */
export const UP_MS = 60;

function forearm(frame: PoseFrame, side: Side): { across: number; tilt: number } {
  const width = shoulderWidth(frame);
  const elbow = joint(frame.image, limb(side).elbow);
  const wrist = joint(frame.image, limb(side).wrist);
  const run = Math.abs(wrist.x - elbow.x);
  return { across: width === 0 ? NaN : run / width, tilt: run === 0 ? Infinity : Math.abs(wrist.y - elbow.y) / run };
}

const block = eitherSide((side) => {
  const shape = [
    atLeast(`${side} wrist up at your forehead, shoulder widths above the nose`, WRIST_UP, now((frame) => wristOverNose(frame, side)), 0.5),
    atLeast(`${side} elbow up and out, shoulder widths above the shoulder line`, ELBOW_UP, now((frame) => elbowRise(frame, side)), 0.5),
    atLeast(`${side} forearm lying across, shoulder widths from elbow to wrist`, ACROSS, now((frame) => forearm(frame, side).across)),
    atMost(`${side} forearm kept level, rise for each step across`, TILT, now((frame) => forearm(frame, side).tilt)),
    atMost(`${otherSide(side)} hand kept down, shoulder widths above the shoulder line`, 0, now((frame) => wristRise(frame, otherSide(side))), 0.5),
  ];
  return [...shape, atLeast(`ms ${side} forearm has stayed up`, UP_MS, heldFor((frame, baseline) => met(shape, { frames: [frame], baseline })))];
});
export const measures = block.measures;

export const move: MoveDef = {
  id: "high_block",
  name: "High block",
  kind: "defend",
  prompt: "HIGH BLOCK",
  hint: "Lift one forearm level above your forehead, elbow out to the side, other hand down",
  key: "y",
  diagram: { leftElbow: [26, 20], leftWrist: [45, 11], rightElbow: [66, 46], rightWrist: [67, 60] },
  teaches: "A forearm raised level with your forehead takes a blow coming at your head.",
  detect(history) {
    return block.side(history) ? 1 : 0;
  },
};
