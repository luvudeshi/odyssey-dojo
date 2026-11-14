// Builds fake pose frames for detector tests: a person standing with arms down, plus overrides.
import type { Landmark, PoseFrame } from "../src/core/types";
import { JOINT } from "../src/pose/signals";
import { createPoseInput } from "../src/input/poseInput";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../src/pose/signals";

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

export type Vec3 = readonly [number, number, number];

/** A whole-body pose for detector tests: which way each arm bone points, and how far the body is from where it started. */
export interface BodyPose {
  /** Directions in world axes (x to the player's right, y down, z negative toward the camera). Any length. */
  readonly leftUpper: Vec3;
  readonly leftFore: Vec3;
  readonly rightUpper: Vec3;
  readonly rightFore: Vec3;
  /** Metres the whole body has stepped to the player's right. Moves the picture only: world points hang off the hips. */
  readonly step: number;
  /** Metres the whole body has sunk on bent knees. Moves the picture only. */
  readonly drop: number;
  /** Metres the shoulders, head and arms lean to the player's right of the hips. */
  readonly lean: number;
}

/** A pose to move to, and how many milliseconds the move takes. The same pose again is a hold. */
export type Step = readonly [BodyPose, number];

export const FRAME_MS = 33;
const UPPER_ARM = 0.3;
const FOREARM = 0.25;
/** How much of the picture one metre covers, across and down, on a wide webcam at fighting distance. */
const PICTURE_X = 0.4;
const PICTURE_Y = 0.6;

/** Arms hanging at the sides: the same person `frameAt` draws. */
export const STANDING: BodyPose = {
  leftUpper: [-0.07, 1, 0], leftFore: [0, 1, 0],
  rightUpper: [0.07, 1, 0], rightFore: [0, 1, 0],
  step: 0, drop: 0, lean: 0,
};

/** `base` (standing, if left out) with some parts changed. */
export function pose(changes: Partial<BodyPose>, base: BodyPose = STANDING): BodyPose {
  return { ...base, ...changes };
}

function along(from: Vec3, direction: Vec3, length: number): Vec3 {
  const scale = length / (Math.hypot(...direction) || 1);
  return [from[0] + direction[0] * scale, from[1] + direction[1] * scale, from[2] + direction[2] * scale];
}

/** One frame of a body pose. The picture is drawn from the world points, so the two always agree. */
export function bodyFrame(t: number, body: BodyPose): PoseFrame {
  const leftShoulder: Vec3 = [-0.2 + body.lean, -0.5, 0];
  const rightShoulder: Vec3 = [0.2 + body.lean, -0.5, 0];
  const leftElbow = along(leftShoulder, body.leftUpper, UPPER_ARM);
  const rightElbow = along(rightShoulder, body.rightUpper, UPPER_ARM);
  const world: Record<number, Vec3> = {
    [J.nose]: [body.lean * 1.2, -0.75, -0.05],
    [J.leftShoulder]: leftShoulder, [J.rightShoulder]: rightShoulder,
    [J.leftElbow]: leftElbow, [J.rightElbow]: rightElbow,
    [J.leftWrist]: along(leftElbow, body.leftFore, FOREARM), [J.rightWrist]: along(rightElbow, body.rightFore, FOREARM),
    [J.leftHip]: [-0.125, 0, 0], [J.rightHip]: [0.125, 0, 0],
  };
  const image: Record<number, readonly [number, number]> = {};
  for (const [index, point] of Object.entries(world)) {
    image[Number(index)] = [0.5 + (point[0] + body.step) * PICTURE_X, 0.65 + (point[1] + body.drop) * PICTURE_Y];
  }
  return frameAt(t, image, world);
}

