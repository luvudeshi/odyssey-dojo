import type { MoveDef, PoseFrame, PoseHistory } from "../../core/types";
import { JOINT, armOut, distance2d, elbowAngle, joint, latest, recent, shoulderWidth } from "../../pose/signals";

type Side = "left" | "right";

/** Distance from the hand to its own shoulder, in shoulder widths. */
function handToShoulder(frame: PoseFrame, side: Side): number {
  const left = side === "left";
  const wrist = joint(frame.image, left ? JOINT.leftWrist : JOINT.rightWrist);
  return distance2d(wrist, joint(frame.image, left ? JOINT.leftShoulder : JOINT.rightShoulder)) / shoulderWidth(frame);
}

function drawn(frame: PoseFrame, bow: Side, pull: Side): boolean {
  return armOut(frame, bow) && handToShoulder(frame, pull) < 0.6 && elbowAngle(frame, pull) < 100;
}

function released(history: PoseHistory, bow: Side, pull: Side): boolean {
  const frame = latest(history);
  // The string hand has to clear its shoulder by more than the draw allows, so a shaky draw is not a release.
  if (!frame || !armOut(frame, bow) || handToShoulder(frame, pull) < 0.75) return false;
  let since: number | null = null;
  for (const old of recent(history, 500)) {
    if (!drawn(old, bow, pull)) {
      since = null;
    } else {
      since ??= old.t;
      if (old.t - since >= 150) return true;
    }
  }
  return false;
}

export const move: MoveDef = {
  id: "moon_arrow",
  name: "Moon arrow",
  kind: "strike",
  prompt: "MOON ARROW",
  hint: "Aim one arm out, draw the other hand to your shoulder, then drop it",
  key: "5",
  diagram: { leftElbow: [24, 31], leftWrist: [10, 30], rightElbow: [78, 36], rightWrist: [65, 30] },
  detect(history) {
    return released(history, "left", "right") || released(history, "right", "left") ? 1 : 0;
  },
};
