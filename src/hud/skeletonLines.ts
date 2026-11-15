// The tracked skeleton as canvas lines and dots. Pure: landmarks in, pixel positions out.
import type { Landmark } from "../core/types";
import { JOINT } from "../pose/signals";

const J = JOINT;
/** Same bones as the code-built figure (src/render/PlayerFigure.tsx); the head is the nose dot plus a neck line. */
const BONES: readonly (readonly [number, number])[] = [
  [J.leftShoulder, J.rightShoulder], [J.leftShoulder, J.leftElbow], [J.leftElbow, J.leftWrist],
  [J.rightShoulder, J.rightElbow], [J.rightElbow, J.rightWrist], [J.leftShoulder, J.leftHip],
  [J.rightShoulder, J.rightHip], [J.leftHip, J.rightHip], [J.leftHip, J.leftKnee],
  [J.leftKnee, J.leftAnkle], [J.rightHip, J.rightKnee], [J.rightKnee, J.rightAnkle],
];
/** BONES from this index on are the four leg bones. */
const FIRST_LEG_BONE = 8;
const DOT_JOINTS: readonly number[] = [
  J.nose, J.leftShoulder, J.rightShoulder, J.leftElbow, J.rightElbow, J.leftWrist, J.rightWrist,
  J.leftHip, J.rightHip, J.leftKnee, J.rightKnee, J.leftAnkle, J.rightAnkle,
];
export const FAINT_BELOW = 0.5;

export interface Point { readonly x: number; readonly y: number; readonly faint: boolean }
export interface Segment { readonly from: Point; readonly to: Point; readonly faint: boolean }
export interface Skeleton { readonly lines: readonly Segment[]; readonly dots: readonly Point[] }

/**
 * PoseFrame.image is already mirrored (the player's left is screen left). A mirrored video matches it as it is;
 * an unmirrored video shows the raw picture, so x flips back.
 */
export function skeletonLines(image: readonly Landmark[], mirror: boolean, width: number, height: number): Skeleton {
  const at = (index: number): Point | null => {
    const landmark = image[index];
    if (!landmark) return null;
    return { x: (mirror ? landmark.x : 1 - landmark.x) * width, y: landmark.y * height, faint: landmark.visibility < FAINT_BELOW };
  };
  const lines: Segment[] = [];
  for (const [i, [a, b]] of BONES.entries()) {
    const from = at(a);
    const to = at(b);
    if (!from || !to) continue;
    // Legs are often out of frame; a faint guess there reads as noise, so skip the line.
    if (i >= FIRST_LEG_BONE && (from.faint || to.faint)) continue;
    lines.push({ from, to, faint: from.faint || to.faint });
  }
  const nose = at(J.nose);
  const left = at(J.leftShoulder);
  const right = at(J.rightShoulder);
  if (nose && left && right) {
    const neck: Point = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, faint: left.faint || right.faint };
    lines.push({ from: nose, to: neck, faint: nose.faint || neck.faint });
  }
  const dots = DOT_JOINTS.flatMap((index) => at(index) ?? []);
  return { lines, dots };
}

export interface Spot { readonly x: number; readonly y: number }

/** Centres of stones laid along a bone, one every `step` pixels, the two ends left to the joint stones. */
export function stonesAlong(from: Spot, to: Spot, step: number): Spot[] {
  const count = Math.max(1, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / step));
  return Array.from({ length: count - 1 }, (_, i) => {
    const t = (i + 1) / count;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });
}

/** A round cluster of stones for the head: a centre stone, a ring of six, and a ring of twelve when the head is big enough. */
export function headStones(centre: Spot, radius: number, stone: number): Spot[] {
  const rings: [number, number][] = [[1.9 * stone, 6]];
  if (radius > 3.4 * stone) rings.push([3.8 * stone, 12]);
  return [centre, ...rings.flatMap(([ring, n]) => Array.from({ length: n }, (_, i) => ({ x: centre.x + Math.cos((i / n) * Math.PI * 2) * ring, y: centre.y + Math.sin((i / n) * Math.PI * 2) * ring })))];
}