/** Turns direction `a` toward direction `b` at a steady rate, the way a joint swings, and returns a unit vector. */
function turn(a: Vec3, b: Vec3, share: number): Vec3 {
  const from = along([0, 0, 0], a, 1);
  const to = along([0, 0, 0], b, 1);
  const angle = Math.acos(Math.min(1, Math.max(-1, from[0] * to[0] + from[1] * to[1] + from[2] * to[2])));
  const sine = Math.sin(angle);
  if (sine < 1e-6) return to;
  const keep = Math.sin((1 - share) * angle) / sine;
  const gain = Math.sin(share * angle) / sine;
  return [from[0] * keep + to[0] * gain, from[1] * keep + to[1] * gain, from[2] * keep + to[2] * gain];
}

/** The pose `share` of the way from `a` to `b`. Bones only change direction, so they keep their length. */
export function blend(a: BodyPose, b: BodyPose, share: number): BodyPose {
  return {
    leftUpper: turn(a.leftUpper, b.leftUpper, share), leftFore: turn(a.leftFore, b.leftFore, share),
    rightUpper: turn(a.rightUpper, b.rightUpper, share), rightFore: turn(a.rightFore, b.rightFore, share),
    step: a.step + (b.step - a.step) * share,
    drop: a.drop + (b.drop - a.drop) * share,
    lean: a.lean + (b.lean - a.lean) * share,
  };
}

/** A 30 frames per second recording: the 20 still frames the game takes its baseline from, then each step in turn. */
export function recording(steps: readonly Step[]): PoseFrame[] {
  const poses: BodyPose[] = Array.from({ length: 20 }, () => STANDING);
  let from = STANDING;
  for (const [to, ms] of steps) {
    const count = Math.max(1, Math.round(ms / FRAME_MS));
    for (let i = 1; i <= count; i++) poses.push(blend(from, to, i / count));
    from = to;
  }
  return poses.map((body, index) => bodyFrame(index * FRAME_MS, body));
}

/** Hands up at the chest with the elbows bent: where a player waits between moves. */
export const READY: BodyPose = pose({
  leftUpper: [-0.05, 0.28, -0.05], leftFore: [0.15, -0.18, -0.17],
  rightUpper: [0.05, 0.28, -0.05], rightFore: [-0.15, -0.18, -0.17],
});

/** One arm punched straight at the camera at shoulder height. Pass to `pose` to change that arm only. */
export const LEFT_OUT = { leftUpper: [0.1, 0.05, -1], leftFore: [0.1, 0, -1] } as const;
export const RIGHT_OUT = { rightUpper: [-0.1, 0.05, -1], rightFore: [-0.1, 0, -1] } as const;

/** The nine moves every style shares. Detector tests leave out any move added since. */
export const BASE_MOVES: readonly string[] = [
  "block", "duck", "dodge_left", "dodge_right", "jab", "cross", "hook", "overhead_strike", "spear_thrust",
];

/** What the pose input reported for the base moves on one frame. */
export interface Reading {
  readonly t: number;
  readonly held: readonly string[];
  readonly struck: readonly string[];
}

/** Feeds a recording to the pose input one frame at a time, the way the fight screen does. */
export function play(frames: readonly PoseFrame[]): Reading[] {
  const read = createPoseInput(MOVES);
  let history = EMPTY_HISTORY;
  return frames.map((frame) => {
    history = pushFrame(history, frame);
    const input = read(history);
    return {
      t: frame.t,
      held: BASE_MOVES.filter((id) => input.held.has(id)),
      struck: input.struck.map((strike) => strike.move).filter((id) => BASE_MOVES.includes(id)),
    };
  });
}

/** How many times a strike was thrown over a recording. */
export function thrown(readings: readonly Reading[], move: string): number {
  return readings.flatMap((reading) => reading.struck).filter((id) => id === move).length;
}

/** The longest unbroken stretch a defense was held for, in milliseconds. */
export function longestHold(readings: readonly Reading[], move: string): number {
  let run = 0;
  let longest = 0;
  for (const reading of readings) {
    run = reading.held.includes(move) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest * FRAME_MS;
}

/** Every base move other than `move` that was held or thrown at any point, in alphabetical order. */
export function others(readings: readonly Reading[], move: string): string[] {
  const seen = new Set(readings.flatMap((reading) => [...reading.held, ...reading.struck]));
  seen.delete(move);
  return [...seen].sort();
}
