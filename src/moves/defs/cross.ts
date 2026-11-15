import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { UPPERCUT_BEND, otherThrowing, risingHand, strike } from "../handSignals";

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
    // The left fist on its way out too makes this a two-handed thrust. A right fist that rose from low with its
    // elbow kept down is an uppercut: how high the elbow comes is the one thing between the two.
    if (otherThrowing(history, "right")) return 0;
    return risingHand(history, "right", UPPERCUT_BEND) ? 0 : strike(history, "right");
  },
  quality(history) {
    return strikeQuality(history, { sides: ["right"] });
  },
};
