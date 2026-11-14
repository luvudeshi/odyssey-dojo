import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { armOut, latest } from "../../pose/signals";
import { armOpening, flungWide, punch } from "../handSignals";

export const move: MoveDef = {
  id: "cross",
  name: "Cross",
  kind: "strike",
  prompt: "CROSS",
  hint: "Punch straight out with your right fist",
  key: "k",
  diagram: { leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [72, 30], rightWrist: [86, 26] },
  teaches: "Strength comes from your feet and hips, not your arm, so stay balanced and ready to move",
  detect(history) {
    const frame = latest(history);
    // A left arm that is out, or on its way out, makes this a two-handed thrust, not a cross.
    if (!frame || armOut(frame, "left") || armOpening(history, "left")) return 0;
    // A punch goes at the camera: an arm flung out to the side is not one.
    return flungWide(frame, "right") ? 0 : punch(history, "right");
  },
  quality(history) {
    return strikeQuality(history, { sides: ["right"] });
  },
};
