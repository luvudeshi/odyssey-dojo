import type { MoveDef } from "../../core/types";
import { JOINT, armThrust, clamp01, distance2d, joint, latest, shoulderWidth } from "../../pose/signals";

export const move: MoveDef = {
  id: "block",
  name: "Block",
  kind: "defend",
  prompt: "BLOCK",
  hint: "Bring both fists up to your face",
  key: " ",
  diagram: { leftElbow: [40, 40], leftWrist: [44, 22], rightElbow: [60, 40], rightWrist: [56, 22] },
  teaches: "Hands high protects your head while you look for a way out",
  detect(history) {
    const frame = latest(history);
    if (!frame) return 0;
    // A punch toward the camera also ends with a fist near the face: not a guard.
    if (armThrust(history, "left") || armThrust(history, "right")) return 0;
    const nose = joint(frame.image, JOINT.nose);
    const far = Math.max(
      distance2d(joint(frame.image, JOINT.leftWrist), nose),
      distance2d(joint(frame.image, JOINT.rightWrist), nose),
    );
    return clamp01((1.3 - far / shoulderWidth(frame)) / 0.5);
  },
};
