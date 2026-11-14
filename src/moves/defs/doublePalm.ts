// Kung fu's double palm push: both palms driven forward together from the chest.
import type { MoveDef } from "../../core/types";
import { armThrust, latest } from "../../pose/signals";
import { wristGap } from "../handSignals";

export const move: MoveDef = {
  id: "double_palm",
  name: "Double palm",
  kind: "strike",
  prompt: "DOUBLE PALM",
  hint: "Push both open palms straight forward, side by side",
  key: "p",
  diagram: { leftElbow: [34, 40], leftWrist: [46, 29], rightElbow: [66, 40], rightWrist: [54, 29] },
  teaches: "A firm push with both open hands opens a gap, and a gap is your chance to leave",
  detect(history) {
    const frame = latest(history);
    if (!frame || !armThrust(history, "left") || !armThrust(history, "right")) return 0;
    return wristGap(frame) < 0.8 ? 1 : 0;
  },
};
