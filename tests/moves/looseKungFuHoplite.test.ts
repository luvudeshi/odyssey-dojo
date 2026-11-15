// Kung fu, hoplite and pankration moves, asked for: a rough, small, slow version of each counts while its prompt is up
// and counts for nothing else (no ask, another move asked, wrong side or opposite direction, standing still).
import { expect, test } from "vitest";
import type { PoseFrame, PoseHistory } from "../../src/core/types";
import { ASK_GRACE_MS, createPoseInput } from "../../src/input/poseInput";
import { MOVES } from "../../src/moves/registry";
import { EMPTY_HISTORY, JOINT, pushFrame } from "../../src/pose/signals";
import { FRAME_MS, LEFT_OUT, READY, RIGHT_OUT, STANDING, blend, frameAt, pose, recording } from "../poseFixture";
import type { BodyPose } from "../poseFixture";
import { SEEDS, shaken } from "./looseMoves";

const J = JOINT;
const ASKED_AT = 20 * FRAME_MS + 600;

/** How many frames `ask` was struck, with the prompt up from ASKED_AT on. */
function struck(frames: readonly PoseFrame[], ask: string | null, id: string): number {
  const read = createPoseInput(MOVES);
  let history: PoseHistory = EMPTY_HISTORY;
  return frames.filter((frame) => {
    history = pushFrame(history, frame);
    return read(history, frame.t >= ASKED_AT ? ask : null).struck.some((s) => s.move === id);
  }).length;
}

/** The player waits in `from`, then eases to `to` over `ms` and holds there. */
const move = (from: BodyPose, to: BodyPose, ms = 450): PoseFrame[] =>
  recording([[from, 600], [from, 300], [to, ms], [to, 300]]);

const part = (from: BodyPose, to: BodyPose, share: number): BodyPose => blend(from, to, share);
const BOTH_OUT = pose({ ...LEFT_OUT, ...RIGHT_OUT }, READY);
const LEFT_UP = pose({ leftUpper: [-0.2, 0.3, -0.1], leftFore: [0.4, -1, 0] }, STANDING);
const RIGHT_UP = pose({ rightUpper: [0.2, 0.3, -0.1], rightFore: [-0.4, -1, 0] }, STANDING);
const BOTH_UP = pose({ leftUpper: LEFT_UP.leftUpper, leftFore: LEFT_UP.leftFore, rightUpper: RIGHT_UP.rightUpper, rightFore: RIGHT_UP.rightFore }, STANDING);
const LEFT_SIDE = pose({ leftUpper: [-1, 0.05, 0.1], leftFore: [-1, 0, 0.1] }, STANDING);
const LEFT_FRONT = pose({ leftUpper: [-0.5, 0.05, -0.85], leftFore: [-0.5, 0, -0.85] }, STANDING);

/** One move: a rough version that counts, and movements that must not. */
interface Case { readonly id: string; readonly counts: readonly PoseFrame[]; readonly not: Record<string, readonly PoseFrame[]> }

const cases: readonly Case[] = [
  { id: "double_palm", counts: move(READY, part(READY, BOTH_OUT, 0.4)),
    not: { "one arm only": move(READY, part(READY, pose(LEFT_OUT, READY), 0.4)), "both arms up": move(STANDING, part(STANDING, BOTH_UP, 0.6)), "both arms down": move(BOTH_UP, part(BOTH_UP, STANDING, 0.6)) } },
  { id: "chain_punch", counts: move(READY, part(READY, pose(RIGHT_OUT, READY), 0.4)),
    not: { "left arm raised": move(STANDING, part(STANDING, LEFT_UP, 0.6)), "right arm lowered": move(RIGHT_UP, part(RIGHT_UP, STANDING, 0.6)), "both arms out": move(READY, part(READY, BOTH_OUT, 0.4)) } },
  { id: "rising_palm", counts: move(STANDING, part(STANDING, LEFT_UP, 0.6)),
    not: { "right arm up": move(STANDING, part(STANDING, RIGHT_UP, 0.6)), "left arm down": move(LEFT_UP, part(LEFT_UP, STANDING, 0.6)), "left arm swept level to its side": move(LEFT_FRONT, LEFT_SIDE) } },
  { id: "spear_thrust", counts: move(READY, part(READY, BOTH_OUT, 0.4)),
    not: { "both arms up": move(STANDING, part(STANDING, BOTH_UP, 0.6)), "both arms down": move(BOTH_UP, part(BOTH_UP, STANDING, 0.6)) } },
  { id: "overhead_strike", counts: move(RIGHT_UP, part(RIGHT_UP, STANDING, 0.6)),
    not: { "left arm down": move(LEFT_UP, part(LEFT_UP, STANDING, 0.6)), "right arm up": move(STANDING, part(STANDING, RIGHT_UP, 0.6)) } },
  { id: "stake_thrust", counts: move(READY, part(READY, BOTH_OUT, 0.4)),
    not: { "one arm only": move(READY, part(READY, pose(RIGHT_OUT, READY), 0.4)), "both arms up": move(STANDING, part(STANDING, BOTH_UP, 0.6)) } },
];

