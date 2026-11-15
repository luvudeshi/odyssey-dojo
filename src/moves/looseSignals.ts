// Loose direction rules for the moves, used only by each move's `detectAsked`: they answer "did this limb (or the
// body) go roughly this way during the last half second", 1 or 0, with no shape, height or speed. They are never a
// strike of their own and never replace a strict detector.
// Signs: the picture is mirrored, so image x grows toward the player's right and wristOut is positive away from the
// body's centre line on either side; image y grows down, so wristRise is positive going up.
import type { Baseline, Landmark, PoseFrame, PoseHistory } from "../core/types";
import { JOINT, elbowAngle, joint, latest, shoulderCenter, shoulderWidth } from "../pose/signals";
import { armMovedBy, otherSide, steadyWindow, upperArmLift, wristOut, wristRise } from "./handSignals";
import type { Side } from "./handSignals";
import { footLift, kneeLift, legsVisible } from "./legSignals";

export type ArmWay = "forward" | "across" | "up" | "down" | "out";
export type BodyWay = "left" | "right" | "up" | "down";

/** The window every rule looks at, in ms (as `armMoved`). */
export const WINDOW_MS = 500;
/** The wrist must travel this far, in shoulder widths, for up, down, across or out, and that axis must be the larger. */
export const TRAVEL = 0.3;
/** The other arm may move at most this share of what this arm did (as `armMoved`). */
const OTHER_SHARE = 0.75;
/** The elbow opening, or the upper arm lifting, by this many degrees is an arm going out toward the camera. */
export const OPENED = 10;
/** A rising wrist whose forearm points at the camera by this share of its length (about 30 degrees) is a punch from low hands, not an uppercut. */
export const TOWARD_CAMERA = 0.5;
/** Both arms together: the weaker moved at least this share of the stronger. */
const TOGETHER_SHARE = 0.5;
/** A leg rose: the knee this far above the other knee, or the ankle this far above the other ankle, in shoulder widths. */
export const KNEE_RISE = 0.3;
export const FOOT_RISE = 0.5;
/** The shortest the wrist's fall, or its drift across or out, may be for a "forward" arm: the end of a falling or swinging arm is no push. */
export const NOT_FALLING = 0.1;
export const NOT_SIDEWAYS = 0.2;
/** With no calibrated baseline: the body went left, right, down or up by this share of a shoulder width and that axis was the larger. */
export const BODY_MOVE = 0.45;
/** With a baseline: the body must also END this far (shoulder widths) off the calibrated stance toward the asked side, about half a full dodge or duck... */
export const BODY_OFF = 0.3;
/** ...and have moved at least this far that way within the window. Standing, swaying or coming back to the middle is neither. */
export const BODY_WITHIN = 0.15;

/** Every position a rule compares is a mean of three frames (see `steadyWindow`), so random shake is not a movement. */
const window = (history: PoseHistory): { first: PoseFrame; now: PoseFrame; before: PoseFrame } | null => steadyWindow(history, WINDOW_MS);

function wristSeen(frame: PoseFrame, side: Side): boolean {
  return joint(frame.image, side === "left" ? JOINT.leftWrist : JOINT.rightWrist).visibility >= 0.3;
}

/** True when the forearm points at the camera (the wrist well in front of the elbow in 3D): a punch, even when the fist also rose. */
function atCamera(frame: PoseFrame, side: Side): boolean {
  const left = side === "left";
  const elbow = joint(frame.world, left ? JOINT.leftElbow : JOINT.rightElbow);
  const wrist = joint(frame.world, left ? JOINT.leftWrist : JOINT.rightWrist);
  const length = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y, wrist.z - elbow.z);
  // World z grows away from the camera.
  return length > 0 && (elbow.z - wrist.z) / length >= TOWARD_CAMERA;
}

/** Whether this arm went `way` between `first` and `frame`. Only the arm's own travel; the other arm is not looked at. */
function arrived(first: PoseFrame, frame: PoseFrame, side: Side, way: ArmWay): boolean {
  if (armMovedBy(frame, first, side) < 1) return false;
  const opened = Math.max(elbowAngle(frame, side) - elbowAngle(first, side), upperArmLift(frame, side) - upperArmLift(first, side));
  const seen = wristSeen(frame, side) && wristSeen(first, side);
  const out = seen ? wristOut(frame, side) - wristOut(first, side) : 0;
  const up = seen ? wristRise(frame, side) - wristRise(first, side) : 0;
  const rose = up >= TRAVEL && up >= Math.abs(out) && !atCamera(frame, side);
  const fell = -up >= TRAVEL && -up >= Math.abs(out);
  const across = -out >= TRAVEL && -out >= Math.abs(up);
  const outward = out >= TRAVEL && out >= Math.abs(up);
  switch (way) {
    case "up": return rose;
    case "down": return fell;
    case "across": return across;
    case "out": return outward;
    case "forward": return opened >= OPENED && !rose && -up <= NOT_FALLING && Math.abs(out) <= NOT_SIDEWAYS;
  }
}

