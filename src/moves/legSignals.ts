// Leg measurements shared by the kicks. Lifts are in shoulder widths, taken from the mirrored webcam picture,
// and compare one leg with the other, so a duck or a jump (both legs moving together) reads as nothing.
import type { FightingStyle, Landmark, PoseFrame } from "../core/types";
import { JOINT, joint, shoulderWidth } from "../pose/signals";
import { otherSide } from "./handSignals";
import type { Side } from "./handSignals";

export const SIDES: readonly Side[] = ["left", "right"];
/** Moves that need the legs in view. */
export const KICK_IDS: readonly string[] = ["front_kick", "knee"];

const LEG_JOINTS = [JOINT.leftKnee, JOINT.rightKnee, JOINT.leftAnkle, JOINT.rightAnkle];
const SEEN = 0.5;

/** True when the tracker is sure of both knees and both ankles and they are inside the picture. */
export function legsVisible(frame: PoseFrame): boolean {
  return LEG_JOINTS.every((index) => {
    const point = joint(frame.image, index);
    return point.visibility >= SEEN && point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1;
  });
}

function leg(list: readonly Landmark[], side: Side): [Landmark, Landmark, Landmark] {
  const left = side === "left";
  return [
    joint(list, left ? JOINT.leftHip : JOINT.rightHip),
    joint(list, left ? JOINT.leftKnee : JOINT.rightKnee),
    joint(list, left ? JOINT.leftAnkle : JOINT.rightAnkle),
  ];
}

/** How far this knee is above the other knee. 0 standing; about 0.9 with the thigh level. */
export function kneeLift(frame: PoseFrame, side: Side): number {
  const width = shoulderWidth(frame);
  return width === 0 ? 0 : (leg(frame.image, otherSide(side))[1].y - leg(frame.image, side)[1].y) / width;
}

/** How far this ankle is above the other ankle. 0 standing; about 1.8 with the foot at hip height. */
export function footLift(frame: PoseFrame, side: Side): number {
  const width = shoulderWidth(frame);
  return width === 0 ? 0 : (leg(frame.image, otherSide(side))[2].y - leg(frame.image, side)[2].y) / width;
}

/** Knee bend in degrees, in 3D: 180 is a straight leg, 90 is the lower leg folded square. */
export function kneeAngle(frame: PoseFrame, side: Side): number {
  const [hip, knee, ankle] = leg(frame.world, side);
  const a = [hip.x - knee.x, hip.y - knee.y, hip.z - knee.z] as const;
  const b = [ankle.x - knee.x, ankle.y - knee.y, ankle.z - knee.z] as const;
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const lengths = Math.hypot(...a) * Math.hypot(...b);
  return lengths === 0 ? 180 : (Math.acos(Math.min(1, Math.max(-1, dot / lengths))) * 180) / Math.PI;
}

/** The style to ask strikes from: the whole style when the legs are in view, otherwise its hand strikes only. */
export function styleForLegs(style: FightingStyle, visible: boolean): FightingStyle {
  if (visible) return style;
  const [first, ...rest] = style.strikes.filter((id) => !KICK_IDS.includes(id));
  return first === undefined ? style : { ...style, strikes: [first, ...rest] };
}
