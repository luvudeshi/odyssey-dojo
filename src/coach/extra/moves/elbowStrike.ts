// Elbow strike: the arm folded tight, the elbow lifted to shoulder height and swung across in front of the chest.
// Either arm counts. What tells it from a hook is what moves: here the elbow itself crosses the body, where a hook
// keeps the elbow out and swings the fist.
// For the Training Dojo only: not in the game's registry.
import type { MoveDef, PoseHistory } from "../../../core/types";
import { upperArmLift } from "../../../moves/handSignals";
import type { Side } from "../../../moves/handSignals";
import { strikeQuality } from "../../../pose/quality";
import { elbowAngle, latest, recent } from "../../../pose/signals";
import { atLeast, atMost, eitherSide, elbowOut, now } from "../signals";

/** The elbow ends bent at most this far, in degrees: forearm folded back against the upper arm. */
export const FOLDED = 80;
/** The upper arm ends lifted at least this far from hanging, in degrees: 90 is level with the shoulder. */
export const LIFTED = 60;
/** The swing is read over this many milliseconds... */
export const SWING_MS = 300;
/** ...from a frame with the arm already bent and lifted this much (a punch pulled back starts straight)... */
export const WOUND_BEND = 110;
export const WOUND_LIFT = 45;
/** ...and the elbow crosses at least this far toward the centre line, in shoulder widths... */
export const SWING = 0.5;
/** ...ending no further out from the centre line than this: in front of the chest. */
export const IN_FRONT = 0.6;

/** How far the elbow has swung toward the centre line since it was furthest out with the arm bent and lifted. NaN if it never was. */
function swing(history: PoseHistory, side: Side): number {
  const frame = latest(history);
  const wound = recent(history, SWING_MS).filter((old) => elbowAngle(old, side) <= WOUND_BEND && upperArmLift(old, side) >= WOUND_LIFT);
  if (!frame || wound.length === 0) return NaN;
  return Math.max(...wound.map((old) => elbowOut(old, side))) - elbowOut(frame, side);
}

const strike = eitherSide((side) => [
  atMost(`${side} arm folded tight, degrees at the elbow`, FOLDED, now((frame) => elbowAngle(frame, side))),
  atLeast(`${side} elbow up at shoulder height, degrees the upper arm is lifted`, LIFTED, now((frame) => upperArmLift(frame, side))),
  atLeast(`${side} elbow swung across in ${String(SWING_MS)} ms, shoulder widths`, SWING, (history) => swing(history, side)),
  atMost(`${side} elbow in front of the chest, shoulder widths out from the centre line`, IN_FRONT, now((frame) => elbowOut(frame, side))),
]);
export const measures = strike.measures;

export const move: MoveDef = {
  id: "elbow_strike",
  name: "Elbow strike",
  kind: "strike",
  prompt: "ELBOW",
  hint: "Fold one arm tight, lift the elbow to shoulder height and swing it across in front of your chest",
  key: "e",
  diagram: { leftElbow: [47, 33], leftWrist: [38, 29], rightElbow: [62, 42], rightWrist: [57, 26] },
  teaches: "Too close to swing a fist, your elbow is a hard point that can make room to leave.",
  detect(history) {
    return strike.side(history) ? 1 : 0;
  },
  quality(history) {
    const side = strike.side(history);
    return side ? strikeQuality(history, { sides: [side], straight: false, tolerance: 1 }) : 0;
  },
};
