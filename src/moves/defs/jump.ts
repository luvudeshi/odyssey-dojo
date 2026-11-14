import type { MoveDef } from "../../core/types";
import { JOINT, clamp01, joint, latest, shoulderCenter } from "../../pose/signals";

export const move: MoveDef = {
  id: "jump",
  name: "Jump",
  kind: "defend",
  prompt: "JUMP",
  hint: "Hop straight up off both feet",
  key: "ArrowUp",
  diagram: { leftElbow: [30, 42], leftWrist: [24, 54], rightElbow: [70, 42], rightWrist: [76, 54], shiftY: -8 },
  detect(history) {
    const frame = latest(history);
    const standing = history.baseline;
    if (!frame || !standing || standing.shoulderWidth <= 0) return 0;
    // Image y grows down: where the shoulders and nose sat lowest over 500 ms ago, against their peaks in the last 350 ms.
    let ground = -Infinity;
    let headGround = -Infinity;
    let peak = Infinity;
    let headPeak = Infinity;
    for (const old of history.frames) {
      const age = frame.t - old.t;
      const y = shoulderCenter(old).y;
      const head = joint(old.image, JOINT.nose).y;
      if (age > 500) {
        ground = Math.max(ground, y);
        headGround = Math.max(headGround, head);
      } else if (age <= 350) {
        peak = Math.min(peak, y);
        headPeak = Math.min(headPeak, head);
      }
    }
    // Never below standing height, so getting up from a duck is not a hop. With no older frames it is the baseline.
    const rise = (ground === -Infinity ? standing.shoulderY : Math.min(ground, standing.shoulderY)) - peak;
    // The head has to rise as far, so lifting the shoulders to reach up is not a hop.
    const headRise = headGround === -Infinity ? rise : headGround - headPeak;
    // Reaches 0.7 at about 0.18 shoulder widths, so the hop still counts just after landing.
    return clamp01(Math.min(rise, headRise) / standing.shoulderWidth / 0.25);
  },
};
