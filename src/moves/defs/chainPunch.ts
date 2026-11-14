// Wing Chun's chain punch: straight punches rolled out one hand after the other.
import { strikeQuality } from "../../pose/quality";
import type { MoveDef, PoseHistory } from "../../core/types";
import { latest, recent } from "../../pose/signals";
import { armOut, armThrust, otherSide } from "../handSignals";
import type { Side } from "../handSignals";

/** How soon the second punch must follow the first, in milliseconds. */
const FOLLOW_MS = 700;

/** `side` has just punched, and the other hand punched a moment before and has come back. */
function followsOther(history: PoseHistory, side: Side): boolean {
  const frame = latest(history);
  const other = otherSide(side);
  if (!frame || !armThrust(history, side) || armOut(frame, other)) return false;
  return recent(history, FOLLOW_MS).some((old) => armOut(old, other));
}

export const move: MoveDef = {
  id: "chain_punch",
  name: "Chain punch",
  kind: "strike",
  prompt: "CHAIN PUNCH",
  hint: "Punch straight with one fist, then the other right behind it",
  key: "c",
  diagram: { leftElbow: [28, 30], leftWrist: [14, 26], rightElbow: [66, 44], rightWrist: [56, 36] },
  teaches: "Straight is quicker than a swing, so hands kept in front of you can hold off a rush",
  detect(history) {
    return followsOther(history, "left") || followsOther(history, "right") ? 1 : 0;
  },
  quality(history) {
    const frame = latest(history);
    return strikeQuality(history, { sides: [frame && armOut(frame, "left") ? "left" : "right"] });
  },
};
