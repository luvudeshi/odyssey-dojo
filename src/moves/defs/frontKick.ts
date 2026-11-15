// Pankration's front kick: the knee comes up first, then the foot drives straight out. Either leg counts.
import type { MoveDef, PoseFrame, PoseHistory } from "../../core/types";
import { clamp01, latest, recent } from "../../pose/signals";
import type { Side } from "../handSignals";
import { SIDES, footLift, kneeAngle, kneeLift, legsVisible } from "../legSignals";

/** How long ago the knee may have been chambered, in milliseconds. */
export const CHAMBER_MS = 500;
export const CHAMBER_LIFT = 0.25;
export const CHAMBER_BEND = 110;
export const KICK_LIFT = 0.5;
export const KICK_STRAIGHT = 120;

/** The start: the knee is up and the lower leg is still folded under it. */
export function chambered(frame: PoseFrame, side: Side): boolean {
  return legsVisible(frame) && kneeLift(frame, side) >= CHAMBER_LIFT && kneeAngle(frame, side) < CHAMBER_BEND;
}

/** The finish: the leg is straight and the foot is well off the floor. */
function extended(frame: PoseFrame, side: Side): boolean {
  return legsVisible(frame) && footLift(frame, side) >= KICK_LIFT && kneeAngle(frame, side) >= KICK_STRAIGHT;
}

/** The leg that has just gone from chambered to straight, if any. */
function kickingSide(history: PoseHistory): Side | undefined {
  const frame = latest(history);
  if (!frame) return undefined;
  const frames = recent(history, CHAMBER_MS);
  return SIDES.find((side) => extended(frame, side) && frames.some((old) => chambered(old, side)));
}

export const move: MoveDef = {
  id: "front_kick",
  name: "Front kick",
  kind: "strike",
  prompt: "FRONT KICK",
  hint: "Lift your knee, then snap your foot straight out in front of you",
  key: "f",
  diagram: {
    leftElbow: [38, 42], leftWrist: [43, 26], rightElbow: [62, 42], rightWrist: [57, 26],
    rightKnee: [62, 64], rightFoot: [78, 58],
  },
  teaches: "A front kick keeps someone at leg length, further away than their hands can reach.",
  detect(history) {
    return kickingSide(history) ? 1 : 0;
  },
  /** Better the higher the foot goes, the straighter the leg ends up and the faster it snaps out of the chamber. */
  quality(history) {
    const frame = latest(history);
    const side = kickingSide(history);
    if (!frame || !side) return 0;
    const chamber = recent(history, CHAMBER_MS).filter((old) => chambered(old, side)).at(-1);
    const height = clamp01((footLift(frame, side) - KICK_LIFT) / 1);
    const straight = clamp01((kneeAngle(frame, side) - KICK_STRAIGHT) / 35);
    const speed = chamber ? clamp01(1 - (frame.t - chamber.t - 100) / (CHAMBER_MS - 100)) : 0;
    return clamp01(0.4 + 0.2 * height + 0.2 * straight + 0.2 * speed);
  },
};
