// Hand measurements shared by the karate, kung fu and boxing strikes.
// Picture measurements are in shoulder widths of the mirrored webcam picture, so they hold at any distance from
// the camera. Measurements on the 3D points are in shoulder widths of the 3D body, so they hold for a child and
// for a tall adult alike: nothing here is an absolute share of the frame or an absolute number of metres.
// The 3D rulers come from the calibrated baseline, measured while the player stood facing the camera, so they
// do not change when the tracker's 3D body is off for a frame or the player turns. A baseline without them
// (or none yet) falls back to measuring the current frame.
import type { Baseline, PoseFrame, PoseHistory } from "../core/types";
import {
  JOINT, distance2d, elbowAngle, joint, latest, recent, shoulderCenter, shoulderWidth, shoulderWidth3d, torsoLength3d,
} from "../pose/signals";

export type Side = "left" | "right";

/** A ruler from the baseline, or null when the baseline has none: left out, or zero because it had no 3D points. */
function calibrated(ruler: number | undefined): number | null {
  return ruler !== undefined && ruler > 0 ? ruler : null;
}

/** Shoulder width of the 3D body, in metres: the ruler for 3D distances across and forward. About 0.4 for an adult. */
export function bodyWidth(frame: PoseFrame, baseline: Baseline | null): number {
  return calibrated(baseline?.shoulderWidth3d) ?? shoulderWidth3d(frame);
}

/** Shoulders to hips on the 3D body, in metres: the ruler for 3D heights. About 0.5 for an adult. */
export function torsoLength(frame: PoseFrame, baseline: Baseline | null): number {
  return calibrated(baseline?.torsoLength3d) ?? torsoLength3d(frame);
}

/** How far a fist may sit above or below its shoulder and still be at shoulder height, in 3D torso lengths (0.3 m on a 0.5 m torso). */
export const SHOULDER_HEIGHT = 0.6;

/** True when the fist is at shoulder height in 3D. */
function fistLevel(frame: PoseFrame, side: Side, baseline: Baseline | null): boolean {
  const left = side === "left";
  const shoulder = joint(frame.world, left ? JOINT.leftShoulder : JOINT.rightShoulder);
  const fist = joint(frame.world, left ? JOINT.leftWrist : JOINT.rightWrist);
  return Math.abs(fist.y - shoulder.y) < SHOULDER_HEIGHT * torsoLength(frame, baseline);
}

/** True when the arm is straight and the fist is at shoulder height. */
export function armOut(frame: PoseFrame, side: Side, baseline: Baseline | null): boolean {
  return elbowAngle(frame, side) > 145 && fistLevel(frame, side, baseline);
}

/** True when the arm just went from bent to straight at shoulder height: a punch. */
export function armThrust(history: PoseHistory, side: Side): boolean {
  const now = latest(history);
  if (!now || !armOut(now, side, history.baseline)) return false;
  return recent(history, 450).some((frame) => elbowAngle(frame, side) < 115);
}

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

/** A wrist lower than this, in shoulder widths above the shoulder line, is down by the waist. */
const WAIST = -1;
/** A wrist higher than this has come up to the chest. */
const CHEST = -0.6;

/**
 * True when the hand was down by the waist within the last 400 ms and is now up in front of the body,
 * between the shoulders and the top of the head, with the elbow bent tighter than `bentBelow` degrees.
 * Not a rising hand: a punch thrown from the waist, which passes the same place with its elbow snapping open,
 * or both hands brought up together, which is a guard going up or the start of a two-handed push.
 */
export function risingHand(history: PoseHistory, side: Side, bentBelow: number): boolean {
  const frame = latest(history);
  if (!frame) return false;
  const rise = wristRise(frame, side);
  if (rise < -0.15 || rise > 1.3 || wristOut(frame, side) > 1 || elbowAngle(frame, side) > bentBelow) return false;
  if (armOpening(history, side)) return false;
  const before = recent(history, 400);
  if (!before.some((old) => wristRise(old, side) < WAIST)) return false;
  const other = otherSide(side);
  return !(wristRise(frame, other) > CHEST && before.some((old) => wristRise(old, other) < WAIST));
}

