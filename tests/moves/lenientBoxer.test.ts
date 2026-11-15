// The lenient-strikes PR: the Boxer's four strikes read from a reasonable attempt by a real body, not only from a
// textbook one. Each move is thrown ideal and sloppy (part extended, aimed 30 degrees off, joints seen at
// visibility 0.35, hips unseen, small or large in the picture, turned, slow, fast, with either hand), and must
// reach 0.75 and be the only Boxer strike the game reads, apart from the jab and the cross, which read on either
// hand and so fire together. Idle arms, a desk, a loose guard, a face scratch and fidgets must read nothing.
import { describe, expect, test } from "vitest";
import type { PoseFrame } from "../../src/core/types";
import { MOVES } from "../../src/moves/registry";
import { JOINT, baselineOf } from "../../src/pose/signals";
import { replay } from "../../tools/recorder/replay";
import { CALIBRATION_FRAMES, body, recordingOn, recordingTurned, shouldersAt } from "../helpers/anyBody";
import { unseenBelow } from "../helpers/waistUp";
import type { BodyPose, Step, Vec3 } from "../poseFixture";
import { READY, STANDING, pose, recording } from "../poseFixture";

const BOXER = ["jab", "cross", "hook", "uppercut"];
/** What a straight punch with either hand reads as: both, by the owner's ruling. */
const STRAIGHT = ["cross", "jab"];

/** Everything the game read over the frames, with the baseline taken from the standing frames as at calibration. */
function readOf(frames: readonly PoseFrame[]): ReturnType<typeof replay> {
  const baseline = baselineOf(frames.slice(0, CALIBRATION_FRAMES));
  return replay({ move: "made up", person: "made up", n: 1, baseline, frames }, MOVES);
}

/** The arm joints given at visibility 0.35: a tracker that is unsure of them but still draws them. */
function unsureArms(frames: readonly PoseFrame[]): PoseFrame[] {
  const arms: readonly number[] = [JOINT.leftElbow, JOINT.rightElbow, JOINT.leftWrist, JOINT.rightWrist];
  const dim = (list: PoseFrame["image"]): PoseFrame["image"] =>
    list.map((point, index) => (arms.includes(index) ? { ...point, visibility: 0.35 } : point));
  return frames.map((frame) => ({ t: frame.t, image: dim(frame.image), world: dim(frame.world) }));
}

/** Direction `degrees` up from straight at the camera, tilted inward by `inward` for the player's `side`. */
function aim(side: "left" | "right", degrees: number, inward = 0.1): Vec3 {
  const a = (degrees * Math.PI) / 180;
  return [(side === "left" ? inward : -inward) * Math.cos(a), -Math.sin(a), -Math.cos(a)];
}

/** An arm thrown at the camera: the upper arm along `upper`, the forearm along `fore`. */
function arm(side: "left" | "right", upper: Vec3, fore: Vec3): BodyPose {
  return pose(side === "left" ? { leftUpper: upper, leftFore: fore } : { rightUpper: upper, rightFore: fore }, READY);
}

/** Straight punch from the guard, thrown in `ms`, held, then back. */
function punch(out: BodyPose, ms = 130): Step[] {
  return [[READY, 300], [READY, 300], [out, ms], [out, 200], [READY, 250], [READY, 300]];
}

const LEFT = (degrees: number): BodyPose => arm("left", aim("left", degrees), aim("left", degrees));
const RIGHT = (degrees: number): BodyPose => arm("right", aim("right", degrees), aim("right", degrees));
/** About 60% of a full reach: the upper arm forward and down, the elbow left bent near 110 degrees. */
const LEFT_SHORT = arm("left", [0.1, 0.55, -0.85], [0.1, -0.35, -0.95]);
const RIGHT_SHORT = arm("right", [-0.1, 0.55, -0.85], [-0.1, -0.35, -0.95]);

