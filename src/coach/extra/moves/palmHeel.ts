// Palm heel strike: the heel of one open hand pushed straight out to face height. Either hand counts.
// The camera cannot see an open hand, so what tells it from a jab or a cross is where it ends: at face height,
// above the shoulder line, where a punch ends level with the shoulder. It is not the rising palm either: that one
// comes up from the waist with the elbow kept low and bent.
// For the Training Dojo only: not in the game's registry.
import type { MoveDef } from "../../../core/types";
import { otherSide, throwDegrees, upperArmLift, wristOut, wristRise } from "../../../moves/handSignals";
import { strikeQuality } from "../../../pose/quality";
import { elbowAngle } from "../../../pose/signals";
import { atLeast, atMost, eitherSide, now, since, wristOverNose } from "../signals";

/** The elbow reads as open from here, in degrees. A hand pushed at the camera reads short of straight. */
export const PALM_OPEN = 120;
/** The hand ends between these, in shoulder widths above the shoulder line: chin to forehead. */
export const FACE_LOW = 0.3;
export const FACE_HIGH = 1.3;
/** ...and no further out to its own side than this: in front of the body. */
export const PALM_WIDE = 1;
/** The upper arm is lifted at least this far from hanging, in degrees: the push goes forward, not up from below. */
export const PALM_LIFT = 50;
/** The push is fast: the elbow opens, or the upper arm rises, by this many degrees in 250 ms. */
export const PALM_SNAP = 35;
/** A hand that was over the head this recently is chopping down, not pushing out. In milliseconds. */
export const NOT_A_CHOP_MS = 500;

const strike = eitherSide((side) => {
  const other = otherSide(side);
  return [
    atLeast(`${side} arm pushed out, degrees at the elbow`, PALM_OPEN, now((frame) => elbowAngle(frame, side))),
    atLeast(`${side} hand at face height, shoulder widths above the shoulder line`, FACE_LOW, now((frame) => wristRise(frame, side))),
    atMost(`${side} hand below head top, shoulder widths above the shoulder line`, FACE_HIGH, now((frame) => wristRise(frame, side))),
    atMost(`${side} hand in front, shoulder widths out to its side`, PALM_WIDE, now((frame) => wristOut(frame, side))),
    atLeast(`${side} upper arm lifted, degrees from hanging`, PALM_LIFT, now((frame) => upperArmLift(frame, side))),
    atLeast(`${side} arm's snap out in 250 ms, degrees`, PALM_SNAP, (history) => throwDegrees(history, side)),
    {
      name: `${other} hand not pushing too`,
      anyOf: [
        atMost(`${other} elbow bent, degrees`, PALM_OPEN, now((frame) => elbowAngle(frame, other))),
        atMost(`${other} hand under the chest, shoulder widths above the shoulder line`, -0.5, now((frame) => wristRise(frame, other))),
      ],
    },
    atLeast(`ms since ${side} hand was over the head`, NOT_A_CHOP_MS, since((frame) => wristOverNose(frame, side) > 0)),
  ];
});
export const measures = strike.measures;

export const move: MoveDef = {
  id: "palm_heel",
  name: "Palm heel strike",
  kind: "strike",
  prompt: "PALM HEEL",
  hint: "Push the heel of one open hand straight out to face height, fingers back, then bring it back",
  key: "a",
  diagram: { leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [70, 26], rightWrist: [78, 16] },
  teaches: "The heel of your open hand is sturdier than your knuckles and less likely to get hurt.",
  detect(history) {
    return strike.side(history) ? 1 : 0;
  },
  quality(history) {
    const side = strike.side(history);
    return side ? strikeQuality(history, { sides: [side], rise: 0.6, tolerance: 0.9 }) : 0;
  },
};