for (const { id, counts, not } of cases) {
  test(`${id}: a rough, small, slow version counts when asked (a), not otherwise (b)`, () => {
    expect(struck(counts, id, id)).toBeGreaterThan(0);
    expect(struck(counts, null, id)).toBe(0);
    expect(struck(counts, id === "jab" ? "cross" : "block", id)).toBe(0);
  });
  for (const [name, frames] of Object.entries(not)) {
    test(`${id}: ${name} does not count when asked (c)`, () => {
      expect(struck(frames, id, id)).toBe(0);
    });
  }
}

test("the stake thrust also counts both hands driven down together", () => {
  expect(struck(move(BOTH_UP, part(BOTH_UP, STANDING, 0.6)), "stake_thrust", "stake_thrust")).toBeGreaterThan(0);
});

test("the spear thrust also counts one arm out; the chain punch counts either arm", () => {
  expect(struck(move(READY, part(READY, pose(LEFT_OUT, READY), 0.4)), "spear_thrust", "spear_thrust")).toBeGreaterThan(0);
  expect(struck(move(READY, part(READY, pose(LEFT_OUT, READY), 0.4)), "chain_punch", "chain_punch")).toBeGreaterThan(0);
});

// Legs: a frame with both knees and ankles in view, the right leg in `shape` and the left standing.
type Shape = readonly [kneeY: number, ankleY: number];
const DOWN: Shape = [0.8, 0.95];
const KNEE_UP: Shape = [0.62, 0.78];
const legs = (t: number, left: Shape, right: Shape): PoseFrame =>
  frameAt(t, {
    [J.leftKnee]: [0.45, left[0]], [J.leftAnkle]: [0.45, left[1]],
    [J.rightKnee]: [0.55, right[0]], [J.rightAnkle]: [0.55, right[1]],
  });
const lerp = (a: Shape, b: Shape, share: number): Shape => [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share];

/** Baseline, a wait, then the legs ease from `from` to `to` (each [left, right]) over 450 ms and hold. */
function legMove(from: readonly [Shape, Shape], to: readonly [Shape, Shape]): PoseFrame[] {
  const out: PoseFrame[] = [];
  let t = 0;
  const push = (l: Shape, r: Shape): void => { out.push(legs(t, l, r)); t += FRAME_MS; };
  for (let i = 0; i < 20 + 28; i++) push(...from);
  for (let i = 1; i <= 14; i++) push(lerp(from[0], to[0], i / 14), lerp(from[1], to[1], i / 14));
  for (let i = 0; i < 10; i++) push(...to);
  return out;
}

for (const id of ["front_kick", "knee"]) {
  const rise = legMove([DOWN, DOWN], [DOWN, lerp(DOWN, KNEE_UP, 0.5)]);
  test(`${id}: a small slow leg lift counts when asked (a), on either leg, and not otherwise (b)`, () => {
    expect(struck(rise, id, id)).toBeGreaterThan(0);
    expect(struck(legMove([DOWN, DOWN], [lerp(DOWN, KNEE_UP, 0.5), DOWN]), id, id)).toBeGreaterThan(0);
    expect(struck(rise, null, id)).toBe(0);
    expect(struck(rise, id === "knee" ? "block" : "jab", id)).toBe(0);
  });
  test(`${id}: both legs rising together (a jump) and legs out of view do not count (c)`, () => {
    expect(struck(legMove([DOWN, DOWN], [lerp(DOWN, KNEE_UP, 0.5), lerp(DOWN, KNEE_UP, 0.5)]), id, id)).toBe(0);
    const unseen = rise.map((f): PoseFrame => ({ ...f, image: f.image.map((p, i) => (i === J.rightAnkle ? { ...p, visibility: 0.2 } : p)) }));
    expect(struck(unseen, id, id)).toBe(0);
  });
}

test.each(SEEDS)("seed %i: standing still with every joint shaking randomly by a tenth of a shoulder width strikes nothing on any of these prompts (d)", (seed) => {
  const still: readonly (readonly [string, PoseFrame[]])[] = [
    ["arms", shaken(recording([[READY, 33], [READY, 3000]]), seed, 0.1, null)],
    ["hanging", shaken(recording([[STANDING, 33], [STANDING, 3000]]), seed, 0.1, null)],
    ["legs", shaken(legMove([DOWN, DOWN], [DOWN, DOWN]), seed, 0.1, null)],
  ];
  for (const { id } of cases) for (const [, frames] of still) expect(struck(frames, id, id)).toBe(0);
  for (const id of ["front_kick", "knee"]) for (const [, frames] of still) expect(struck(frames, id, id)).toBe(0);
  expect(ASK_GRACE_MS).toBe(250);
});