/** The hook of tests/moves/hook.test.ts: elbow out to the left at shoulder height, then swung across the chest. */
const LOADED = pose({ leftUpper: [-1, 0.15, -0.3], leftFore: [0.1, -0.1, -1] }, READY);
const ACROSS = pose({ leftUpper: [0.3, 0, -1], leftFore: [1, 0, -0.15] }, READY);
/** A sloppier hook: the elbow dropped 30 degrees and the fist stopping at the middle of the chest. */
const LOADED_LOW = pose({ leftUpper: [-0.85, 0.5, -0.3], leftFore: [0.1, -0.1, -1] }, READY);
const ACROSS_SHORT = pose({ leftUpper: [0.1, 0.35, -1], leftFore: [1, -0.1, -0.4] }, READY);
/** The same hook thrown with the right hand. */
const RIGHT_LOADED = pose({ rightUpper: [1, 0.15, -0.3], rightFore: [-0.1, -0.1, -1] }, READY);
const RIGHT_ACROSS = pose({ rightUpper: [-0.3, 0, -1], rightFore: [-1, 0, -0.15] }, READY);
const hookSteps = (loaded: BodyPose, across: BodyPose, ms = 165): Step[] =>
  [[READY, 300], [loaded, 200], [across, ms], [across, 66], [READY, 200], [READY, 600]];

/** Uppercut: the right fist driven up from the waist to the chin, the elbow kept low and bent. */
const LOW_FIST = pose({ rightUpper: [0.05, 1, -0.1], rightFore: [-0.1, 0.1, -1] });
const UP_FIST = pose({ rightUpper: [-0.05, 0.6, -0.8], rightFore: [-0.1, -1, -0.2] });
/** The same with the elbow flared out to the side, about 30 degrees, and the fist leaning in. */
const UP_FIST_FLARED = pose({ rightUpper: [0.4, 0.6, -0.7], rightFore: [-0.3, -1, -0.2] });
const upperSteps = (top: BodyPose, ms = 250): Step[] =>
  [[STANDING, 300], [LOW_FIST, 300], [top, ms], [top, 100], [STANDING, 400], [STANDING, 300]];

type Variant = readonly [string, () => PoseFrame[]];

/** The variants every strike is tried in, from one recipe for its steps. */
function variants(steps: (slow: number) => Step[], normal: number): Variant[] {
  const frames = (): PoseFrame[] => recording(steps(normal));
  return [
    ["as thrown", frames],
    ["slow", () => recording(steps(normal * 3))],
    ["fast", () => recording(steps(Math.round(normal * 0.6)))],
    ["joints at visibility 0.35", () => unsureArms(frames())],
    ["hips unseen", () => unseenBelow(frames())],
    ["shoulders 0.15 of the picture", () => recordingOn(body("far", { zoom: shouldersAt(0.15) }), frames())],
    ["shoulders 0.6 of the picture", () => recordingOn(body("near", { zoom: shouldersAt(0.6) }), frames())],
    ["turned 30 degrees to the left", () => recordingTurned(frames(), 30, 0)],
    ["turned 30 degrees to the right", () => recordingTurned(frames(), -30, 0)],
  ];
}

const ATTEMPTS: Record<string, Variant[]> = {
  jab: [
    ...variants((ms) => punch(LEFT(0), ms), 130),
    ["60% extended", () => recording(punch(LEFT_SHORT))],
    ["aimed 30 degrees up", () => recording(punch(LEFT(30)))],
    ["aimed 30 degrees down", () => recording(punch(LEFT(-30)))],
    ["aimed 30 degrees inward", () => recording(punch(arm("left", aim("left", 0, 0.58), aim("left", 0, 0.58))))],
    ["thrown with the right hand", () => recording(punch(RIGHT(0)))],
  ],
  cross: [
    ...variants((ms) => punch(RIGHT(0), ms), 130),
    ["60% extended", () => recording(punch(RIGHT_SHORT))],
    ["aimed 30 degrees up", () => recording(punch(RIGHT(30)))],
    ["aimed 30 degrees down", () => recording(punch(RIGHT(-30)))],
    ["aimed 30 degrees inward", () => recording(punch(arm("right", aim("right", 0, 0.58), aim("right", 0, 0.58))))],
    ["thrown with the left hand", () => recording(punch(LEFT(0)))],
  ],
  hook: [
    ...variants((ms) => hookSteps(LOADED, ACROSS, ms), 165),
    ["elbow dropped, short swing", () => recording(hookSteps(LOADED_LOW, ACROSS_SHORT))],
    ["thrown with the right hand", () => recording(hookSteps(RIGHT_LOADED, RIGHT_ACROSS))],
  ],
  uppercut: [
    ...variants((ms) => upperSteps(UP_FIST, ms), 250),
    ["elbow flared out", () => recording(upperSteps(UP_FIST_FLARED))],
  ],
};

