import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { armOut, armThrust, latest } from "../../pose/signals";

export const move: MoveDef = {
  id: "jab",
  name: "Jab",
  kind: "strike",
  prompt: "JAB",
  hint: "Punch straight out with your left fist",
  key: "j",
  diagram: { leftElbow: [28, 30], leftWrist: [14, 26], rightElbow: [62, 42], rightWrist: [57, 26] },
  detect(history) {
    const frame = latest(history);
    return frame && armThrust(history, "left") && !armOut(frame, "right") ? 1 : 0;
  },
  quality(history) {
    return strikeQuality(history, { sides: ["left"] });
  },
};
