import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { RISING_PALM_BEND, otherThrowing, risingHand, strike, sweptAcross } from "../handSignals";

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
    // The right fist on its way out too makes this a two-handed thrust. A fist swept across the body is a hook,
    // and one that rose from low with the elbow kept down is a rising palm.
    if (otherThrowing(history, "left") || sweptAcross(history, "left")) return 0;
    return risingHand(history, "left", RISING_PALM_BEND) ? 0 : strike(history, "left");
  },
  quality(history) {
    return strikeQuality(history, { sides: ["left"] });
  },
};
