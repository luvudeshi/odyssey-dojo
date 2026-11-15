// Roundhouse kick: the knee comes up out to the side, then the foot swings round to the front. Either leg counts.
// What tells it from a front kick is the wind-up: a front kick lifts the knee straight in front of its hip.
// For the Training Dojo only: not in the game's registry.
import type { MoveDef } from "../../../core/types";
import { CHAMBER_MS, KICK_LIFT, KICK_STRAIGHT, chambered } from "../../../moves/defs/frontKick";
import { footLift, kneeAngle, legsVisible } from "../../../moves/legSignals";
import { clamp01, latest } from "../../../pose/signals";
import { ankleOut, atLeast, atMost, eitherSide, kneeOut, now, since, yes } from "../signals";
import { armWent, legRose } from "../../../moves/looseSignals";

/** The lifted knee is at least this far out to the side of its hip, in shoulder widths. */
export const KNEE_OUT = 0.6;
/** The foot ends in front of the body: no further out to the side than this. Further out is a side kick. */
export const FOOT_IN = 1.2;

const kick = eitherSide((side) => [
  atLeast("legs in view", 1, now((frame) => yes(legsVisible(frame)))),
  atMost(`ms since ${side} knee was up and out to the side`, CHAMBER_MS, since((frame) => chambered(frame, side) && kneeOut(frame, side) >= KNEE_OUT)),
  atLeast(`${side} foot lifted high, shoulder widths above the other`, KICK_LIFT, now((frame) => footLift(frame, side))),
  atLeast(`${side} leg snapped straight, degrees`, KICK_STRAIGHT, now((frame) => kneeAngle(frame, side))),
  atMost(`${side} foot round to the front, shoulder widths out to its side`, FOOT_IN, now((frame) => ankleOut(frame, side))),
]);
export const measures = kick.measures;

export const move: MoveDef = {
  id: "roundhouse_kick",
  name: "Roundhouse kick",
  kind: "strike",
  prompt: "ROUNDHOUSE KICK",
  hint: "Lift your knee out to the side, then swing your foot round to the front and snap it back",
  key: "o",
  diagram: {
    leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [62, 42], rightWrist: [57, 26],
    rightKnee: [66, 58], rightFoot: [84, 56],
  },
  teaches: "A kick swung in from the side reaches low while you stay out of hand range.",
  detect(history) {
    return kick.side(history) ? 1 : 0;
  },
  detectAsked(history) {
    return Math.max(move.detect(history), legRose(history));
  },
  /** Better the higher the foot goes and the straighter the leg ends up. */
  quality(history) {
    const frame = latest(history);
    const side = kick.side(history);
    if (!frame || !side) return 0;
    const height = clamp01((footLift(frame, side) - KICK_LIFT) / 1);
    const straight = clamp01((kneeAngle(frame, side) - KICK_STRAIGHT) / 35);
    return clamp01(0.5 + 0.25 * height + 0.25 * straight);
  },
};