describe.each(BOXER)("%s", (move) => {
  test.each(ATTEMPTS[move] ?? [])("%s reaches 0.75 and is the only Boxer strike read, bar the jab and cross pair", (_name, frames) => {
    const result = readOf(frames());
    expect(result.peaks[move]).toBeGreaterThanOrEqual(0.75);
    expect(result.strikes.filter((id) => BOXER.includes(id)).sort()).toEqual(STRAIGHT.includes(move) ? STRAIGHT : [move]);
  });
});

/** Not attempts at anything: what a player does between prompts. */
const IDLE: Record<string, () => PoseFrame[]> = {
  "standing still": () => recording([[STANDING, 2000]]),
  "forearms resting on a desk": () => {
    const desk = pose({ leftUpper: [-0.05, 1, 0.1], leftFore: [0.1, 0, -1], rightUpper: [0.05, 1, 0.1], rightFore: [-0.1, 0, -1] });
    return recording([[desk, 600], [desk, 1500]]);
  },
  "a loose guard, swaying": () => {
    const sway = pose({ leftFore: [0.25, -0.1, -0.2], rightFore: [-0.25, -0.1, -0.2] }, READY);
    return recording([[READY, 400], [sway, 400], [READY, 400], [sway, 400], [READY, 400]]);
  },
  "scratching the face": () => {
    const face = pose({ rightUpper: [0.05, 0.3, -0.25], rightFore: [-0.35, -1, -0.1] });
    return recording([[STANDING, 300], [face, 700], [face, 600], [STANDING, 700]]);
  },
  "fidgeting with both hands": () => {
    const a = pose({ leftFore: [0.2, 0.3, -0.5], rightFore: [-0.1, 0.6, -0.3] });
    const b = pose({ leftFore: [0.05, 0.7, -0.3], rightFore: [-0.25, 0.2, -0.5] });
    return recording([[a, 350], [b, 350], [a, 350], [b, 350], [STANDING, 500]]);
  },
};

describe.each(Object.keys(IDLE))("%s", (name) => {
  test("no Boxer strike passes 0.25, and the game reads nothing", () => {
    const result = readOf(IDLE[name]?.() ?? []);
    for (const move of BOXER) expect(result.peaks[move]).toBeLessThan(0.25);
    expect([...result.strikes, ...result.held]).toEqual([]);
  });
});

// The owner's own trace (issue in the lenient-strikes brief) is a right hand driven up and forward with the elbow
// lifted out to the side and the fist ending at the forehead. Made up here in its shape: it reads as a straight
// punch (the cross, and the jab, which read on either hand), and not as the uppercut, because the elbow came up
// past 55 degrees.
test("a right fist driven up to the forehead with the elbow lifted reads as a straight punch, not an uppercut", () => {
  const lifted = pose({ rightUpper: [0.45, 0.05, -0.9], rightFore: [-0.4, -0.75, -0.55] }, READY);
  const result = readOf(recording(punch(lifted, 200)));
  expect(result.strikes.filter((id) => BOXER.includes(id)).sort()).toEqual(STRAIGHT);
});
