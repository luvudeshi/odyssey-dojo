import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { straightPunch } from "../handSignals";

export const move: MoveDef = {
  id: "jab",
  name: "Jab",
  kind: "strike",
  prompt: "JAB",
  hint: "Punch straight out with your left fist",
  key: "j",
  diagram: { leftElbow: [28, 30], leftWrist: [14, 26], rightElbow: [62, 42], rightWrist: [57, 26] },
  teaches: "A fast hand straight out in front holds someone at arm's length so they cannot crowd you",
  // Either hand counts (the lead's ruling for the owner's takes): a player told to jab often throws the strong
  // hand, so a straight punch reads as both the jab and the cross, and the fight counts the one it asked for.
  detect(history) {
    return Math.max(straightPunch(history, "left"), straightPunch(history, "right"));
  },
  quality(history) {
    return strikeQuality(history, { sides: [straightPunch(history, "right") > straightPunch(history, "left") ? "right" : "left"] });
  },
};
