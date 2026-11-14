import type { MoveDef } from "../../core/types";
import { armOut, armThrust, latest } from "../../pose/signals";

export const move: MoveDef = {
  id: "cross",
  name: "Cross",
  kind: "strike",
  prompt: "CROSS",
  hint: "Punch straight out with your right fist",
  key: "k",
  diagram: { leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [72, 30], rightWrist: [86, 26] },
  detect(history) {
    const frame = latest(history);
    return frame && armThrust(history, "right") && !armOut(frame, "left") ? 1 : 0;
  },
};
