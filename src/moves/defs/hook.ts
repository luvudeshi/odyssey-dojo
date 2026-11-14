import type { MoveDef } from "../../core/types";
import { JOINT, clamp01, elbowAngle, joint, latest, recent, shoulderWidth } from "../../pose/signals";

export const move: MoveDef = {
  id: "hook",
  name: "Hook",
  kind: "strike",
  prompt: "LEFT HOOK",
  hint: "Swing your bent left arm across your body",
  key: "l",
  diagram: { leftElbow: [26, 32], leftWrist: [42, 28], rightElbow: [62, 42], rightWrist: [57, 26] },
  teaches: "Swings come from the side, out of view, so always bring your hand back to your face",
  detect(history) {
    const frame = latest(history);
    const earlier = recent(history, 150)[0];
    if (!frame || !earlier) return 0;
    const bend = elbowAngle(frame, "left");
    const wrist = joint(frame.image, JOINT.leftWrist);
    const shoulder = joint(frame.image, JOINT.leftShoulder);
    const width = shoulderWidth(frame);
    if (bend < 60 || bend > 130 || Math.abs(wrist.y - shoulder.y) > width * 0.6) return 0;
    return clamp01((wrist.x - joint(earlier.image, JOINT.leftWrist).x) / width);
  },
};
