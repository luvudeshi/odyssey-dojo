import type { MoveDef } from "../../core/types";
import { sideStep } from "./dodgeLeft";
import { bodyWent } from "../looseSignals";

export const move: MoveDef = {
  id: "dodge_right",
  name: "Dodge right",
  kind: "defend",
  prompt: "DODGE RIGHT",
  hint: "Step off the line to your right",
  key: "ArrowRight",
  diagram: { leftElbow: [34, 46], leftWrist: [33, 60], rightElbow: [66, 46], rightWrist: [67, 60], shiftX: 14 },
  teaches: "Moving sideways, not straight back, takes you out of an attack's path so you can get away",
  detect(history) {
    return sideStep(history, 1);
  },
  detectAsked(history) {
    return Math.max(sideStep(history, 1), bodyWent(history, "right"));
  },
};
