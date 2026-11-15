// Pankration's knee strike: the knee driven up high with the lower leg kept folded. Either leg counts.
// A front kick passes through the same shape on its way out, so the knee must stay up for a moment to count.
import type { MoveDef, PoseFrame, PoseHistory } from "../../core/types";
import { clamp01, recent } from "../../pose/signals";
import type { Side } from "../handSignals";
import { SIDES, kneeAngle, kneeLift, legsVisible } from "../legSignals";

/** How long ago the foot may have been on the floor, in milliseconds. */
export const RISE_MS = 700;
/** How long the knee must stay up and folded, in milliseconds. A front kick's chamber is shorter than this. */
export const HOLD_MS = 120;
export const KNEE_LIFT = 0.5;
export const KNEE_BEND = 125;
const GROUNDED_LIFT = 0.2;

export function raised(frame: PoseFrame, side: Side): boolean {
  return legsVisible(frame) && kneeLift(frame, side) >= KNEE_LIFT && kneeAngle(frame, side) < KNEE_BEND;
}

export function grounded(frame: PoseFrame, side: Side): boolean {
  return legsVisible(frame) && Math.abs(kneeLift(frame, side)) < GROUNDED_LIFT;
}

/** The last frame with the foot down and the first frame of the knee being up, when it has stayed up since. */
function drive(history: PoseHistory, side: Side): { from: PoseFrame; top: PoseFrame; now: PoseFrame } | null {
  const frames = recent(history, RISE_MS);
  const now = frames.at(-1);
  if (!now || !raised(now, side)) return null;
  let start = frames.length - 1;
  for (let i = start - 1; i >= 0; i--) {
    const earlier = frames[i];
    if (!earlier || !raised(earlier, side)) break;
    start = i;
  }
  const top = frames[start];
  const from = frames.slice(0, start).filter((frame) => grounded(frame, side)).at(-1);
  return top && from && now.t - top.t >= HOLD_MS ? { from, top, now } : null;
}

function best(history: PoseHistory): { side: Side; found: NonNullable<ReturnType<typeof drive>> } | null {
  for (const side of SIDES) {
    const found = drive(history, side);
    if (found) return { side, found };
  }
  return null;
}

export const move: MoveDef = {
  id: "knee",
  name: "Knee strike",
  kind: "strike",
  prompt: "KNEE",
  hint: "Drive one knee up high toward your hands and keep your foot tucked under it",
  key: "n",
  diagram: {
    leftElbow: [40, 44], leftWrist: [48, 54], rightElbow: [60, 44], rightWrist: [54, 54],
    rightKnee: [58, 56], rightFoot: [56, 74],
  },
  teaches: "Held close with no room to swing an arm, a knee can still make the space to get away.",
  detect(history) {
    return best(history) ? 1 : 0;
  },
  /** Better the higher the knee goes, the tighter the leg stays folded and the faster the knee comes up. */
  quality(history) {
    const hit = best(history);
    if (!hit) return 0;
    const { from, top, now } = hit.found;
    const height = clamp01((kneeLift(now, hit.side) - KNEE_LIFT) / 0.6);
    const folded = clamp01((KNEE_BEND - kneeAngle(now, hit.side)) / 45);
    const speed = clamp01(1 - (top.t - from.t - 100) / (RISE_MS - HOLD_MS - 100));
    return clamp01(0.4 + 0.2 * height + 0.2 * folded + 0.2 * speed);
  },
};
