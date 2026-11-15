// Defends and Dojo-only moves, asked for: while the prompt is the move, the right limb or body going roughly the right
// way counts, however small and slow. With no prompt, or another move's, the strict detectors stay as they were.
import { expect, test } from "vitest";
import type { MoveDef, PoseFrame, PoseHistory } from "../../src/core/types";
import { createPoseInput } from "../../src/input/poseInput";
import { createMissWatch } from "../../src/input/missWatch";
import { MOVES } from "../../src/moves/registry";
import { EXTRA_MOVES } from "../../src/coach/extra";
import { EMPTY_HISTORY, JOINT, pushFrame } from "../../src/pose/signals";
import { STANDING, blend, pose, recording } from "../poseFixture";
import type { BodyPose, Step } from "../poseFixture";

const ALL: ReadonlyMap<string, MoveDef> = new Map([...MOVES.values(), ...EXTRA_MOVES].map((m) => [m.id, m]));

interface Seen { readonly held: boolean; readonly struck: boolean; readonly miss: boolean }

/** The prompt asks for `ask` from 900 ms in (after the 20 calibration frames), as the fight does. */
const ASKED_AT = 20 * 33 + 900;
function run(frames: readonly PoseFrame[], ask: string | null, move: string): Seen[] {
  const read = createPoseInput(ALL);
  const watch = createMissWatch();
  let history: PoseHistory = EMPTY_HISTORY;
  return frames.map((frame) => {
    history = pushFrame(history, frame);
    const asked = frame.t >= ASKED_AT ? ask : null;
    const input = read(history, asked);
    return { held: input.held.has(move), struck: input.struck.some((s) => s.move === move), miss: watch(asked, false, input, false, frame.t) };
  });
}
const counted = (seen: readonly Seen[]): boolean => seen.some((s) => s.held || s.struck);
/** `from` held for 900 ms, then slowly to `to` (all of the way: `to` is already a small movement), then held. */
const go = (from: BodyPose, to: BodyPose, ms = 500): PoseFrame[] => recording([[from, 900], [to, ms], [to, 400]]);

// World axes: x to the player's right, y down, z negative toward the camera.
const upL = { leftUpper: [-0.2, 0.3, 0], leftFore: [0.2, -1, 0] } as const;
const upR = { rightUpper: [0.2, 0.3, 0], rightFore: [-0.2, -1, 0] } as const;
const downL = { leftUpper: [-0.07, 1, 0], leftFore: [0, 1, 0] } as const;
const downR = { rightUpper: [0.07, 1, 0], rightFore: [0, 1, 0] } as const;
const STRETCHED = pose({ drop: -0.3 });
const CROUCHED = pose({ drop: 0.4 });

interface Case { readonly id: string; readonly from: BodyPose; readonly yes: BodyPose; readonly wrong: readonly BodyPose[] }
// Each `yes` is a movement the strict detector misses (the first test checks that), so only the loose rule can count it.
const CASES: readonly Case[] = [
  // Ducking from a stretched-up stance to the calibrated height: the strict duck measures from calibration, so it sees none.
  { id: "duck", from: STRETCHED, yes: STANDING, wrong: [pose({ drop: -0.6 }), pose({ step: 0.6, drop: -0.3 }), pose({ step: -0.6, drop: -0.3 })] },
  // Stepping back toward the middle from the right is a step to the left.
  { id: "dodge_left", from: pose({ step: 0.6 }), yes: STANDING, wrong: [pose({ step: 1.2 }), pose({ step: 0.6, drop: 0.5 }), pose({ step: 0.6, drop: -0.5 })] },
  { id: "dodge_right", from: pose({ step: -0.6 }), yes: STANDING, wrong: [pose({ step: -1.2 }), pose({ step: -0.6, drop: 0.5 }), pose({ step: -0.6, drop: -0.5 })] },
  // Rising from a crouch: the strict jump never counts a rise that ends under standing height.
  { id: "jump", from: CROUCHED, yes: STANDING, wrong: [pose({ drop: 0.8 }), pose({ step: 0.6, drop: 0.4 }), pose({ step: -0.6, drop: 0.4 })] },
  { id: "block", from: STANDING, yes: pose({ ...upL, ...upR }), wrong: [pose(upL), pose(upR), pose({ drop: 0.3 }), pose({ ...downL, ...downR, drop: 0.3 })] },
];
const PROMPTS = ["jab", "block", "duck", "dodge_left", "dodge_right", "jump", "high_block", "low_block"];

