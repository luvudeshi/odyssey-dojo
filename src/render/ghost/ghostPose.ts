// Pure maths for the move ghost: a move's prompt-card diagram (arm and leg points in a 100x100 box, y down) becomes
// joint positions in metres for a figure that stands on the floor, and a live webcam frame is scored against it.
import { promptLevel } from "../../combat/engine";
import type { Baseline, CombatPhase, MoveDiagram, PoseFrame } from "../../core/types";
import { JOINT, clamp01, joint, shoulderCenter, shoulderWidth } from "../../pose/signals";

export type Vec3 = readonly [number, number, number];
type Pt = readonly [number, number];

export interface GhostJoints {
  readonly head: Vec3;
  readonly leftShoulder: Vec3; readonly rightShoulder: Vec3;
  readonly leftElbow: Vec3; readonly rightElbow: Vec3;
  readonly leftWrist: Vec3; readonly rightWrist: Vec3;
  readonly leftHip: Vec3; readonly rightHip: Vec3;
  readonly leftKnee: Vec3; readonly rightKnee: Vec3;
  readonly leftFoot: Vec3; readonly rightFoot: Vec3;
}

/** Metres per diagram unit: the diagram's arms are drawn short, so this makes a straight arm about 0.7 m. */
const UNIT = 0.028;
const SHOULDER_HALF = 0.2;
const SHOULDER_Y = 1.42;
const HIP_Y = 0.95;
const HIP_HALF = 0.1;
const HEAD_Y = 1.64;
/** Lean and crouch in metres per unit of the diagram's shiftX / shiftY. */
const LEAN = 0.025;
const CROUCH = 0.025;
/** A shoulder shift of this many shoulder widths is the full dodge or duck (what the detectors use), for SHIFT_UNITS. */
const FULL_SHIFT = 0.6;
const SHIFT_UNITS = 14;
const SHOULDER_BOX: { readonly left: Pt; readonly right: Pt } = { left: [38, 32], right: [62, 32] };
const HIP_BOX: Pt = [50, 62];

function arm(shoulder: Vec3, box: Pt, point: Pt): Vec3 {
  return [shoulder[0] + (point[0] - box[0]) * UNIT, shoulder[1] - (point[1] - box[1]) * UNIT, shoulder[2]];
}

/** A raised leg: the diagram's sideways reach from the hip is how far forward (towards the monster) the point goes. */
function raised(hip: Vec3, point: Pt): Vec3 {
  return [hip[0], hip[1] - (point[1] - HIP_BOX[1]) * UNIT, hip[2] - (point[0] - HIP_BOX[0]) * UNIT];
}

/** The target pose as joint positions: x right of the player, y up from the floor, z towards the camera. Feet at y 0. */
export function ghostJoints(diagram: MoveDiagram): GhostJoints {
  const lean = (diagram.shiftX ?? 0) * LEAN;
  const drop = -(diagram.shiftY ?? 0) * CROUCH;
  const leftShoulder: Vec3 = [-SHOULDER_HALF + lean, SHOULDER_Y + drop, 0];
  const rightShoulder: Vec3 = [SHOULDER_HALF + lean, SHOULDER_Y + drop, 0];
  const leftHip: Vec3 = [-HIP_HALF + lean / 2, HIP_Y + drop * 0.6, 0];
  const rightHip: Vec3 = [HIP_HALF + lean / 2, HIP_Y + drop * 0.6, 0];
  // Planted feet stay under the hips' resting place; a jump (drop > 0) lifts them with the body.
  const legOf = (hip: Vec3, knee: Pt | undefined, foot: Pt | undefined): { knee: Vec3; foot: Vec3 } => {
    const footAt: Vec3 = foot ? raised(hip, foot) : [hip[0] - lean / 2, Math.max(drop, 0), hip[2]];
    const kneeAt: Vec3 = knee ? raised(hip, knee) : [(hip[0] + footAt[0]) / 2, (hip[1] + footAt[1]) / 2, (hip[2] + footAt[2]) / 2];
    return { knee: kneeAt, foot: footAt };
  };
  const left = legOf(leftHip, diagram.leftKnee, diagram.leftFoot);
  const right = legOf(rightHip, diagram.rightKnee, diagram.rightFoot);
  return {
    head: [lean, HEAD_Y + drop, 0],
    leftShoulder, rightShoulder,
    leftElbow: arm(leftShoulder, SHOULDER_BOX.left, diagram.leftElbow),
    leftWrist: arm(leftShoulder, SHOULDER_BOX.left, diagram.leftWrist),
    rightElbow: arm(rightShoulder, SHOULDER_BOX.right, diagram.rightElbow),
    rightWrist: arm(rightShoulder, SHOULDER_BOX.right, diagram.rightWrist),
    leftHip, rightHip, leftKnee: left.knee, rightKnee: right.knee, leftFoot: left.foot, rightFoot: right.foot,
  };
}

