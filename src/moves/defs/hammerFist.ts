// Karate's tettsui-uchi: the bottom of the fist brought down like a hammer, with the left hand.
import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { latest, recent } from "../../pose/signals";
import { wristRise } from "../handSignals";
import { armWent } from "../looseSignals";

export const move: MoveDef = {
  id: "hammer_fist",
  name: "Hammer fist",
  kind: "strike",
  prompt: "HAMMER FIST",
  hint: "Raise your left fist above your head, then bring it straight down",
  key: "m",
  diagram: { leftElbow: [30, 20], leftWrist: [36, 6], rightElbow: [62, 42], rightWrist: [57, 26] },
  teaches: "The padded bottom of your fist is safer for your hand than knuckles if you must break free",
  detect(history) {
    const frame = latest(history);
    if (!frame || wristRise(frame, "left") > 0) return 0;
    // The nose sits about one shoulder width above the shoulder line.
    return recent(history, 700).some((old) => wristRise(old, "left") > 0.85) ? 1 : 0;
  },
  // Asked for a hammer fist, the left hand dropping by any amount counts, from any height.
  detectAsked(history) {
    return Math.max(move.detect(history), armWent(history, "left", "down"));
  },
  quality(history) {
    return strikeQuality(history, { sides: ["left"], rise: -0.6, tolerance: 1 });
  },
};