test.each(CASES)("$id: a rough, slow version counts when asked, and not with no prompt or another move asked", (c) => {
  const frames = go(c.from, c.yes);
  expect(counted(run(frames, null, c.id)), "strict, no prompt").toBe(false);
  const seen = run(frames, c.id, c.id);
  expect(counted(seen)).toBe(true);
  expect(seen.some((s) => s.miss)).toBe(false);
  for (const other of PROMPTS.filter((id) => id !== c.id)) expect(counted(run(frames, other, c.id)), `${other} asked`).toBe(false);
});

test.each(CASES)("$id: the opposite direction or the wrong side does not count when asked", (c) => {
  for (const wrong of c.wrong) expect(counted(run(go(c.from, wrong), c.id, c.id)), JSON.stringify(wrong)).toBe(false);
});

const jittered = (frames: readonly PoseFrame[], only?: readonly number[]): PoseFrame[] => frames.map((frame, i): PoseFrame => {
  const dx = (i % 2 === 0 ? 1 : -1) * 0.016;
  const dy = (i % 3 === 0 ? 1 : -1) * 0.016;
  return { ...frame, image: frame.image.map((p, k) => (only === undefined || only.includes(k) ? { ...p, x: p.x + dx, y: p.y + dy } : p)) };
});

test.each(CASES)("$id: standing still with jitter does not count when asked", (c) => {
  const seen = run(jittered(recording([[c.from, 1800]])), c.id, c.id);
  expect(counted(seen)).toBe(false);
  expect(seen.some((s) => s.miss)).toBe(false);
});

test("no rough movement of mine counts for another of my moves when that one is asked (overlaps)", () => {
  // Each from calibrated standing, a third of the full movement, so the strict detectors stay near their thresholds.
  const raised = pose({ ...upL, ...upR });
  const moves = [
    { id: "duck", from: STANDING, to: pose({ drop: 0.15 }) }, { id: "jump", from: STANDING, to: pose({ drop: -0.15 }) },
    { id: "dodge_left", from: STANDING, to: pose({ step: -0.15 }) }, { id: "dodge_right", from: STANDING, to: pose({ step: 0.15 }) },
    { id: "block", from: STANDING, to: raised }, { id: "high_block", from: STANDING, to: pose(upL) },
    { id: "low_block", from: raised, to: pose({ ...downL, ...downR }) },
  ];
  const overlaps: string[] = [];
  for (const a of moves) for (const b of moves) {
    if (a.id !== b.id && counted(run(go(a.from, a.to), b.id, b.id))) overlaps.push(`${a.id} movement counts for ${b.id}`);
  }
  expect(overlaps).toEqual([]);
});

test("high_block: either forearm going up counts when asked; going down, the other prompts and a sideways step do not", () => {
  for (const [yes, no] of [[pose(upL), pose(downL)], [pose(upR), pose(downR)]] as const) {
    expect(counted(run(go(STANDING, yes), "high_block", "high_block"))).toBe(true);
    expect(counted(run(go(STANDING, yes), null, "high_block"))).toBe(false);
    expect(counted(run(go(STANDING, yes), "low_block", "high_block"))).toBe(false);
    expect(counted(run(go(pose(yes), no), "high_block", "high_block"))).toBe(false);
  }
  expect(counted(run(go(STANDING, pose({ step: 0.6 })), "high_block", "high_block"))).toBe(false);
  expect(counted(run(go(STANDING, pose({ ...upL, ...upR })), "high_block", "high_block"))).toBe(false);
});

test("low_block: either arm swept down counts when asked; raised, the other prompts and standing still do not", () => {
  const raised = pose({ ...upL, ...upR });
  for (const [one, up] of [[pose({ ...downL, ...upR }), pose(upL)], [pose({ ...upL, ...downR }), pose(upR)]] as const) {
    expect(counted(run(go(raised, one), "low_block", "low_block"))).toBe(true);
    expect(counted(run(go(raised, one), null, "low_block"))).toBe(false);
    expect(counted(run(go(raised, one), "high_block", "low_block"))).toBe(false);
    expect(counted(run(go(STANDING, up), "low_block", "low_block"))).toBe(false);
  }
  const seen = run(jittered(recording([[STANDING, 1800]]), [JOINT.leftWrist, JOINT.rightWrist]), "low_block", "low_block");
  expect(counted(seen)).toBe(false);
});
