import type { MoveDef } from "../../core/types";
import { JOINT, joint, latest, recent } from "../../pose/signals";

export const move: MoveDef = {
  id: "overhead_strike",
  name: "Overhead strike",
  kind: "strike",
  prompt: "OVERHEAD STRIKE",
  hint: "Raise your right hand over your head, then chop down",
  key: "i",
  diagram: { leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [70, 20], rightWrist: [64, 6] },
  teaches: "An arm raised over your head shields you from a blow coming down from above",
  detect(history) {
    const frame = latest(history);
    if (!frame) return 0;
    const below = joint(frame.image, JOINT.rightWrist).y > joint(frame.image, JOINT.rightShoulder).y;
    const wasAbove = recent(history, 500).some(
      (old) => joint(old.image, JOINT.rightWrist).y < joint(old.image, JOINT.nose).y,
    );
    return below && wasAbove ? 1 : 0;
  },
};
