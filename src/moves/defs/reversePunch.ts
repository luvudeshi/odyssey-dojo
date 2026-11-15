// Karate's gyaku-zuki: the rear hand punches while the other hand pulls back to the hip.
import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { elbowAngle, latest } from "../../pose/signals";
import { strike, wristRise } from "../handSignals";
import { armWentForward } from "./cross";

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
    if (!frame || strike(history, "right") < 0.7) return 0;
    // The pulling hand: low at the hip, with the elbow bent behind it (a hanging arm is straight).
    return wristRise(frame, "left") < -0.75 && elbowAngle(frame, "left") < 135 ? 1 : 0;
  },
  // Asked for a reverse punch, the right arm going out toward the camera counts, whatever the left hand does.
  detectAsked(history) {
    return Math.max(move.detect(history), armWentForward(history, "right"));
  },
  quality(history) {
    return strikeQuality(history, { sides: ["right"] });
  },
};
