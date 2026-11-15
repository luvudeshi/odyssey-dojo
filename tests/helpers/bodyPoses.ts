// Made-up whole-body frames for the body-tracking tests and the browser capture. World landmarks are metres from the
// hips with y DOWN, the player's left at -x and the monster (the camera) at -z; image landmarks are 0..1 of the mirrored picture.
import type { Landmark, PoseFrame } from "../../src/core/types";

export type V3 = readonly [number, number, number];
export type Named = Partial<Record<LandmarkName, V3>>;

export const INDEX = {
  nose: 0, leftEar: 7, rightEar: 8, leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14, leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24, leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28,
} as const;
export type LandmarkName = keyof typeof INDEX;

/** Standing, arms down, the way a person faces a camera. */
export const STAND: Record<LandmarkName, V3> = {
  nose: [0, -0.68, -0.09], leftEar: [-0.08, -0.72, 0], rightEar: [0.08, -0.72, 0],
  leftShoulder: [-0.19, -0.5, 0], rightShoulder: [0.19, -0.5, 0],
  leftElbow: [-0.22, -0.2, 0], rightElbow: [0.22, -0.2, 0], leftWrist: [-0.22, 0.05, 0], rightWrist: [0.22, 0.05, 0],
  leftHip: [-0.1, 0, 0], rightHip: [0.1, 0, 0],
  leftKnee: [-0.12, 0.45, 0], rightKnee: [0.12, 0.45, 0], leftAnkle: [-0.12, 0.9, 0], rightAnkle: [0.12, 0.9, 0],
};

/** The upper body (shoulders, head, arms) turned `degrees` about the hips: positive leans to the player's right. */
export function leaned(degrees: number, base: Record<LandmarkName, V3> = STAND): Record<LandmarkName, V3> {
  const a = (degrees * Math.PI) / 180;
  const out = { ...base };
  for (const name of ["nose", "leftEar", "rightEar", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist"] as const) {
    const [x, y, z] = base[name];
    // World y is down, so a lean to the right moves the (negative-y) shoulders toward +x.
    out[name] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
  }
  return out;
}

/** The shoulders, head and arms turned `degrees` about the vertical axis against the hips (positive turns the chest to the player's right... toward -z on the left shoulder). */
export function twisted(degrees: number, base: Record<LandmarkName, V3> = STAND): Record<LandmarkName, V3> {
  const a = (degrees * Math.PI) / 180;
  const out = { ...base };
  for (const name of ["nose", "leftEar", "rightEar", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist"] as const) {
    const [x, y, z] = base[name];
    out[name] = [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
  }
  return out;
}

export const POSES: Record<string, Record<LandmarkName, V3>> = {
  armsOut: { ...STAND, leftElbow: [-0.49, -0.5, 0], rightElbow: [0.49, -0.5, 0], leftWrist: [-0.74, -0.5, 0], rightWrist: [0.74, -0.5, 0] },
  punchRight: { ...STAND, leftElbow: [-0.26, -0.3, -0.1], leftWrist: [-0.14, -0.62, -0.28], rightElbow: [0.2, -0.46, -0.3], rightWrist: [0.1, -0.58, -0.78] },
  guard: { ...STAND, leftElbow: [-0.26, -0.3, -0.1], rightElbow: [0.26, -0.3, -0.1], leftWrist: [-0.14, -0.62, -0.28], rightWrist: [0.14, -0.62, -0.28] },
  leanLeft: leaned(-20),
  leanRight: leaned(20),
  twistRight: twisted(30),
  squat: { ...STAND, leftKnee: [-0.14, 0.25, -0.35], rightKnee: [0.14, 0.25, -0.35], leftAnkle: [-0.14, 0.55, 0], rightAnkle: [0.14, 0.55, 0] },
};

/** A full frame. `image` shows the same body in a 4:3 picture, `shiftX` and `sinkY` move it in the picture (steps and ducks). */
export function frameOf(pose: Record<LandmarkName, V3>, t = 0, opts: { shiftX?: number; sinkY?: number; hidden?: readonly LandmarkName[] } = {}): PoseFrame {
  const world: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  const image: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  const perMetreX = 0.42;
  for (const [name, v] of Object.entries(pose) as [LandmarkName, V3][]) {
    const i = INDEX[name];
    const visibility = opts.hidden?.includes(name) ? 0.1 : 1;
    world[i] = { x: v[0], y: v[1], z: v[2], visibility };
    image[i] = { x: 0.5 + (opts.shiftX ?? 0) + v[0] * perMetreX, y: 0.65 + (opts.sinkY ?? 0) + v[1] * perMetreX * (4 / 3), z: 0, visibility };
  }
  return { t, world, image };
}
