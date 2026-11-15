// Low kick: a straight leg flicked forward at shin height and put straight back. Either leg counts.
// What tells it from a front kick is that the knee never comes up: the foot stays low and the leg stays straight.
// For the Training Dojo only: not in the game's registry.
import type { MoveDef } from "../../../core/types";
import { CHAMBER_LIFT, KICK_LIFT } from "../../../moves/defs/frontKick";
import { footLift, kneeAngle, kneeLift, legsVisible } from "../../../moves/legSignals";
import { clamp01, latest } from "../../../pose/signals";
import { atLeast, atMost, eitherSide, footForward, now, since, yes } from "../signals";
import { armWent, legRose } from "../../../moves/looseSignals";

/** The foot is this far off the floor at least, in shoulder widths above the other foot... */
export const LOW_FROM = 0.25;
/** ...and this far at most: about shin height. Higher is a front kick. */
export const LOW_TO = 0.75;
export const LOW_STRAIGHT = 150;
/** The foot is at least this far in front of its hip, in 3D shoulder widths: a foot lifted on the spot is not a kick. */
export const LOW_FORWARD = 0.5;
/** How long ago the foot may have been on the floor, in milliseconds. */
export const FLICK_MS = 400;
const GROUNDED = 0.15;
/** A knee lifted, or a foot kicked high, this recently means the leg is coming down from another kick. */
export const SETTLE_MS = 600;

const kick = eitherSide((side) => [
  atLeast("legs in view", 1, now((frame) => yes(legsVisible(frame)))),
  atLeast(`${side} foot off the floor, shoulder widths above the other`, LOW_FROM, now((frame) => footLift(frame, side))),
  atMost(`${side} foot kept low, shoulder widths above the other`, LOW_TO, now((frame) => footLift(frame, side))),
  atLeast(`${side} leg kept straight, degrees`, LOW_STRAIGHT, now((frame) => kneeAngle(frame, side))),
  atLeast(`${side} foot out in front, 3D shoulder widths ahead of its hip`, LOW_FORWARD, now((frame, baseline) => footForward(frame, side, baseline))),
  atMost(`ms since ${side} foot was on the floor`, FLICK_MS, since((frame) => legsVisible(frame) && Math.abs(footLift(frame, side)) < GROUNDED)),
  atLeast(`ms since ${side} knee was lifted high`, SETTLE_MS, since((frame) => kneeLift(frame, side) >= CHAMBER_LIFT || footLift(frame, side) >= KICK_LIFT)),
]);
export const measures = kick.measures;

export const move: MoveDef = {
  id: "low_kick",
  name: "Low kick",
  kind: "strike",
  prompt: "LOW KICK",
  hint: "Keep your leg straight and flick your foot forward at shin height, then put it straight back",
  key: "w",
  diagram: {
    leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [62, 42], rightWrist: [57, 26],
    rightKnee: [58, 76], rightFoot: [66, 88],
  },
  teaches: "A low, quick kick to the shin is hard to catch, and you can snap your foot straight back.",
  detect(history) {
    return kick.side(history) ? 1 : 0;
  },
  detectAsked(history) {
    return Math.max(move.detect(history), legRose(history));
  },
  /** Better the straighter the leg and the further forward the foot. */
  quality(history) {
    const frame = latest(history);
    const side = kick.side(history);
    if (!frame || !side) return 0;
    const straight = clamp01((kneeAngle(frame, side) - LOW_STRAIGHT) / 25);
    const forward = clamp01((footForward(frame, side, history.baseline) - LOW_FORWARD) / 0.7);
    return clamp01(0.5 + 0.25 * straight + 0.25 * forward);
  },
};
