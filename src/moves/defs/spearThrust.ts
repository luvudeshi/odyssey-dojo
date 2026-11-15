import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { latest } from "../../pose/signals";
import { flungWide, strike } from "../handSignals";

export const move: MoveDef = {
  id: "spear_thrust",
  name: "Spear thrust",
  kind: "strike",
  prompt: "SPEAR THRUST",
  hint: "Drive both hands straight forward together",
  key: "u",
  diagram: { leftElbow: [28, 30], leftWrist: [14, 26], rightElbow: [72, 30], rightWrist: [86, 26] },
  teaches: "Two open hands out front keep someone at arm's length while you back away",
  detect(history) {
    const frame = latest(history);
    // A thrust goes at the camera: both arms flung out to their own sides are a sun burst.
    if (frame && flungWide(frame, "left") && flungWide(frame, "right")) return 0;
    return Math.min(strike(history, "left"), strike(history, "right"));
  },
  quality(history) {
    return strikeQuality(history, { sides: ["left", "right"] });
  },
};
