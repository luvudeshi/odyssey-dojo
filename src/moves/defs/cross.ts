import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { straightPunch } from "../handSignals";

export const move: MoveDef = {
  id: "cross",
  name: "Cross",
  kind: "strike",
  prompt: "CROSS",
  hint: "Punch straight out with your right fist",
  key: "k",
  diagram: { leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [72, 30], rightWrist: [86, 26] },
  teaches: "Your back hand is your power hand: drive it from the hip, then get your guard back up",
  // Either hand counts, the same as the jab: see src/moves/defs/jab.ts.
  detect(history) {
    return Math.max(straightPunch(history, "right"), straightPunch(history, "left"));
  },
  quality(history) {
    return strikeQuality(history, { sides: [straightPunch(history, "left") > straightPunch(history, "right") ? "left" : "right"] });
  },
};
