import { strikeQuality } from "../../pose/quality";
import type { Baseline, MoveDef, PoseFrame } from "../../core/types";
import { JOINT, distance2d, joint, latest, recent, shoulderWidth } from "../../pose/signals";
import { armOut, bodyWidth } from "../handSignals";

/** How far out to its own side of the shoulder the wrist must be, in 3D shoulder widths (0.35 m on a 0.4 m adult). */
const WIDE = 0.875;

/** True when the arm is straight out to its own side, not forward. */
function wide(frame: PoseFrame, side: "left" | "right", baseline: Baseline | null): boolean {
  const left = side === "left";
  const shoulder = joint(frame.world, left ? JOINT.leftShoulder : JOINT.rightShoulder);
  const wrist = joint(frame.world, left ? JOINT.leftWrist : JOINT.rightWrist);
  const out = left ? shoulder.x - wrist.x : wrist.x - shoulder.x;
  return armOut(frame, side, baseline) && out > WIDE * bodyWidth(frame, baseline);
}

function handsTogether(frame: PoseFrame): boolean {
  const apart = distance2d(joint(frame.image, JOINT.leftWrist), joint(frame.image, JOINT.rightWrist));
  // Hands hanging at the sides are about 1.2 shoulder widths apart, so stay well under that.
  return apart < shoulderWidth(frame) * 0.8;
}

export const move: MoveDef = {
  id: "sun_burst",
  name: "Sun burst",
  kind: "strike",
  prompt: "SUN BURST",
  hint: "Bring your hands together at your chest, then fling both arms wide",
  key: "6",
  diagram: { leftElbow: [23, 28], leftWrist: [8, 24], rightElbow: [77, 28], rightWrist: [92, 24] },
  teaches: "Bursting both arms out from your chest breaks a front grab and opens space to leave.",
  detect(history) {
    const frame = latest(history);
    if (!frame || !wide(frame, "left", history.baseline) || !wide(frame, "right", history.baseline)) return 0;
    return recent(history, 500).some(handsTogether) ? 1 : 0;
  },
  quality(history) {
    return strikeQuality(history, { sides: ["left", "right"] });
  },
};
