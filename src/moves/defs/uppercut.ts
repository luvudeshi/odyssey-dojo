// Boxing's uppercut: the right fist rises fast from the waist with the elbow kept bent.
import type { MoveDef } from "../../core/types";
import { risingHand } from "../handSignals";

export const move: MoveDef = {
  id: "uppercut",
  name: "Uppercut",
  kind: "strike",
  prompt: "UPPERCUT",
  hint: "Drop your right fist to your waist, then punch upward with your elbow bent",
  key: "b",
  diagram: { leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [70, 42], rightWrist: [59, 17] },
  teaches: "Up close there is no room for a straight punch; an uppercut comes from below where it is hard to see.",
  detect(history) {
    return risingHand(history, "right", 135) ? 1 : 0;
  },
};
