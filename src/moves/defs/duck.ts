import type { MoveDef } from "../../core/types";
import { clamp01, latest, shoulderCenter } from "../../pose/signals";

export const move: MoveDef = {
  id: "duck",
  name: "Duck",
  kind: "defend",
  prompt: "DUCK",
  hint: "Bend your knees and drop your head",
  key: "ArrowDown",
  diagram: { leftElbow: [34, 46], leftWrist: [33, 60], rightElbow: [66, 46], rightWrist: [67, 60], shiftY: 16 },
  teaches: "Bend your knees, not your waist, to drop under a swing and still see what is coming",
  detect(history) {
    const frame = latest(history);
    if (!frame || !history.baseline) return 0;
    const drop = (shoulderCenter(frame).y - history.baseline.shoulderY) / history.baseline.shoulderWidth;
    return clamp01(drop / 0.6);
  },
};
