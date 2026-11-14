// Hand measurements shared by the karate, kung fu and boxing strikes.
// All are in shoulder widths, taken from the mirrored webcam picture, so they hold at any distance from the camera.
import type { PoseFrame, PoseHistory } from "../core/types";
import { JOINT, distance2d, elbowAngle, joint, latest, recent, shoulderCenter, shoulderWidth } from "../pose/signals";

export type Side = "left" | "right";

export function otherSide(side: Side): Side {
  return side === "left" ? "right" : "left";
}

function wrist(frame: PoseFrame, side: Side) {
  return joint(frame.image, side === "left" ? JOINT.leftWrist : JOINT.rightWrist);
}

/** How far a wrist is above the shoulder line. Negative is below: about -1.7 with the arm hanging. */
export function wristRise(frame: PoseFrame, side: Side): number {
  const width = shoulderWidth(frame);
  return width === 0 ? 0 : (shoulderCenter(frame).y - wrist(frame, side).y) / width;
}

/** How far a wrist is out to its own side of the body's centre line. Negative means it has crossed over. */
export function wristOut(frame: PoseFrame, side: Side): number {
  const width = shoulderWidth(frame);
  if (width === 0) return 0;
  const offset = wrist(frame, side).x - shoulderCenter(frame).x;
  return (side === "right" ? offset : -offset) / width;
}

/** Distance between the two wrists. About 1.25 with both arms hanging. */
export function wristGap(frame: PoseFrame): number {
  const width = shoulderWidth(frame);
  return width === 0 ? 0 : distance2d(wrist(frame, "left"), wrist(frame, "right")) / width;
}

/**
 * True when the hand was down by the waist within the last 400 ms and is now up in front of the body,
 * between the shoulders and the top of the head, with the elbow bent tighter than `bentBelow` degrees.
 */
export function risingHand(history: PoseHistory, side: Side, bentBelow: number): boolean {
  const frame = latest(history);
  if (!frame) return false;
  const rise = wristRise(frame, side);
  if (rise < -0.15 || rise > 1.3 || wristOut(frame, side) > 1 || elbowAngle(frame, side) > bentBelow) return false;
  return recent(history, 400).some((old) => wristRise(old, side) < -1);
}
