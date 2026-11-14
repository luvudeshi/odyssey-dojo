// Karate's gyaku-zuki: the rear hand punches while the other hand pulls back to the hip.
import type { MoveDef } from "../../core/types";
import { armThrust, elbowAngle, latest } from "../../pose/signals";
import { wristRise } from "../handSignals";

export const move: MoveDef = {
  id: "reverse_punch",
  name: "Reverse punch",
  kind: "strike",
  prompt: "REVERSE PUNCH",
  hint: "Punch straight out with your right fist while you pull your left fist back to your hip",
  key: "r",
  diagram: { leftElbow: [30, 46], leftWrist: [39, 56], rightElbow: [72, 30], rightWrist: [86, 26] },
  teaches: "Knees a little bent and back straight give you a steady base, so you stay on your feet",
  detect(history) {
    const frame = latest(history);
    if (!frame || !armThrust(history, "right")) return 0;
    // The pulling hand: low at the hip, with the elbow bent behind it (a hanging arm is straight).
    return wristRise(frame, "left") < -0.9 && elbowAngle(frame, "left") < 130 ? 1 : 0;
  },
};
