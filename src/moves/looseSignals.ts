// Loose direction rules for the moves, used only by each move's `detectAsked`: they answer "did this limb (or the
// body) go roughly this way during the last half second", 1 or 0, with no shape, height or speed. They are never a
// strike of their own and never replace a strict detector.
// Signs: the picture is mirrored, so image x grows toward the player's right and wristOut is positive away from the
// body's centre line on either side; image y grows down, so wristRise is positive going up.
import type { Landmark, PoseFrame, PoseHistory } from "../core/types";
import { JOINT, elbowAngle, joint, latest, recent, shoulderCenter, shoulderWidth } from "../pose/signals";
import { armMovedBy, otherSide, upperArmLift, wristOut, wristRise } from "./handSignals";
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
/** The body went left, right or down by this share of a shoulder width, or up by BODY_UP, and that axis was the larger. */
export const BODY_SIDE = 0.25;
export const BODY_UP = 0.25;

/** First, latest and the one before it, or null when the window cannot tell a movement (too few frames, no shoulders). */
function window(history: PoseHistory): { first: PoseFrame; now: PoseFrame; before: PoseFrame } | null {
  const frames = recent(history, WINDOW_MS);
  const first = frames[0];
  const now = frames.at(-1);
  const before = frames.at(-2);
  if (!first || !now || !before || before === first || shoulderWidth(first) === 0 || shoulderWidth(now) === 0) return null;
  return { first, now, before };
}

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
    case "forward": return opened >= OPENED && !rose && !fell && !across && !outward;
  }
}

function went(history: PoseHistory, side: Side, way: ArmWay): boolean {
  const w = window(history);
  return !!w && arrived(w.first, w.now, side, way) && arrived(w.first, w.before, side, way);
}

/** 1 when this arm went `way` over the last 500 ms (on the latest two frames) and the other arm moved clearly less; else 0. */
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

/** 1 when a leg (the given one, or either) rose over the last 500 ms on the latest two frames, with both legs in view; else 0. */
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

function bodyArrived(first: PoseFrame, frame: PoseFrame, way: BodyWay): boolean {
  const width = shoulderWidth(first);
  const from = bodyAt(first);
  const to = bodyAt(frame);
  const dx = (to.x - from.x) / width;
  const dy = (to.y - from.y) / width;
  switch (way) {
    case "left": return -dx >= BODY_SIDE && -dx >= Math.abs(dy);
    case "right": return dx >= BODY_SIDE && dx >= Math.abs(dy);
    case "down": return dy >= BODY_SIDE && dy >= Math.abs(dx);
    case "up": return -dy >= BODY_UP && -dy >= Math.abs(dx);
  }
}

/** 1 when the shoulders and head together went `way` over the last 500 ms on the latest two frames, that axis the larger; else 0. */
export function bodyWent(history: PoseHistory, way: BodyWay): number {
  const w = window(history);
  return w && latest(history) && bodyArrived(w.first, w.now, way) && bodyArrived(w.first, w.before, way) ? 1 : 0;
}