export const STRAIGHT = 145;
const NEARLY_STRAIGHT = 135;
export const BENT = 115;
/** A punch snaps: the elbow goes from bent to straight inside this many milliseconds. A reach takes longer. */
export const SNAP_MS = 200;
export const OPENING_MS = 100;
export const OPENING_DEGREES = 20;

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
  if (!fistLevel(frame, side, history.baseline)) return 0;
  if (!recent(history, SNAP_MS).some((old) => elbowAngle(old, side) < BENT)) return 0;
  if (handWasOverhead(history, side, 500)) return 0;
  return bend > STRAIGHT ? 1 : 0.5;
}

// Lenient reading for the strikes (wave 18). The owner plays seated at a desk, seen from the waist up, on the lite
// model: arm joints come in at visibility 0.3 to 0.5, the hips are guesses, and a fist thrown at the camera reads
// 20 to 30 degrees short of straight in 3D. A rough attempt from a real body counts; what keeps two strikes of one
// style apart is one feature each (which hand, which way the fist travels, how high the elbow is), not tight gates.

/** From this visibility a joint counts as seen. */
export const SEEN = 0.3;

function seen(frame: PoseFrame, index: number): boolean {
  return joint(frame.image, index).visibility >= SEEN;
}

function armJoints(side: Side): { shoulder: number; elbow: number; wrist: number } {
  return side === "left"
    ? { shoulder: JOINT.leftShoulder, elbow: JOINT.leftElbow, wrist: JOINT.leftWrist }
    : { shoulder: JOINT.rightShoulder, elbow: JOINT.rightElbow, wrist: JOINT.rightWrist };
}

/** The ruler for 3D heights: the torso when both hips are seen, otherwise 1.25 shoulder widths (a waist-up player). */
export function heightRuler(frame: PoseFrame, baseline: Baseline | null): number {
  return seen(frame, JOINT.leftHip) && seen(frame, JOINT.rightHip)
    ? torsoLength(frame, baseline)
    : 1.25 * bodyWidth(frame, baseline);
}

/** The upper arm's angle from hanging straight down, in 3D degrees: 0 hanging, 90 level, 180 straight up. */
export function upperArmLift(frame: PoseFrame, side: Side): number {
  const ids = armJoints(side);
  const shoulder = joint(frame.world, ids.shoulder);
  const elbow = joint(frame.world, ids.elbow);
  const length = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y, elbow.z - shoulder.z);
  if (length === 0) return 0;
  // World y grows downward, so a hanging arm has the elbow below the shoulder.
  return (Math.acos(Math.min(1, Math.max(-1, (elbow.y - shoulder.y) / length))) * 180) / Math.PI;
}

/** How much of the upper arm points out to its own side, in 3D: 1 straight out sideways, 0 forward or down. */
function upperArmSideways(frame: PoseFrame, side: Side): number {
  const ids = armJoints(side);
  const shoulder = joint(frame.world, ids.shoulder);
  const elbow = joint(frame.world, ids.elbow);
  const length = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y, elbow.z - shoulder.z);
  // The player's left is at -x.
  return length === 0 ? 0 : ((side === "left" ? -1 : 1) * (elbow.x - shoulder.x)) / length;
}

/** A fist may sit this many height rulers above or below its shoulder and still be punching (0.375 m on 0.5 m). */
const PUNCH_HEIGHT = 0.75;
/** Further out to its own side than this, in shoulder widths, a fist was flung sideways, not punched forward. */
export const PUNCH_WIDE = 1.6;
/** The elbow reads as open from OPEN_FROM degrees and fully open at OPEN_TO. A fist at the camera reads short. */
const OPEN_FROM = 105;
const OPEN_TO = 120;
/** With the wrist lost, an upper arm lifted forward from LIFT_FROM degrees to LIFT_TO reads as a punch. */
const LIFT_FROM = 50;
const LIFT_TO = 70;

