// One clean, rough, small and slow movement per prompted move, shared by the overlap and MISS tests.
import type { MoveDef, PoseFrame, PoseHistory } from "../../src/core/types";
import { createPoseInput } from "../../src/input/poseInput";
import { createMissWatch } from "../../src/input/missWatch";
import { MOVES } from "../../src/moves/registry";
import { EXTRA_MOVES } from "../../src/coach/extra";
import { EMPTY_HISTORY, JOINT, pushFrame } from "../../src/pose/signals";
import { FRAME_MS, LEFT_OUT, READY, RIGHT_OUT, STANDING, blend, frameAt, pose, recording } from "../poseFixture";
import type { BodyPose } from "../poseFixture";

const J = JOINT;
export const ASKED_AT = 20 * FRAME_MS + 900;
const ALL: ReadonlyMap<string, MoveDef> = new Map([...MOVES.values(), ...EXTRA_MOVES].map((m) => [m.id, m]));

export interface Seen { readonly struck: ReadonlySet<string>; readonly held: ReadonlySet<string>; readonly misses: number }

/** The prompt asks for `ask` from ASKED_AT on. Reports every move struck or held and how many MISS flashes fired. */
export function watch(frames: readonly PoseFrame[], ask: string | null, defend = false): Seen {
  const read = createPoseInput(ALL);
  const miss = createMissWatch();
  let history: PoseHistory = EMPTY_HISTORY;
  const struck = new Set<string>();
  const held = new Set<string>();
  let misses = 0;
  for (const frame of frames) {
    history = pushFrame(history, frame);
    const asked = frame.t >= ASKED_AT ? ask : null;
    const input = read(history, asked);
    input.struck.forEach((s) => struck.add(s.move));
    input.held.forEach((h) => held.add(h));
    if (miss(asked, defend, input, false, frame.t)) misses += 1;
  }
  return { struck, held, misses };
}

/** Did the prompt `ask` count: struck for a strike, held for a defend. */
export const counted = (seen: Seen, ask: string): boolean => seen.struck.has(ask) || seen.held.has(ask);

const move = (from: BodyPose, to: BodyPose, share: number, ms = 500): PoseFrame[] => {
  const end = blend(from, to, share);
  return recording([[from, 900], [from, 300], [end, ms], [end, 400]]);
};

const up = (side: "left" | "right"): Partial<BodyPose> => side === "left"
  ? { leftUpper: [-0.2, 0.3, -0.1], leftFore: [0.4, -1, 0] } : { rightUpper: [0.2, 0.3, -0.1], rightFore: [-0.4, -1, 0] };
export const BOTH_OUT = pose({ ...LEFT_OUT, ...RIGHT_OUT }, READY);
export const BOTH_UP = pose({ ...up("left"), ...up("right") }, STANDING);
const RIGHT_UP = pose(up("right"), STANDING);
const RIGHT_ACROSS = pose({ rightUpper: [-0.2, 0.5, -0.5], rightFore: [-1, -0.1, -0.2] }, READY);
const RIGHT_SIDE = pose({ rightUpper: [1, 0.1, 0], rightFore: [1, 0, 0] }, READY);
const RIGHT_RISE = pose({ rightUpper: [0.2, 0.3, 0], rightFore: [-0.2, -1, 0] }, READY);
const LEFT_DROP = pose({ leftUpper: [-0.07, 1, 0], leftFore: [0, 1, 0] }, READY);

