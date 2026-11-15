import { strikeQuality } from "../../pose/quality";
import type { Baseline, MoveDef, PoseFrame } from "../../core/types";
import { JOINT, clamp01, elbowAngle, joint, latest, recent } from "../../pose/signals";
import { SHOULDER_HEIGHT, bodyWidth, torsoLength, wristGap } from "../handSignals";

/** The widest the hands may be in the picture, in shoulder widths. Wider is a spear thrust, not a push from the chest. */
const MAX_GAP = 0.9;

// The two below are in 3D shoulder widths, so a child's shorter arms count the same as an adult's. How far above
// or below its shoulder a hand may be and still be up is SHOULDER_HEIGHT, in 3D torso lengths.
/** A hand nearer the chest than this is not pushed out yet (0.2 m on a 0.4 m adult). */
const CHEST_REACH = 0.5;
/** The reach of a full push (0.5 m on a 0.4 m adult). */
const FULL_REACH = 1.25;

/** How far the wrist is in front of its shoulder, in 3D shoulder widths. World z is negative toward the camera. */
function reach(frame: PoseFrame, side: "left" | "right", baseline: Baseline | null): number {
  const width = bodyWidth(frame, baseline);
  if (width === 0) return 0;
  const left = side === "left";
  const shoulder = joint(frame.world, left ? JOINT.leftShoulder : JOINT.rightShoulder);
  return (shoulder.z - joint(frame.world, left ? JOINT.leftWrist : JOINT.rightWrist).z) / width;
}

/** True when both hands are near shoulder height, which hands hanging at the sides are not. */
function handsUp(frame: PoseFrame, baseline: Baseline | null): boolean {
  const left = joint(frame.world, JOINT.leftWrist).y - joint(frame.world, JOINT.leftShoulder).y;
  const right = joint(frame.world, JOINT.rightWrist).y - joint(frame.world, JOINT.rightShoulder).y;
  const limit = SHOULDER_HEIGHT * torsoLength(frame, baseline);
  return Math.abs(left) < limit && Math.abs(right) < limit;
}

/** True when both hands are close to the chest with the elbows bent. */
function atChest(frame: PoseFrame, baseline: Baseline | null): boolean {
  if (!handsUp(frame, baseline)) return false;
  if (reach(frame, "left", baseline) >= CHEST_REACH || reach(frame, "right", baseline) >= CHEST_REACH) return false;
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
    const baseline = history.baseline;
    if (!frame || !handsUp(frame, baseline)) return 0;
    // The arms have to go from bent to straight, so lifting bent arms into a guard is not a push.
    if (elbowAngle(frame, "left") < 140 || elbowAngle(frame, "right") < 140) return 0;
    if (wristGap(frame) >= MAX_GAP) return 0;
    if (!recent(history, 450).some((old) => atChest(old, baseline))) return 0;
    // Reaches 0.7 when the nearer wrist is 0.875 shoulder widths out: 0.35 m on a 0.4 m adult.
    return clamp01(Math.min(reach(frame, "left", baseline), reach(frame, "right", baseline)) / FULL_REACH);
  },
  quality(history) {
    return strikeQuality(history, { sides: ["left", "right"] });
  },
};
