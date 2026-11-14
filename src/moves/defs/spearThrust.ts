import type { MoveDef } from "../../core/types";
import { armThrust } from "../../pose/signals";

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
    return armThrust(history, "left") && armThrust(history, "right") ? 1 : 0;
  },
};