type Shape = readonly [kneeY: number, ankleY: number];
const DOWN: Shape = [0.8, 0.95];
const KNEE_UP: Shape = [0.62, 0.78];
const lerp = (a: Shape, b: Shape, s: number): Shape => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
const legs = (t: number, left: Shape, right: Shape): PoseFrame => frameAt(t, {
  [J.leftKnee]: [0.45, left[0]], [J.leftAnkle]: [0.45, left[1]], [J.rightKnee]: [0.55, right[0]], [J.rightAnkle]: [0.55, right[1]],
});
/** The right leg lifted half way to a knee-up, from a standing frame. */
function legLift(): PoseFrame[] {
  const out: PoseFrame[] = [];
  const at = (right: Shape): void => { out.push(legs(out.length * FRAME_MS, DOWN, right)); };
  for (let i = 0; i < 72; i++) at(DOWN);
  for (let i = 1; i <= 14; i++) at(lerp(DOWN, KNEE_UP, 0.5 * (i / 14)));
  for (let i = 0; i < 10; i++) at(lerp(DOWN, KNEE_UP, 0.5));
  return out;
}

/** One rough movement for each strike and each defend that can be a prompt. */
export const MOVEMENTS: Readonly<Record<string, readonly PoseFrame[]>> = {
  jab: move(READY, pose(LEFT_OUT, READY), 0.4),
  cross: move(READY, pose(RIGHT_OUT, READY), 0.4),
  reverse_punch: move(READY, pose(RIGHT_OUT, READY), 0.4),
  hook: move(READY, RIGHT_ACROSS, 0.6),
  uppercut: move(READY, RIGHT_RISE, 0.75),
  knife_hand: move(READY, RIGHT_SIDE, 0.4),
  hammer_fist: move(READY, LEFT_DROP, 0.6),
  double_palm: move(READY, BOTH_OUT, 0.4),
  chain_punch: move(READY, pose(RIGHT_OUT, READY), 0.4),
  spear_thrust: move(READY, BOTH_OUT, 0.4),
  stake_thrust: move(READY, BOTH_OUT, 0.4),
  rising_palm: move(STANDING, pose(up("left"), STANDING), 0.6),
  overhead_strike: move(RIGHT_UP, STANDING, 0.6),
  front_kick: legLift(),
  knee: legLift(),
  block: move(STANDING, BOTH_UP, 1),
  // A third of the full movement, from calibrated standing, so the strict detectors stay near their thresholds.
  duck: move(STANDING, pose({ drop: 0.15 }), 1),
  dodge_left: move(STANDING, pose({ step: -0.15 }), 1),
  dodge_right: move(STANDING, pose({ step: 0.15 }), 1),
  jump: move(STANDING, pose({ drop: -0.15 }), 1),
};

/** A seeded linear congruential generator, uniform in [-1, 1). Never Math.random, so a failure replays. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 2 ** 32) * 2 - 1;
  };
}

export const ARM_JOINTS: readonly number[] = [J.leftShoulder, J.rightShoulder, J.leftElbow, J.rightElbow, J.leftWrist, J.rightWrist];
/** One shoulder width in the fixtures' picture and in their 3D body (metres). */
const SHOULDER_IMAGE = 0.16;
const SHOULDER_WORLD = 0.4;

/** Random per-frame shake of up to `spread` shoulder widths per axis on `joints` (the shoulders, elbows and wrists by default; null for every joint), in the picture and in 3D. */
export function shaken(frames: readonly PoseFrame[], seed: number, spread: number, joints: readonly number[] | null = ARM_JOINTS): PoseFrame[] {
  const next = lcg(seed);
  const hit = (k: number): boolean => joints === null || joints.includes(k);
  return frames.map((frame): PoseFrame => ({
    ...frame,
    image: frame.image.map((p, k) => (hit(k) ? { ...p, x: p.x + next() * spread * SHOULDER_IMAGE, y: p.y + next() * spread * SHOULDER_IMAGE } : p)),
    world: frame.world.map((p, k) => (hit(k) ? { ...p, x: p.x + next() * spread * SHOULDER_WORLD, y: p.y + next() * spread * SHOULDER_WORLD, z: p.z + next() * spread * SHOULDER_WORLD } : p)),
  }));
}

/** Seeds for the random-shake tests. */
export const SEEDS: readonly number[] = [1, 2, 3, 4, 5];
