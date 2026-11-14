import type { MoveDef } from "../../core/types";
import { clamp01, latest, shoulderCenter } from "../../pose/signals";

export const move: MoveDef = {
  id: "jump",
  name: "Jump",
  kind: "defend",
  prompt: "JUMP",
  hint: "Hop straight up off both feet",
  key: "ArrowUp",
  diagram: { leftElbow: [30, 42], leftWrist: [24, 54], rightElbow: [70, 42], rightWrist: [76, 54], shiftY: -10 },
  detect(history) {
    const frame = latest(history);
    if (!frame || !history.baseline) return 0;
    // Image y grows down: the highest the shoulders stood over 500 ms ago, against their peak in the last 350 ms.
    let ground = Infinity;
    let peak = Infinity;
    for (const old of history.frames) {
      const age = frame.t - old.t;
      const y = shoulderCenter(old).y;
      if (age > 500) ground = Math.min(ground, y);
      else if (age <= 350) peak = Math.min(peak, y);
    }
    if (ground === Infinity) ground = history.baseline.shoulderY;
    // Reaches 0.7 at about 0.18 shoulder widths, so the hop still counts just after landing.
    return clamp01((ground - peak) / history.baseline.shoulderWidth / 0.25);
  },
};
