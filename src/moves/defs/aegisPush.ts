import type { MoveDef, PoseFrame } from "../../core/types";
import { JOINT, clamp01, elbowAngle, joint, latest, recent } from "../../pose/signals";

/** Meters the wrist is in front of its shoulder. World z is negative toward the camera. */
function reach(frame: PoseFrame, side: "left" | "right"): number {
  const left = side === "left";
  const shoulder = joint(frame.world, left ? JOINT.leftShoulder : JOINT.rightShoulder);
  return shoulder.z - joint(frame.world, left ? JOINT.leftWrist : JOINT.rightWrist).z;
}

/** True when both hands are near shoulder height, which hands hanging at the sides are not. */
function handsUp(frame: PoseFrame): boolean {
  const left = joint(frame.world, JOINT.leftWrist).y - joint(frame.world, JOINT.leftShoulder).y;
  const right = joint(frame.world, JOINT.rightWrist).y - joint(frame.world, JOINT.rightShoulder).y;
  return Math.abs(left) < 0.3 && Math.abs(right) < 0.3;
}

/** True when both hands are close to the chest with the elbows bent. */
function atChest(frame: PoseFrame): boolean {
  if (!handsUp(frame) || reach(frame, "left") >= 0.2 || reach(frame, "right") >= 0.2) return false;
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
    if (!recent(history, 450).some(atChest)) return 0;
    // Reaches 0.7 when the nearer wrist is 0.35 m out.
    return clamp01(Math.min(reach(frame, "left"), reach(frame, "right")) / 0.5);
  },
};