function went(history: PoseHistory, side: Side, way: ArmWay): boolean {
  const w = window(history);
  return !!w && arrived(w.first, w.now, side, way) && arrived(w.first, w.before, side, way);
}

/** 1 when this arm went `way` over the last 500 ms (means of three frames at each end) and the other arm moved clearly less; else 0. */
export function armWent(history: PoseHistory, side: Side, way: ArmWay): number {
  const w = window(history);
  if (!w || !went(history, side, way)) return 0;
  return armMovedBy(w.now, w.first, otherSide(side)) <= OTHER_SHARE * armMovedBy(w.now, w.first, side) ? 1 : 0;
}

/** 1 when both arms moved (each clearly, neither under half of the other), and, when `way` is given, both went that way; else 0. */
export function armsWent(history: PoseHistory, way?: ArmWay): number {
  const w = window(history);
  if (!w) return 0;
  const left = armMovedBy(w.now, w.first, "left");
  const right = armMovedBy(w.now, w.first, "right");
  if (Math.min(left, right) < 1 || Math.min(left, right) < TOGETHER_SHARE * Math.max(left, right)) return 0;
  return way === undefined || (went(history, "left", way) && went(history, "right", way)) ? 1 : 0;
}

function legRoseBy(first: PoseFrame, frame: PoseFrame, side: Side): boolean {
  if (!legsVisible(first) || !legsVisible(frame)) return false;
  return kneeLift(frame, side) - kneeLift(first, side) >= KNEE_RISE || footLift(frame, side) - footLift(first, side) >= FOOT_RISE;
}

/** 1 when a leg (the given one, or either) rose over the last 500 ms (means of three frames), with both legs in view; else 0. */
export function legRose(history: PoseHistory, side?: Side): number {
  const w = window(history);
  if (!w) return 0;
  const sides: readonly Side[] = side === undefined ? ["left", "right"] : [side];
  return sides.some((s) => legRoseBy(w.first, w.now, s) && legRoseBy(w.first, w.before, s)) ? 1 : 0;
}

function bodyAt(frame: PoseFrame): Landmark {
  const centre = shoulderCenter(frame);
  const nose = joint(frame.image, JOINT.nose);
  return { x: (centre.x + nose.x) / 2, y: (centre.y + nose.y) / 2, z: 0, visibility: 1 };
}

function bodyArrived(first: PoseFrame, frame: PoseFrame, way: BodyWay, baseline: Baseline | null): boolean {
  const width = shoulderWidth(first);
  const from = bodyAt(first);
  const to = bodyAt(frame);
  const dx = (to.x - from.x) / width;
  const dy = (to.y - from.y) / width;
  // Positive toward the asked way, in shoulder widths: moved in the window, and the other axis smaller.
  const along = way === "left" ? -dx : way === "right" ? dx : way === "down" ? dy : -dy;
  const across = way === "left" || way === "right" ? dy : dx;
  if (along < (baseline ? BODY_WITHIN : BODY_MOVE) || along < Math.abs(across)) return false;
  if (!baseline || baseline.shoulderWidth <= 0) return true;
  // Against the calibrated stance the body must end off to that side, which a sway or a return to the middle never does.
  const centre = shoulderCenter(frame);
  const off = way === "left" ? baseline.centerX - centre.x : way === "right" ? centre.x - baseline.centerX
    : way === "down" ? centre.y - baseline.shoulderY : baseline.shoulderY - centre.y;
  return off / baseline.shoulderWidth >= BODY_OFF;
}

/** 1 when the shoulders and head went `way` over the last 500 ms, steady over the latest frames; with a baseline also ending BODY_OFF off the stance that way; else 0. */
export function bodyWent(history: PoseHistory, way: BodyWay): number {
  const w = window(history);
  return w && latest(history) && bodyArrived(w.first, w.now, way, history.baseline) && bodyArrived(w.first, w.before, way, history.baseline) ? 1 : 0;
}
