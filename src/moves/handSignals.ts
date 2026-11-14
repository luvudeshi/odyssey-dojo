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

const STRAIGHT = 145;
const NEARLY_STRAIGHT = 135;
const BENT = 115;
/** A punch snaps: the elbow goes from bent to straight inside this many milliseconds. A reach takes longer. */
const SNAP_MS = 200;
const OPENING_MS = 100;
const OPENING_DEGREES = 20;

/** True when the hand was higher than the nose at some point in the last `ms` milliseconds. */
export function handWasOverhead(history: PoseHistory, side: Side, ms: number): boolean {
  return recent(history, ms).some((old) => wrist(old, side).y < joint(old.image, JOINT.nose).y);
}

/** True while the elbow is straightening fast: the arm is on its way out, whether or not it has arrived. */
export function armOpening(history: PoseHistory, side: Side): boolean {
  const frame = latest(history);
  if (!frame) return false;
  const tightest = Math.min(...recent(history, OPENING_MS).map((old) => elbowAngle(old, side)));
  return elbowAngle(frame, side) - tightest > OPENING_DEGREES;
}

/** True when the fist is far out to its own side of the body, the way a flung arm ends, not in front of it. */
export function flungWide(frame: PoseFrame, side: Side): boolean {
  return wristOut(frame, side) > 1.2;
}

/**
 * How sure we are that this fist has just been punched at the camera: 1 when the arm has snapped straight,
 * 0.5 while it hangs a little short of straight. The 0.5 keeps a punch already thrown from being counted
 * again when the tracker's elbow reading wobbles; on its own it is too low to throw one.
 * Not a punch: a slow reach, or a hand that came down from over the head (a chop).
 * It does not check that the fist went forward: one-handed punches add `flungWide` for that.
 */
export function punch(history: PoseHistory, side: Side): number {
  const frame = latest(history);
  if (!frame) return 0;
  const bend = elbowAngle(frame, side);
  if (bend <= NEARLY_STRAIGHT) return 0;
  const left = side === "left";
  const shoulder = joint(frame.world, left ? JOINT.leftShoulder : JOINT.rightShoulder);
  const fist = joint(frame.world, left ? JOINT.leftWrist : JOINT.rightWrist);
  if (Math.abs(fist.y - shoulder.y) >= 0.3) return 0;
  if (!recent(history, SNAP_MS).some((old) => elbowAngle(old, side) < BENT)) return 0;
  if (handWasOverhead(history, side, 500)) return 0;
  return bend > STRAIGHT ? 1 : 0.5;
}