/**
 * How far out this arm is punched, 0 to 1, on one frame. With the wrist seen: the elbow opened at about shoulder
 * height, and the fist in front of the body rather than flung out to its side. With only the elbow seen (a fist
 * at the camera hides its own wrist): the upper arm lifted forward toward level. Never for a hand over the head.
 */
export function armReach(frame: PoseFrame, side: Side, baseline: Baseline | null): number {
  const ids = armJoints(side);
  if (!seen(frame, ids.shoulder)) return 0;
  const lift = upperArmLift(frame, side);
  if (lift > 140) return 0;
  if (seen(frame, ids.wrist)) {
    const shoulder = joint(frame.world, ids.shoulder);
    const fist = joint(frame.world, ids.wrist);
    if (Math.abs(fist.y - shoulder.y) > PUNCH_HEIGHT * heightRuler(frame, baseline)) return 0;
    if (wristOut(frame, side) > PUNCH_WIDE) return 0;
    return clamp01((elbowAngle(frame, side) - OPEN_FROM) / (OPEN_TO - OPEN_FROM));
  }
  if (!seen(frame, ids.elbow) || upperArmSideways(frame, side) > 0.75) return 0;
  return clamp01((lift - LIFT_FROM) / (LIFT_TO - LIFT_FROM));
}

/** A throw gets out fast: in this many milliseconds the elbow opens, or the upper arm rises, by THROW_DEGREES. */
export const THROW_MS = 250;
const THROW_DEGREES = 35;
/** How far above the nose, in shoulder widths, a hand must have been for the move to be a chop and not a punch. */
const OVER_HEAD = 0.8;

/** True when the arm opened or rose by THROW_DEGREES inside THROW_MS: anything thrown in up to about 0.7 s. A 1 s reach is not. */
function thrown(history: PoseHistory, side: Side): boolean {
  const frame = latest(history);
  if (!frame) return false;
  const bend = elbowAngle(frame, side);
  const lift = upperArmLift(frame, side);
  return recent(history, THROW_MS).some(
    (old) => bend - elbowAngle(old, side) >= THROW_DEGREES || lift - upperArmLift(old, side) >= THROW_DEGREES,
  );
}

/** True when the hand was well over the head in the last 500 ms: the start of a chop, not of a punch. */
function cameFromOverhead(history: PoseHistory, side: Side): boolean {
  return recent(history, 500).some(
    (old) =>
      joint(old.image, JOINT.nose).y - wrist(old, side).y > OVER_HEAD * shoulderWidth(old) || upperArmLift(old, side) > 150,
  );
}

/**
 * How sure we are that this fist has just been punched, 0 to 1: the arm is out on this frame and the one before
 * (so one wild frame cannot throw a punch), it got out fast, and it did not come down from over the head.
 * Any start counts: a guard, the hands down, or the forearms on a desk.
 */
export function strike(history: PoseHistory, side: Side): number {
  const frame = latest(history);
  if (!frame) return 0;
  const before = history.frames.at(-2);
  const now = armReach(frame, side, history.baseline);
  const reach = before && frame.t - before.t <= 150 ? Math.min(now, armReach(before, side, history.baseline)) : now;
  if (reach === 0 || !thrown(history, side) || cameFromOverhead(history, side)) return 0;
  return reach;
}

/** How far the fist travelled over the last `ms`: `across` toward the body's centre line and `up`, in shoulder widths. */
export function travel(history: PoseHistory, side: Side, ms: number): { across: number; up: number } {
  const frame = latest(history);
  const first = recent(history, ms)[0];
  if (!frame || !first) return { across: 0, up: 0 };
  return { across: wristOut(first, side) - wristOut(frame, side), up: wristRise(frame, side) - wristRise(first, side) };
}

/** True when the fist swept across toward the centre line more than it rose: the path of a hook, not a punch. */
export function sweptAcross(history: PoseHistory, side: Side): boolean {
  const { across, up } = travel(history, side, THROW_MS);
  return across >= 0.35 && across >= up;
}
