// Side kick: the knee comes up, then the foot is pushed straight out to the side. Either leg counts.
// What tells it from a front kick and a roundhouse is where the foot ends: far out to the side of its hip.
// For the Training Dojo only: not in the game's registry.
import type { MoveDef } from "../../../core/types";
import { CHAMBER_MS, KICK_STRAIGHT, chambered } from "../../../moves/defs/frontKick";
import { footLift, kneeAngle, legsVisible } from "../../../moves/legSignals";
import { clamp01, latest } from "../../../pose/signals";
import { ankleOut, atLeast, atMost, eitherSide, now, since, yes } from "../signals";

/** The foot ends at least this far out to the side of its hip, in shoulder widths. */
export const FOOT_OUT = 1.2;
/** ...and at least this far off the floor. Lower than a front kick: a side kick may be aimed low. */
export const SIDE_LIFT = 0.6;

const kick = eitherSide((side) => [
  atLeast("legs in view", 1, now((frame) => yes(legsVisible(frame)))),
  atMost(`ms since ${side} knee was lifted and folded`, CHAMBER_MS, since((frame) => chambered(frame, side))),
  atLeast(`${side} foot out to the side, shoulder widths from its hip`, FOOT_OUT, now((frame) => ankleOut(frame, side))),
  atLeast(`${side} foot off the floor, shoulder widths above the other`, SIDE_LIFT, now((frame) => footLift(frame, side))),
  atLeast(`${side} leg pushed straight, degrees`, KICK_STRAIGHT, now((frame) => kneeAngle(frame, side))),
]);
export const measures = kick.measures;

export const move: MoveDef = {
  id: "side_kick",
  name: "Side kick",
  kind: "strike",
  prompt: "SIDE KICK",
  hint: "Lift your knee, then push your foot straight out to the side until the leg is straight",
  key: "d",
  diagram: {
    leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [62, 42], rightWrist: [57, 26],
    rightKnee: [68, 62], rightFoot: [88, 60],
  },
  teaches: "A kick out to the side keeps someone at leg length without stepping in closer.",
  detect(history) {
    return kick.side(history) ? 1 : 0;
  },
  /** Better the further out the foot goes and the straighter the leg ends up. */
  quality(history) {
    const frame = latest(history);
    const side = kick.side(history);
    if (!frame || !side) return 0;
    const far = clamp01((ankleOut(frame, side) - FOOT_OUT) / 0.8);
    const straight = clamp01((kneeAngle(frame, side) - KICK_STRAIGHT) / 35);
    return clamp01(0.5 + 0.25 * far + 0.25 * straight);
  },
};
