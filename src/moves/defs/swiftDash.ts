import type { MoveDef } from "../../core/types";
import { clamp01, latest, recent, shoulderCenter } from "../../pose/signals";

export const move: MoveDef = {
  id: "swift_dash",
  name: "Swift dash",
  kind: "strike",
  prompt: "SWIFT DASH",
  hint: "Take one fast step to either side",
  key: "4",
  diagram: { leftElbow: [28, 42], leftWrist: [20, 52], rightElbow: [58, 46], rightWrist: [52, 58], shiftX: 18 },
  detect(history) {
    const frame = latest(history);
    const earlier = recent(history, 250)[0];
    if (!frame || !earlier || !history.baseline || history.baseline.shoulderWidth <= 0) return 0;
    const moved = Math.abs(shoulderCenter(frame).x - shoulderCenter(earlier).x) / history.baseline.shoulderWidth;
    // Reaches 0.7 at 0.6 shoulder widths.
    return clamp01((moved / 0.6) * 0.7);
  },
};
