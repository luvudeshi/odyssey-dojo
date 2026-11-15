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
  teaches: "Strength comes from your feet and hips, not your arm, so stay balanced and ready to move",
  // The right hand only: see src/moves/defs/jab.ts.
  detect(history) {
    return straightPunch(history, "right");
  },
  quality(history) {
    return strikeQuality(history, { sides: ["right"] });
  },
};
