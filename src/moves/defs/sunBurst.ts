import { strikeQuality } from "../../pose/quality";
import type { Baseline, MoveDef, PoseFrame } from "../../core/types";
import { JOINT, distance2d, elbowAngle, joint, latest, recent, shoulderWidth } from "../../pose/signals";
import { SHOULDER_HEIGHT, bodyWidth, torsoLength } from "../handSignals";

/** How far out to its own side of the shoulder the wrist must be, in 3D shoulder widths: 0.24 m on a 0.4 m adult. */
export const WIDE = 0.6;
/** How long ago the hands may have been together, in milliseconds. */
export const TOGETHER_MS = 650;
/**
 * The less straight elbow of an arm flung wide, in degrees. Looser than a punch's 145: an arm 60% of the way out
 * from the chest is at about 120. Together at the chest it is under 90.
 */
export const FLUNG_ELBOW = 115;

/** True when the arm is straight out to its own side, not forward. */
function wide(frame: PoseFrame, side: "left" | "right", baseline: Baseline | null): boolean {
  const left = side === "left";
  const shoulder = joint(frame.world, left ? JOINT.leftShoulder : JOINT.rightShoulder);
  const wrist = joint(frame.world, left ? JOINT.leftWrist : JOINT.rightWrist);
  const out = left ? shoulder.x - wrist.x : wrist.x - shoulder.x;
  const level = Math.abs(wrist.y - shoulder.y) < SHOULDER_HEIGHT * torsoLength(frame, baseline);
  return elbowAngle(frame, side) > FLUNG_ELBOW && level && out > WIDE * bodyWidth(frame, baseline);
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
    return recent(history, TOGETHER_MS).some(handsTogether) ? 1 : 0;
  },
  quality(history) {
    return strikeQuality(history, { sides: ["left", "right"] });
  },
};
