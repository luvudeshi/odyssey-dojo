// Kung fu's rising palm: the heel of the left hand driven up under the chin.
import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { risingHand } from "../handSignals";

export const move: MoveDef = {
  id: "rising_palm",
  name: "Rising palm",
  kind: "strike",
  prompt: "RISING PALM",
  hint: "Drive the heel of your left hand up from your waist to chin height",
  key: "g",
  diagram: { leftElbow: [30, 42], leftWrist: [41, 17], rightElbow: [62, 42], rightWrist: [57, 26] },
  teaches: "The heel of your open hand, pushed up and in, can loosen a grip so you can get away",
  detect(history) {
    return risingHand(history, "left", 150) ? 1 : 0;
  },
  quality(history) {
    return strikeQuality(history, { sides: ["left"], straight: false, rise: 0.5 });
  },
};
