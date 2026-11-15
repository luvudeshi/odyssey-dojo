import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { armMoved, straightPunch } from "../handSignals";

export const move: MoveDef = {
  id: "jab",
  name: "Jab",
  kind: "strike",
  prompt: "JAB",
  hint: "Punch straight out with your left fist",
  key: "j",
  diagram: { leftElbow: [28, 30], leftWrist: [14, 26], rightElbow: [62, 42], rightWrist: [57, 26] },
  teaches: "A fast hand straight out in front holds someone at arm's length so they cannot crowd you",
  // The left hand only: a right-hand punch is a cross (the owner's ruling, left and right stay distinct).
  detect(history) {
    return straightPunch(history, "left");
  },
  // Asked for a jab, any clear movement of the left arm counts (the other prompts keep the strict reading above).
  detectAsked(history) {
    return Math.max(straightPunch(history, "left"), armMoved(history, "left"));
  },
  quality(history) {
    return strikeQuality(history, { sides: ["left"] });
  },
};
