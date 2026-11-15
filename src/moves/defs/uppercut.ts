// Boxing's uppercut: the right fist rises fast from the waist with the elbow kept bent.
import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { UPPERCUT_BEND, risingHand } from "../handSignals";
import { armWent } from "../looseSignals";

export const move: MoveDef = {
  id: "uppercut",
  name: "Uppercut",
  kind: "strike",
  prompt: "UPPERCUT",
  hint: "Drop your right fist to your waist, then punch upward with your elbow bent",
  key: "b",
  diagram: { leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [70, 42], rightWrist: [59, 17] },
  teaches: "Up close a blow can come up from below, out of sight, so keep your chin down and hands up",
  detect(history) {
    return risingHand(history, "right", UPPERCUT_BEND) ? 1 : 0;
  },
  // Asked for an uppercut, the right hand rising by any amount counts, not toward the camera (that is a cross).
  detectAsked(history) {
    return Math.max(move.detect(history), armWent(history, "right", "up"));
  },
  quality(history) {
    return strikeQuality(history, { sides: ["right"], straight: false, rise: 0.5 });
  },
};
