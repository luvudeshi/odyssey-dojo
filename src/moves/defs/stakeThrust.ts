// The finishing move against Polyphemus: the sharpened olive stake, driven down into his eye with both hands.
import type { MoveDef, PoseFrame } from "../../core/types";
import {
  JOINT,
  clamp01,
  distance2d,
  elbowAngle,
  joint,
  latest,
  recent,
  shoulderCenter,
  shoulderWidth,
} from "../../pose/signals";

/** How long ago the hands may have been at the chest, in milliseconds. Generous: this move should land first try. */
const WINDUP_MS = 700;

/** Both fists close enough to be gripping one stake. */
function handsTogether(frame: PoseFrame): boolean {
  const gap = distance2d(joint(frame.image, JOINT.leftWrist), joint(frame.image, JOINT.rightWrist));
  return gap < shoulderWidth(frame) * 0.75;
}

/** How far below the shoulders the hands are, in shoulder widths. Negative means above. */
function handsDrop(frame: PoseFrame): number {
  const width = shoulderWidth(frame);
  if (width === 0) return 0;
  const hands = (joint(frame.image, JOINT.leftWrist).y + joint(frame.image, JOINT.rightWrist).y) / 2;
  return (hands - shoulderCenter(frame).y) / width;
}

/** The start: both hands together at the chest with the elbows bent. */
function loaded(frame: PoseFrame): boolean {
  const drop = handsDrop(frame);
  return (
    handsTogether(frame) &&
    drop > -0.5 &&
    drop < 1.1 &&
    elbowAngle(frame, "left") < 120 &&
    elbowAngle(frame, "right") < 120
  );
}

/** The finish: both hands still together, arms driven out straight and down below the chest. */
function driven(frame: PoseFrame): boolean {
  return (
    handsTogether(frame) &&
    handsDrop(frame) > 0.9 &&
    elbowAngle(frame, "left") > 135 &&
    elbowAngle(frame, "right") > 135
  );
}

export const move: MoveDef = {
  id: "stake_thrust",
  name: "Stake thrust",
  kind: "strike",
  prompt: "DRIVE THE STAKE",
  hint: "Grip both hands together at your chest, then drive them forward and down",
  key: "t",
  diagram: { leftElbow: [36, 48], leftWrist: [47, 66], rightElbow: [64, 48], rightWrist: [53, 66], shiftY: 2 },
  teaches: "Use your body weight, not just arm strength, to break a grip and get free",
  detect(history) {
    const frame = latest(history);
    if (!frame || !driven(frame)) return 0;
    return recent(history, WINDUP_MS).some(loaded) ? 1 : 0;
  },
  /** Better the straighter the arms end up, the lower the hands are driven and the faster it goes from chest to finish. */
  quality(history) {
    const frame = latest(history);
    if (!frame) return 0;
    const windup = recent(history, WINDUP_MS).filter(loaded).at(-1);
    const straight = clamp01((Math.min(elbowAngle(frame, "left"), elbowAngle(frame, "right")) - 135) / 35);
    const depth = clamp01((handsDrop(frame) - 0.9) / 0.8);
    const speed = windup ? clamp01(1 - (frame.t - windup.t - 150) / (WINDUP_MS - 150)) : 0;
    return clamp01(0.4 + 0.2 * straight + 0.2 * depth + 0.2 * speed);
  },
};
