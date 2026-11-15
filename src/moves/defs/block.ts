import type { MoveDef, PoseFrame } from "../../core/types";
import { JOINT, SEEN, clamp01, joint, latest, bothNewest, meanOf, recent, shoulderCenter, shoulderWidth } from "../../pose/signals";

/** A webcam's landmarks shake by about 1% of the frame; the guard is also read from this many milliseconds of frames. */
export const STEADY_MS = 200;

// All in shoulder widths of the picture. The owner's real guard, seen waist-up, has the fists 0.55 to 1.0 from the
// nose and from 0.26 below the shoulder line up; hands waiting at the chest are 1.47 from the nose and 0.5 below it.
/** Fists this close to the nose are a full guard... */
const NEAR = 1;
/** ...and from this far out, none. */
const FAR = 1.4;
/** A wrist this far below the shoulder line is down at the chest, not up at the face... */
const LOW = -0.4;
/** ...and from this high it is up. */
const HIGH = -0.2;
/**
 * How far the elbow sits below the wrist. A guard's forearm stands up (0.8 to 1.3 on the owner's camera); an arm
 * punched or pushed at the camera lies flat in the picture (0.2, and 0.35 on its way out), which is how a punch
 * ending by the face is told from a guard.
 */
const FLAT = 0.35;
const UPRIGHT = 0.65;
/** With the wrist hidden, the elbow alone: raised in front of the ribs it is 0.45 below the shoulders, hanging 1.1. */
const ELBOW_LOW = -0.8;
const ELBOW_HIGH = -0.6;

/** 0 at `zero`, 1 at `one`, straight in between. */
function ramp(value: number, zero: number, one: number): number {
  return clamp01((value - zero) / (one - zero));
}

/** How far a wrist is from the nose in the picture, with both points averaged over the frames first. */
function reach(frames: readonly PoseFrame[], wrist: number): number {
  return Math.hypot(
    meanOf(frames, (frame) => joint(frame.image, wrist).x - joint(frame.image, JOINT.nose).x),
    meanOf(frames, (frame) => joint(frame.image, wrist).y - joint(frame.image, JOINT.nose).y),
  );
}

/** How much one arm is up in a guard over these frames, 0 to 1. */
function armUp(frames: readonly PoseFrame[], wrist: number, elbow: number): number {
  const width = meanOf(frames, shoulderWidth);
  if (width === 0) return 0;
  const seen = (index: number) => meanOf(frames, (frame) => joint(frame.image, index).visibility) >= SEEN;
  const shoulders = meanOf(frames, (frame) => shoulderCenter(frame).y);
  const elbowY = meanOf(frames, (frame) => joint(frame.image, elbow).y);
  // A wrist the tracker cannot see must not veto an arm its elbow plainly shows raised.
  if (!seen(wrist)) return seen(elbow) ? ramp((shoulders - elbowY) / width, ELBOW_LOW, ELBOW_HIGH) : 0;
  const wristY = meanOf(frames, (frame) => joint(frame.image, wrist).y);
  const near = ramp(reach(frames, wrist) / width, FAR, NEAR);
  const high = ramp((shoulders - wristY) / width, LOW, HIGH);
  const upright = seen(elbow) ? ramp((elbowY - wristY) / width, FLAT, UPRIGHT) : 1;
  return Math.min(near, high, upright);
}

/** 1 when both fists are up by the face with the forearms standing, 0 with either hand down at the chest or lower. */
export function guard(frames: readonly PoseFrame[]): number {
  if (frames.length === 0) return 0;
  return Math.min(armUp(frames, JOINT.leftWrist, JOINT.leftElbow), armUp(frames, JOINT.rightWrist, JOINT.rightElbow));
}

export const move: MoveDef = {
  id: "block",
  name: "Block",
  kind: "defend",
  prompt: "BLOCK",
  hint: "Bring both fists up to your face",
  key: " ",
  diagram: { leftElbow: [40, 40], leftWrist: [44, 22], rightElbow: [60, 40], rightWrist: [56, 22] },
  teaches: "Hands high protects your head while you look for a way out",
  detect(history) {
    if (!latest(history)) return 0;
    // The newest two frames put the guard up at once; the steadied reading keeps it up through the shake.
    return Math.max(bothNewest(history, guard), guard(recent(history, STEADY_MS)));
  },
};
