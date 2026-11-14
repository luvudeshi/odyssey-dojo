import type { MoveDef, PoseFrame } from "../../core/types";
import { JOINT, clamp01, joint, latest, recent, shoulderCenter, shoulderWidth } from "../../pose/signals";

/** How far a wrist sits to the side of the chest, so a side-step is not read as a sweep. */
function offset(frame: PoseFrame, wrist: number): number {
  return joint(frame.image, wrist).x - shoulderCenter(frame).x;
}

export const move: MoveDef = {
  id: "trident_sweep",
  name: "Trident sweep",
  kind: "strike",
  prompt: "TRIDENT SWEEP",
  hint: "Sweep both arms across your body like pushing a wave",
  key: "2",
  diagram: { leftElbow: [24, 40], leftWrist: [10, 36], rightElbow: [48, 44], rightWrist: [30, 42] },
  detect(history) {
    const frame = latest(history);
    const earlier = recent(history, 350)[0];
    if (!frame || !earlier) return 0;
    const head = joint(frame.image, JOINT.nose).y;
    const hips = (joint(frame.image, JOINT.leftHip).y + joint(frame.image, JOINT.rightHip).y) / 2;
    const high = Math.min(joint(frame.image, JOINT.leftWrist).y, joint(frame.image, JOINT.rightWrist).y);
    const low = Math.max(joint(frame.image, JOINT.leftWrist).y, joint(frame.image, JOINT.rightWrist).y);
    if (high < head || low > hips) return 0;
    const left = offset(frame, JOINT.leftWrist) - offset(earlier, JOINT.leftWrist);
    const right = offset(frame, JOINT.rightWrist) - offset(earlier, JOINT.rightWrist);
    if (left * right <= 0) return 0;
    // Reaches 0.7 when the slower wrist has crossed one shoulder width.
    return clamp01((Math.min(Math.abs(left), Math.abs(right)) / shoulderWidth(frame)) * 0.7);
  },
};