/** The id of the move the current phase is asking for, or null outside a prompt. */
export function promptedMove(phase: CombatPhase | undefined): string | null {
  if (!phase) return null;
  if (phase.kind === "defend") return phase.attack.counter;
  if (phase.kind === "strike" || phase.kind === "finisher") return phase.move;
  return null;
}

/** How visible the ghost is with no webcam, by how well the move is learned (the same steps as the prompt card). */
const BASE_OPACITY = { full: 0.5, word: 0.32, glow: 0.18 } as const;
const BRIGHT_OPACITY = 0.9;

/** Closeness 0..1 lifts the ghost from its base opacity to BRIGHT_OPACITY. Null (keyboard, no live pose) leaves the base. */
export function ghostOpacity(successes: number, closeness: number | null): number {
  const base = BASE_OPACITY[promptLevel(successes)];
  return closeness === null ? base : base + (BRIGHT_OPACITY - base) * clamp01(closeness);
}

/**
 * How near a live webcam frame is to the ghost's pose: 1 is on it, 0 is far off. Elbows and wrists are compared in
 * shoulder widths from the shoulders' centre; a dodge or duck also compares how far the shoulders moved from `baseline`.
 */
export function ghostCloseness(frame: PoseFrame, diagram: MoveDiagram, baseline: Baseline | null): number {
  const width = shoulderWidth(frame);
  if (width < 1e-4) return 0;
  const center = shoulderCenter(frame);
  const toWidths = (units: number): number => (units * UNIT) / (SHOULDER_HALF * 2);
  const pairs: readonly (readonly [number, Pt, Pt])[] = [
    [JOINT.leftElbow, SHOULDER_BOX.left, diagram.leftElbow], [JOINT.leftWrist, SHOULDER_BOX.left, diagram.leftWrist],
    [JOINT.rightElbow, SHOULDER_BOX.right, diagram.rightElbow], [JOINT.rightWrist, SHOULDER_BOX.right, diagram.rightWrist],
  ];
  let total = 0;
  for (const [index, box, target] of pairs) {
    const point = joint(frame.image, index);
    const wantX = (box[0] < 50 ? -0.5 : 0.5) + toWidths(target[0] - box[0]);
    const wantY = toWidths(target[1] - box[1]);
    total += Math.hypot((point.x - center.x) / width - wantX, (point.y - center.y) / width - wantY);
  }
  let error = total / pairs.length;
  const shiftX = diagram.shiftX ?? 0;
  const shiftY = diagram.shiftY ?? 0;
  if (baseline && (shiftX !== 0 || shiftY !== 0)) {
    const dx = (center.x - baseline.centerX) / baseline.shoulderWidth;
    const dy = (center.y - baseline.shoulderY) / baseline.shoulderWidth;
    const shift = Math.hypot(dx - (shiftX / SHIFT_UNITS) * FULL_SHIFT, dy - (shiftY / SHIFT_UNITS) * FULL_SHIFT);
    error = (error + shift * 2) / 2;
  }
  return clamp01(1 - error);
}
