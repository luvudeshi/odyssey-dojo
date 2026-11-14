import { strikeQuality } from "../../pose/quality";
import type { MoveDef, PoseFrame } from "../../core/types";
import { JOINT, clamp01, elbowAngle, joint, latest, recent } from "../../pose/signals";
import { bodyWidth, wristGap } from "../handSignals";

/** The widest the hands may be in the picture, in shoulder widths. Wider is a spear thrust, not a push from the chest. */
const MAX_GAP = 0.9;

// The three below are in 3D shoulder widths, so a child's shorter arms count the same as an adult's.
/** How far above or below its shoulder a hand may be and still be up (0.3 m on a 0.4 m adult). */
const UP = 0.75;
/** A hand nearer the chest than this is not pushed out yet (0.2 m on a 0.4 m adult). */
const CHEST_REACH = 0.5;
/** The reach of a full push (0.5 m on a 0.4 m adult). */
const FULL_REACH = 1.25;

/** How far the wrist is in front of its shoulder, in 3D shoulder widths. World z is negative toward the camera. */
function reach(frame: PoseFrame, side: "left" | "right"): number {
  const width = bodyWidth(frame);
  if (width === 0) return 0;
  const left = side === "left";
  const shoulder = joint(frame.world, left ? JOINT.leftShoulder : JOINT.rightShoulder);
  return (shoulder.z - joint(frame.world, left ? JOINT.leftWrist : JOINT.rightWrist).z) / width;
}

/** True when both hands are near shoulder height, which hands hanging at the sides are not. */
function handsUp(frame: PoseFrame): boolean {
  const left = joint(frame.world, JOINT.leftWrist).y - joint(frame.world, JOINT.leftShoulder).y;
  const right = joint(frame.world, JOINT.rightWrist).y - joint(frame.world, JOINT.rightShoulder).y;
  const limit = UP * bodyWidth(frame);
  return Math.abs(left) < limit && Math.abs(right) < limit;
}

/** True when both hands are close to the chest with the elbows bent. */
function atChest(frame: PoseFrame): boolean {
  if (!handsUp(frame) || reach(frame, "left") >= CHEST_REACH || reach(frame, "right") >= CHEST_REACH) return false;
  return elbowAngle(frame, "left") < 110 && elbowAngle(frame, "right") < 110;
}

export const move: MoveDef = {
  id: "aegis_push",
  name: "Aegis push",
  kind: "strike",
  prompt: "AEGIS PUSH",
  hint: "Push both open palms straight out from your chest",
  key: "3",
  diagram: { leftElbow: [30, 44], leftWrist: [40, 36], rightElbow: [70, 44], rightWrist: [60, 36] },
  teaches: "An open-palm push makes space to get away and is kinder to your hands than a fist.",
  detect(history) {
    const frame = latest(history);
    if (!frame || !handsUp(frame)) return 0;
    // The arms have to go from bent to straight, so lifting bent arms into a guard is not a push.
    if (elbowAngle(frame, "left") < 140 || elbowAngle(frame, "right") < 140) return 0;
    if (wristGap(frame) >= MAX_GAP) return 0;
    if (!recent(history, 450).some(atChest)) return 0;
    // Reaches 0.7 when the nearer wrist is 0.875 shoulder widths out: 0.35 m on a 0.4 m adult.
    return clamp01(Math.min(reach(frame, "left"), reach(frame, "right")) / FULL_REACH);
  },
  quality(history) {
    return strikeQuality(history, { sides: ["left", "right"] });
  },
};
