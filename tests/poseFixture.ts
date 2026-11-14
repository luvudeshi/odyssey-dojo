// Builds fake pose frames for detector tests: a person standing with arms down, plus overrides.
import type { Landmark, PoseFrame } from "../src/core/types";
import { JOINT } from "../src/pose/signals";

const J = JOINT;
const IMAGE: Record<number, readonly [number, number]> = {
  [J.nose]: [0.5, 0.2],
  [J.leftShoulder]: [0.42, 0.35], [J.rightShoulder]: [0.58, 0.35],
  [J.leftElbow]: [0.4, 0.5], [J.rightElbow]: [0.6, 0.5],
  [J.leftWrist]: [0.4, 0.62], [J.rightWrist]: [0.6, 0.62],
  [J.leftHip]: [0.45, 0.65], [J.rightHip]: [0.55, 0.65],
};
const WORLD: Record<number, readonly [number, number, number]> = {
  [J.leftShoulder]: [-0.2, -0.5, 0], [J.rightShoulder]: [0.2, -0.5, 0],
  [J.leftElbow]: [-0.22, -0.2, 0], [J.rightElbow]: [0.22, -0.2, 0],
  [J.leftWrist]: [-0.22, 0.05, 0], [J.rightWrist]: [0.22, 0.05, 0],
};

function fill(points: Record<number, readonly number[]>): Landmark[] {
  return Array.from({ length: 33 }, (_, index) => {
    const point = points[index];
    return { x: point?.[0] ?? 0, y: point?.[1] ?? 0, z: point?.[2] ?? 0, visibility: 1 };
  });
}

export function frameAt(
  t: number,
  image: Record<number, readonly [number, number]> = {},
  world: Record<number, readonly [number, number, number]> = {},
): PoseFrame {
  return { t, image: fill({ ...IMAGE, ...image }), world: fill({ ...WORLD, ...world }) };
}
