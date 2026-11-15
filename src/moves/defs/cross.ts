import { strikeQuality } from "../../pose/quality";
import type { MoveDef, PoseHistory } from "../../core/types";
import { latest, recent } from "../../pose/signals";
import { straightPunch, wristOut, wristRise } from "../handSignals";
import type { Side } from "../handSignals";
import { armWent } from "../looseSignals";

/** The fist may not have dropped more than this, in shoulder widths, over the half second: the end of a falling arm is no punch. */
const NOT_FALLING = 0.1;
/** Nor may it have travelled across or out by more than this: the end of a sideways swing is no punch either. */
const NOT_SIDEWAYS = 0.2;

/** The loose forward rule for a punch: the arm went out toward the camera and the fist was not on its way down or aside. */
export function armWentForward(history: PoseHistory, side: Side): number {
  const first = recent(history, 500)[0];
  const now = latest(history);
  if (!first || !now) return 0;
  if (wristRise(now, side) - wristRise(first, side) < -NOT_FALLING) return 0;
  if (Math.abs(wristOut(now, side) - wristOut(first, side)) > NOT_SIDEWAYS) return 0;
  return armWent(history, side, "forward");
}

export const move: MoveDef = {
  id: "cross",
  name: "Cross",
  kind: "strike",
  prompt: "CROSS",
  hint: "Punch straight out with your right fist",
  key: "k",
  diagram: { leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [72, 30], rightWrist: [86, 26] },
  teaches: "Your back hand is your power hand: drive it from the hip, then get your guard back up",
  // The right hand only: see src/moves/defs/jab.ts.
  detect(history) {
    return straightPunch(history, "right");
  },
  // Asked for a cross, the right arm going out toward the camera by any amount counts (the strict reading stays for other prompts).
  detectAsked(history) {
    return Math.max(move.detect(history), armWentForward(history, "right"));
  },
  quality(history) {
    return strikeQuality(history, { sides: ["right"] });
  },
};
