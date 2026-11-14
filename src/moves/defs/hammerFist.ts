// Karate's tettsui-uchi: the bottom of the fist brought down like a hammer, with the left hand.
import type { MoveDef } from "../../core/types";
import { latest, recent } from "../../pose/signals";
import { wristRise } from "../handSignals";

export const move: MoveDef = {
  id: "hammer_fist",
  name: "Hammer fist",
  kind: "strike",
  prompt: "HAMMER FIST",
  hint: "Raise your left fist above your head, then bring it straight down",
  key: "m",
  diagram: { leftElbow: [30, 20], leftWrist: [36, 6], rightElbow: [62, 42], rightWrist: [57, 26] },
  teaches: "The bottom of the fist is padded, so you can hit hard downward without breaking your hand.",
  detect(history) {
    const frame = latest(history);
    if (!frame || wristRise(frame, "left") > 0) return 0;
    // The nose sits about one shoulder width above the shoulder line.
    return recent(history, 500).some((old) => wristRise(old, "left") > 1) ? 1 : 0;
  },
};
