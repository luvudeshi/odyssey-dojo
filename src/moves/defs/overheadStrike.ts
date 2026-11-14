import { strikeQuality } from "../../pose/quality";
import type { MoveDef } from "../../core/types";
import { JOINT, joint, latest } from "../../pose/signals";
import { handWasOverhead } from "../handSignals";

const CHOP_MS = 200;

export const move: MoveDef = {
  id: "overhead_strike",
  name: "Overhead strike",
  kind: "strike",
  prompt: "OVERHEAD STRIKE",
  hint: "Raise your right hand over your head, then chop down",
  key: "i",
  diagram: { leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [70, 20], rightWrist: [64, 6] },
  teaches: "An arm raised over your head shields you from a blow coming down from above",
  detect(history) {
    const frame = latest(history);
    if (!frame) return 0;
    const below = joint(frame.image, JOINT.rightWrist).y > joint(frame.image, JOINT.rightShoulder).y;
    // A chop is fast: the hand gets from over the head to under the shoulder inside CHOP_MS. A hand lowered
    // gently takes longer.
    return below && handWasOverhead(history, "right", CHOP_MS) ? 1 : 0;
  },
  quality(history) {
    return strikeQuality(history, { sides: ["right"], rise: -0.6, tolerance: 1 });
  },
};
