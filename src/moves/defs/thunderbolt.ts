import { strikeQuality } from "../../pose/quality";
import type { MoveDef, PoseHistory } from "../../core/types";
import { JOINT, joint, latest, recent } from "../../pose/signals";

/** How long ago the hand may have been over the head, in milliseconds. */
export const RAISED_MS = 700;

function thrown(history: PoseHistory, wrist: number, shoulder: number): boolean {
  const frame = latest(history);
  if (!frame || joint(frame.image, wrist).y <= joint(frame.image, shoulder).y) return false;
  return recent(history, RAISED_MS).some((old) => joint(old.image, wrist).y < joint(old.image, JOINT.nose).y);
}

export const move: MoveDef = {
  id: "thunderbolt",
  name: "Thunderbolt",
  kind: "strike",
  prompt: "THUNDERBOLT",
  hint: "Raise either hand over your head, then throw it down",
  key: "1",
  diagram: { leftElbow: [34, 46], leftWrist: [33, 60], rightElbow: [72, 18], rightWrist: [70, 4] },
  teaches: "A downward strike gets its force from gravity and your body weight, not arm strength.",
  detect(history) {
    const left = thrown(history, JOINT.leftWrist, JOINT.leftShoulder);
    return left || thrown(history, JOINT.rightWrist, JOINT.rightShoulder) ? 1 : 0;
  },
  quality(history) {
    // Either hand may throw it: score the better one.
    return Math.max(
      strikeQuality(history, { sides: ["left"], rise: -0.6, tolerance: 1 }),
      strikeQuality(history, { sides: ["right"], rise: -0.6, tolerance: 1 }),
    );
  },
};
