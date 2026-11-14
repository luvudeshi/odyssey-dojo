import { strikeQuality } from "../../pose/quality";
import type { MoveDef, PoseFrame } from "../../core/types";
import { JOINT, clamp01, joint, latest, recent, shoulderCenter, shoulderWidth } from "../../pose/signals";

/** How far a wrist sits to the side of the chest, so a side-step is not read as a sweep. */
function offset(frame: PoseFrame, wrist: number): number {
  return joint(frame.image, wrist).x - shoulderCenter(frame).x;
}

/** True when both wrists are between head height and hip height. */
function level(frame: PoseFrame): boolean {
  const head = joint(frame.image, JOINT.nose).y;
  const hips = (joint(frame.image, JOINT.leftHip).y + joint(frame.image, JOINT.rightHip).y) / 2;
  const left = joint(frame.image, JOINT.leftWrist).y;
  const right = joint(frame.image, JOINT.rightWrist).y;
  return Math.min(left, right) >= head && Math.max(left, right) <= hips;
}

export const move: MoveDef = {
  id: "trident_sweep",
  name: "Trident sweep",
  kind: "strike",
  prompt: "TRIDENT SWEEP",
  hint: "Sweep both arms across your body like pushing a wave",
  key: "2",
  diagram: { leftElbow: [24, 40], leftWrist: [10, 36], rightElbow: [48, 44], rightWrist: [30, 42] },
  teaches: "Sweeping across your body moves a grab or a reaching arm off your center line.",
  detect(history) {
    const frame = latest(history);
    const earlier = recent(history, 350)[0];
    if (!frame || !earlier || !level(frame) || !level(earlier)) return 0;
    const width = history.baseline?.shoulderWidth ?? shoulderWidth(frame);
    if (width <= 0) return 0;
    const left = offset(frame, JOINT.leftWrist) - offset(earlier, JOINT.leftWrist);
    const right = offset(frame, JOINT.rightWrist) - offset(earlier, JOINT.rightWrist);
    if (left * right <= 0) return 0;
    // The hands have to start on one side of the chest and end on the other, so winding up or dropping them is not a sweep.
    const from = (offset(earlier, JOINT.leftWrist) + offset(earlier, JOINT.rightWrist)) / 2 / width;
    const to = (offset(frame, JOINT.leftWrist) + offset(frame, JOINT.rightWrist)) / 2 / width;
    if (from * to >= 0 || Math.min(Math.abs(from), Math.abs(to)) < 0.3) return 0;
    // Reaches 0.7 when the slower wrist has crossed one shoulder width.
    return clamp01((Math.min(Math.abs(left), Math.abs(right)) / width) * 0.7);
  },
  quality(history) {
    return strikeQuality(history, { sides: ["left", "right"], tolerance: 1, straight: false });
  },
};
