// The cameras the lenient-move tests replay every move on: a clear one, and a weak one that sees only from the
// waist up, at the smallest and largest shoulder widths a webcam gives. Also `partWay`, for a move done short.
import type { PoseFrame } from "../../src/core/types";
import { JOINT } from "../../src/pose/signals";
import { body, frameOn, shouldersAt } from "./anyBody";
import type { Arm } from "./poses";

const J = JOINT;
const ARM_JOINTS = [J.leftElbow, J.rightElbow, J.leftWrist, J.rightWrist];
const LOWER_JOINTS = [J.leftHip, J.rightHip, J.leftKnee, J.rightKnee, J.leftAnkle, J.rightAnkle];

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Part of the way from one arm to another, in the picture and in the world. */
export function partWay(from: Arm, to: Arm, k: number): Arm {
  const two = (a: Arm["elbow"], b: Arm["elbow"]) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)] as const;
  const three = (a: Arm["elbow3"], b: Arm["elbow3"]) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)] as const;
  return {
    elbow: two(from.elbow, to.elbow), wrist: two(from.wrist, to.wrist),
    elbow3: three(from.elbow3, to.elbow3), wrist3: three(from.wrist3, to.wrist3),
  };
}

/** The same frames as a weak camera sees them: arm joints at visibility 0.35, and nothing below the waist. */
export function waistUp(frames: readonly PoseFrame[]): PoseFrame[] {
  const seen = (index: number, visibility: number): number => {
    if (ARM_JOINTS.includes(index)) return 0.35;
    if (LOWER_JOINTS.includes(index)) return 0;
    return visibility;
  };
  return frames.map((frame) => ({
    ...frame,
    image: frame.image.map((point, index) => ({ ...point, visibility: seen(index, point.visibility) })),
    world: frame.world.map((point, index) => ({ ...point, visibility: seen(index, point.visibility) })),
  }));
}

export interface Camera {
  readonly name: string;
  see(frames: readonly PoseFrame[]): PoseFrame[];
}

const at = (share: number) => body(`shoulders ${String(share)}`, { zoom: shouldersAt(share) });

export const CAMERAS: readonly Camera[] = [
  { name: "clear, shoulders 0.16 of the frame", see: (frames) => [...frames] },
  { name: "waist-up, shoulders 0.15", see: (frames) => waistUp(frames).map((frame) => frameOn(at(0.15), frame)) },
  { name: "waist-up, shoulders 0.6", see: (frames) => waistUp(frames).map((frame) => frameOn(at(0.6), frame)) },
];
