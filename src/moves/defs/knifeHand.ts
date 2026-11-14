// Karate's shuto-uchi: the edge of the open hand, swung from the opposite shoulder out to the side.
import type { MoveDef } from "../../core/types";
import { elbowAngle, latest, recent } from "../../pose/signals";
import { wristOut, wristRise } from "../handSignals";

export const move: MoveDef = {
  id: "knife_hand",
  name: "Knife hand",
  kind: "strike",
  prompt: "KNIFE HAND",
  hint: "Bring your right hand across to your left shoulder, then chop it out to the right at neck height",
  key: "h",
  diagram: { leftElbow: [34, 44], leftWrist: [42, 30], rightElbow: [77, 31], rightWrist: [93, 30] },
  teaches: "A sweep of your open hand across and out knocks a reaching arm aside before it lands",
  detect(history) {
    const frame = latest(history);
    if (!frame) return 0;
    const out =
      wristOut(frame, "right") > 1.2 && Math.abs(wristRise(frame, "right")) < 0.7 && elbowAngle(frame, "right") > 125;
    if (!out) return 0;
    // The chamber: the hand was across the body, at chest height or above, a moment ago.
    const chambered = recent(history, 550).some(
      (old) => wristOut(old, "right") < 0.1 && wristRise(old, "right") > -0.6,
    );
    return chambered ? 1 : 0;
  },
};
