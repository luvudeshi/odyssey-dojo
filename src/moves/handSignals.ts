// Hand measurements shared by the karate, kung fu and boxing strikes.
// Picture measurements are in shoulder widths of the mirrored webcam picture, so they hold at any distance from
// the camera. Measurements on the 3D points are in shoulder widths of the 3D body, so they hold for a child and
// for a tall adult alike: nothing here is an absolute share of the frame or an absolute number of metres.
// The 3D rulers come from the calibrated baseline, measured while the player stood facing the camera, so they
// do not change when the tracker's 3D body is off for a frame or the player turns. A baseline without them
// (or none yet) falls back to measuring the current frame.
import type { Baseline, PoseFrame, PoseHistory } from "../core/types";
import {
  JOINT, clamp01, distance2d, elbowAngle, joint, latest, recent, shoulderCenter, shoulderWidth, shoulderWidth3d, torsoLength3d,
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

/** The rising hand: where the wrist may end, in shoulder widths above the shoulder line (chin to forehead). */
export const RISE_LOW = 0.2;
export const RISE_HIGH = 1.6;
/** It came up from below the chest (LOW_START), by at least RISE_BY shoulder widths, inside RISE_MS. */
export const LOW_START = -0.4;
export const RISE_BY = 0.75;
export const RISE_MS = 450;
/** The one feature that tells a rising hand from a punch: the elbow stays low, the upper arm lifted no more than this. */
export const ELBOW_LOW = 55;
/** How bent each rising strike keeps its elbow, in degrees: the uppercut's fist, the rising palm's open hand. */
export const UPPERCUT_BEND = 150;
export const RISING_PALM_BEND = 165;

/**
 * True when the hand came up from below the chest within the last RISE_MS and is now up in front of the body,
 * between the chest and the forehead, with the elbow bent tighter than `bentBelow` degrees and kept low.
 * Not a rising hand: a punch, which lifts the elbow toward the camera or snaps it open, a hook sweeping across,
 * or both hands brought up together, which is a guard going up or the start of a two-handed push.
 */
export function risingHand(history: PoseHistory, side: Side, bentBelow: number): boolean {
  const frame = latest(history);
  if (!frame) return false;
  const rise = wristRise(frame, side);
  if (rise < RISE_LOW || rise > RISE_HIGH || wristOut(frame, side) > 1.2 || elbowAngle(frame, side) > bentBelow) return false;
  if (upperArmLift(frame, side) > ELBOW_LOW || armOpening(history, side) || sweptAcross(history, side)) return false;
  const before = recent(history, RISE_MS);
  if (!before.some((old) => wristRise(old, side) < LOW_START && rise - wristRise(old, side) >= RISE_BY)) return false;
  // Both hands coming up together from low, at any stage of the way, is a guard going up. The other hand lifted
  // from a guard at the chest to the face is a boxer covering up while throwing it, and still counts.
  const other = otherSide(side);
  const otherNow = wristRise(frame, other);
  return !before.some((old) => wristRise(old, other) < LOW_START && otherNow - wristRise(old, other) >= RISE_BY / 2);
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

/** A fist may sit this many height rulers above or below its shoulder and still be punching (0.5 m on 0.5 m). */
const PUNCH_HEIGHT = 1;
/** A punching upper arm is lifted at least this far from hanging, in degrees: an arm dropped to the side is not out. */
const PUNCH_LIFT = 40;
/** An upper arm more sideways than this (1 straight out to its own side) is not punching. */
const SIDE_ON = 0.75;
/** Further out to its own side than this, in shoulder widths, a fist was flung sideways, not punched forward. */
export const PUNCH_WIDE = 1.6;
/** The elbow reads as open from OPEN_FROM degrees and fully open at OPEN_TO. A fist at the camera reads short. */
const OPEN_FROM = 105;
const OPEN_TO = 120;
/** With the wrist lost, an upper arm lifted forward from LIFT_FROM degrees to LIFT_TO reads as a punch. */
const LIFT_FROM = 50;
const LIFT_TO = 70;
/**
 * With the wrist seen, an elbow open at least this far, in degrees, and lifted as above, reads as a punch too,
 * once the upper arm has settled: risen less than SETTLED degrees since the frame before. On its way up it is
 * the same shape as an arm being raised over the head.
 */
const LIFT_BENT = 90;
const SETTLED = 12;
/**
 * ...and the forearm must point up: the wrist above the elbow by at least this share of the forearm's length
 * (about 25 degrees). A hook's loaded arm, elbow lifted and forearm level at the camera, is the same shape otherwise.
 */
const FIST_UP = 0.4;

/**
 * How far out this arm is punched, 0 to 1, on one frame. With the wrist seen: the elbow opened at about shoulder
 * height, and the fist in front of the body rather than flung out to its side. With only the elbow seen (a fist
 * at the camera hides its own wrist): the upper arm lifted forward toward level. Never for a hand over the head.
 * `settled` says whether the bent, lifted elbow may count (see LIFT_BENT).
 */
export function armReach(frame: PoseFrame, side: Side, baseline: Baseline | null, settled: boolean): number {
  const ids = armJoints(side);
  if (!seen(frame, ids.shoulder)) return 0;
  const lift = upperArmLift(frame, side);
  // An upper arm pointing out to its own side is raised or flung sideways, not punched forward.
  if (lift > 140 || lift < PUNCH_LIFT || upperArmSideways(frame, side) > SIDE_ON) return 0;
  if (seen(frame, ids.wrist)) {
    const shoulder = joint(frame.world, ids.shoulder);
    const fist = joint(frame.world, ids.wrist);
    if (Math.abs(fist.y - shoulder.y) > PUNCH_HEIGHT * heightRuler(frame, baseline)) return 0;
    if (wristOut(frame, side) > PUNCH_WIDE) return 0;
    const bend = elbowAngle(frame, side);
    const open = clamp01((bend - OPEN_FROM) / (OPEN_TO - OPEN_FROM));
    // A fist driven at a camera above it reads with the elbow still bent; then the elbow lifted level is the punch.
    const elbow = joint(frame.world, ids.elbow);
    const fistUp = elbow.y - fist.y >= FIST_UP * Math.hypot(fist.x - elbow.x, fist.y - elbow.y, fist.z - elbow.z);
    const lifted = settled && fistUp && bend >= LIFT_BENT;
    return Math.max(open, lifted ? clamp01((lift - LIFT_FROM) / (LIFT_TO - LIFT_FROM)) : 0);
  }
  if (!seen(frame, ids.elbow)) return 0;
  return clamp01((lift - LIFT_FROM) / (LIFT_TO - LIFT_FROM));
}

/** A throw gets out fast: in this many milliseconds the elbow opens, or the upper arm rises, by THROW_DEGREES. */
export const THROW_MS = 250;
export const THROW_DEGREES = 35;
/** A fist that travelled this far sideways in THROW_MS, in shoulder widths, and less far up, was swept, not punched. */
export const SIDEWAYS = 0.6;

/** The most the elbow opened, or the upper arm rose, over the last THROW_MS, in degrees. */
export function throwDegrees(history: PoseHistory, side: Side): number {
  const frame = latest(history);
  if (!frame) return -Infinity;
  const bend = elbowAngle(frame, side);
  const lift = upperArmLift(frame, side);
  return Math.max(...recent(history, THROW_MS).map((old) => Math.max(bend - elbowAngle(old, side), lift - upperArmLift(old, side))));
}

/** True when the arm opened or rose by THROW_DEGREES inside THROW_MS: anything thrown in up to about 0.7 s. A 1 s reach is not. */
export function thrown(history: PoseHistory, side: Side): boolean {
  return throwDegrees(history, side) >= THROW_DEGREES;
}

/**
 * True when the hand is over the punching band, or the arm nearly straight up. Measured in 3D on the height
 * ruler, so shoulder width alone does not move it.
 */
export function overBand(frame: PoseFrame, side: Side, baseline: Baseline | null): boolean {
  const ids = armJoints(side);
  return (
    joint(frame.world, ids.shoulder).y - joint(frame.world, ids.wrist).y > PUNCH_HEIGHT * heightRuler(frame, baseline) ||
    upperArmLift(frame, side) > 150
  );
}

/** True when the hand was over the punching band in the last 500 ms: the start of a chop, not of a punch. */
export function cameFromOverhead(history: PoseHistory, side: Side): boolean {
  return recent(history, 500).some((old) => overBand(old, side, history.baseline));
}

/** How far out the arm is on this frame and the one before (so one wild frame cannot throw a punch), 0 to 1. */
export function heldReach(history: PoseHistory, side: Side): number {
  const [earlier, before, frame] = history.frames.slice(-3);
  if (!frame) return 0;
  const settled = (at: PoseFrame, previous: PoseFrame | undefined): boolean =>
    !previous || upperArmLift(at, side) - upperArmLift(previous, side) < SETTLED;
  const now = armReach(frame, side, history.baseline, settled(frame, before));
  if (!before || frame.t - before.t > 150) return now;
  return Math.min(now, armReach(before, side, history.baseline, settled(before, earlier)));
}

/** How far the fist travelled sideways over THROW_MS, in shoulder widths, when that was at least as far as it rose; else 0. */
export function sidewaysTravel(history: PoseHistory, side: Side): number {
  const { across, up } = travel(history, side, THROW_MS);
  return Math.abs(across) >= up ? Math.abs(across) : 0;
}

/**
 * How sure we are that this fist has just been punched, 0 to 1: the arm is out on this frame and the one before,
 * it got out fast, it did not come down from over the head, and it went forward (or up at a camera above the
 * fist) rather than mostly sideways. Any start counts: a guard, the hands down, or the forearms on a desk.
 */
export function strike(history: PoseHistory, side: Side): number {
  const reach = heldReach(history, side);
  if (reach === 0 || !thrown(history, side) || cameFromOverhead(history, side)) return 0;
  return sidewaysTravel(history, side) >= SIDEWAYS ? 0 : reach;
}

/** True when the other arm is on its way out too: the two fists together are a two-handed thrust, not one punch. */
export function otherThrowing(history: PoseHistory, side: Side): boolean {
  const frame = latest(history);
  const other = otherSide(side);
  return !!frame && (armOpening(history, other) || (thrown(history, other) && armReach(frame, other, history.baseline, true) > 0));
}

/** How far the fist travelled over the last `ms`: `across` toward the body's centre line and `up`, in shoulder widths. */
export function travel(history: PoseHistory, side: Side, ms: number): { across: number; up: number } {
  const frame = latest(history);
  const first = recent(history, ms)[0];
  if (!frame || !first) return { across: 0, up: 0 };
  return { across: wristOut(first, side) - wristOut(frame, side), up: wristRise(frame, side) - wristRise(first, side) };
}

/** A fist that swept this far toward the centre line, in shoulder widths, and less far up, took a hook's path. */
export const SWEPT = 0.35;

/**
 * True when the fist swept across toward the centre line more than it rose, over THROW_MS or its last half: the
 * path of a hook, not a punch. The half catches a hook's first frames, while the longer window still holds the
 * elbow being lifted into place.
 */
export function sweptAcross(history: PoseHistory, side: Side): boolean {
  return [THROW_MS, THROW_MS / 2].some((ms) => {
    const { across, up } = travel(history, side, ms);
    return across >= SWEPT && across >= up;
  });
}
