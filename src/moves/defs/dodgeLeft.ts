import type { MoveDef } from "../../core/types";
import { clamp01, latest, shoulderCenter } from "../../pose/signals";

export const move: MoveDef = {
  id: "dodge_left",
  name: "Dodge left",
  kind: "defend",
  prompt: "DODGE LEFT",
  hint: "Lean or step to your left",
  key: "ArrowLeft",
  diagram: { leftElbow: [34, 46], leftWrist: [33, 60], rightElbow: [66, 46], rightWrist: [67, 60], shiftX: -14 },
  detect(history) {
    const frame = latest(history);
    if (!frame || !history.baseline) return 0;
    const shift = (shoulderCenter(frame).x - history.baseline.centerX) / history.baseline.shoulderWidth;
    return clamp01(-shift / 0.6);
  },
};
