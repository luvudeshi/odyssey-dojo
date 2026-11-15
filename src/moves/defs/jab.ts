import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { latest } from "../../pose/signals";
import { armOpening, armOut, flungWide, punch } from "../handSignals";

export const move: MoveDef = {
  id: "jab",
  name: "Jab",
  kind: "strike",
  prompt: "JAB",
  hint: "Punch straight out with your left fist",
  key: "j",
  diagram: { leftElbow: [28, 30], leftWrist: [14, 26], rightElbow: [62, 42], rightWrist: [57, 26] },
  teaches: "A fast hand straight out in front holds someone at arm's length so they cannot crowd you",
  detect(history) {
    const frame = latest(history);
    // A right arm that is out, or on its way out, makes this a two-handed thrust, not a jab.
    if (!frame || armOut(frame, "right", history.baseline) || armOpening(history, "right")) return 0;
    // A punch goes at the camera: an arm flung out to the side is not one.
    return flungWide(frame, "left") ? 0 : punch(history, "left");
  },
  quality(history) {
    return strikeQuality(history, { sides: ["left"] });
  },
};
