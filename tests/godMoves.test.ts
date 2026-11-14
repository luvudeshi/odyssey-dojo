// The god moves: each fires from its own gesture, stays quiet at rest, and never sets off another god move.
import { expect, test } from "vitest";
import type { CombatInput, Landmark, PoseFrame } from "../src/core/types";
import { createPoseInput } from "../src/input/poseInput";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, JOINT, joint, pushFrame } from "../src/pose/signals";
import { frameAt } from "./poseFixture";

const J = JOINT;
const STEP = 33;
/** Shoulder width of the fixture's standing person, in image units. */
const WIDTH = 0.16;
const GODS: readonly (readonly [string, string, string])[] = [
  ["thunderbolt", "strike", "1"],
  ["trident_sweep", "strike", "2"],
  ["aegis_push", "strike", "3"],
  ["swift_dash", "strike", "4"],
  ["moon_arrow", "strike", "5"],
  ["sun_burst", "strike", "6"],
  ["jump", "defend", "ArrowUp"],
];
const GOD_IDS = GODS.map(([id]) => id);

/** A body position that can be stamped with any time. */
type Pose = (t: number) => PoseFrame;

const stand: Pose = (t) => frameAt(t);

function pose(
  image: Record<number, readonly [number, number]>,
  world: Record<number, readonly [number, number, number]> = {},
): Pose {
  return (t) => frameAt(t, image, world);
}

/** The same pose with the whole body moved in the picture. */
function shifted(base: Pose, dx: number, dy: number): Pose {
  return (t) => {
    const frame = base(t);
    return { ...frame, image: frame.image.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })) };
  };
}

/** The same pose done with the other side of the body. */
function mirrored(base: Pose): Pose {
  // From the shoulders down, MediaPipe numbers each left joint odd and its right twin one higher.
  const flip = (points: readonly Landmark[], middle: number): Landmark[] =>
    points.map((_, index) => {
      const twin = joint(points, index < 11 ? index : index % 2 === 1 ? index + 1 : index - 1);
      return { ...twin, x: middle - twin.x };
    });
  return (t) => {
    const frame = base(t);
    return { t, image: flip(frame.image, 1), world: flip(frame.world, 0) };
  };
}

function hold(base: Pose, frames: number): Pose[] {
  return Array.from({ length: frames }, () => base);
}

/** A second of standing still, then one pose per frame. Returns what was read on each of those frames. */
function play(poses: readonly Pose[]): CombatInput[] {
  const read = createPoseInput(MOVES);
  const inputs: CombatInput[] = [];
  let history = EMPTY_HISTORY;
  for (const [index, next] of [...hold(stand, 30), ...poses].entries()) {
    history = pushFrame(history, next(index * STEP));
    inputs.push(read(history));
  }
  return inputs.slice(30);
}

/** The god moves seen in a run: a strike once for each time it fired, a defense once if it was ever held. */
function gods(inputs: readonly CombatInput[]): string[] {
  const held = new Set(inputs.flatMap((input) => [...input.held]));
  return [...inputs.flatMap((input) => input.struck), ...held].filter((id) => GOD_IDS.includes(id));
}

const handUp = pose(
  { [J.rightElbow]: [0.64, 0.22], [J.rightWrist]: [0.62, 0.06] },
  { [J.rightElbow]: [0.3, -0.75, 0], [J.rightWrist]: [0.25, -1, -0.05] },
);
const thunderbolt = [...hold(handUp, 8), ...hold(stand, 25)];

const handsLeft = pose(
  { [J.leftElbow]: [0.34, 0.46], [J.leftWrist]: [0.28, 0.45], [J.rightElbow]: [0.5, 0.48], [J.rightWrist]: [0.38, 0.45] },
  {
    [J.leftElbow]: [-0.35, -0.3, -0.1], [J.leftWrist]: [-0.5, -0.25, -0.3],
    [J.rightElbow]: [0.1, -0.25, -0.2], [J.rightWrist]: [-0.2, -0.25, -0.35],
  },
);
const handsMiddle = pose(
  { [J.leftElbow]: [0.38, 0.47], [J.leftWrist]: [0.45, 0.45], [J.rightElbow]: [0.62, 0.47], [J.rightWrist]: [0.55, 0.45] },
  {
    [J.leftElbow]: [-0.3, -0.3, -0.1], [J.leftWrist]: [-0.1, -0.25, -0.35],
    [J.rightElbow]: [0.3, -0.3, -0.1], [J.rightWrist]: [0.1, -0.25, -0.35],
  },
);
const tridentSweep = [...hold(handsLeft, 12), handsMiddle, ...hold(mirrored(handsLeft), 14), ...hold(stand, 20)];

const palmsAtChest = pose(
  { [J.leftElbow]: [0.38, 0.5], [J.leftWrist]: [0.44, 0.42], [J.rightElbow]: [0.62, 0.5], [J.rightWrist]: [0.56, 0.42] },
  {
    [J.leftElbow]: [-0.3, -0.25, 0], [J.leftWrist]: [-0.15, -0.4, -0.12],
    [J.rightElbow]: [0.3, -0.25, 0], [J.rightWrist]: [0.15, -0.4, -0.12],
  },
);
const palmsOut = pose(
  { [J.leftElbow]: [0.43, 0.4], [J.leftWrist]: [0.45, 0.4], [J.rightElbow]: [0.57, 0.4], [J.rightWrist]: [0.55, 0.4] },
  {
    [J.leftElbow]: [-0.2, -0.45, -0.3], [J.leftWrist]: [-0.18, -0.45, -0.58],
    [J.rightElbow]: [0.2, -0.45, -0.3], [J.rightWrist]: [0.18, -0.45, -0.58],
  },
);
const aegisPush = [...hold(palmsAtChest, 8), ...hold(palmsOut, 10), ...hold(stand, 20)];

// Three quarters of a shoulder width to the right in 200 ms, then stay there.
const swiftDash = [
  ...[1, 2, 3, 4, 5, 6].map((step) => shifted(stand, step * 0.02, 0)),
  ...hold(shifted(stand, 0.12, 0), 20),
];

const BOW_ARM = {
  image: { [J.leftElbow]: [0.31, 0.35], [J.leftWrist]: [0.2, 0.35] },
  world: { [J.leftElbow]: [-0.48, -0.5, 0], [J.leftWrist]: [-0.75, -0.5, 0] },
} as const;
const bowDrawn = pose(
  { ...BOW_ARM.image, [J.rightElbow]: [0.7, 0.37], [J.rightWrist]: [0.6, 0.36] },
  { ...BOW_ARM.world, [J.rightElbow]: [0.47, -0.48, 0], [J.rightWrist]: [0.24, -0.48, -0.05] },
);
const bowLoosed = pose(
  { ...BOW_ARM.image, [J.rightElbow]: [0.66, 0.45], [J.rightWrist]: [0.72, 0.5] },
  { ...BOW_ARM.world, [J.rightElbow]: [0.4, -0.3, 0.05], [J.rightWrist]: [0.5, -0.1, 0] },
);
const moonArrow = [...hold(bowDrawn, 10), ...hold(bowLoosed, 8), ...hold(stand, 20)];

const handsTogether = pose(
  { [J.leftElbow]: [0.38, 0.48], [J.leftWrist]: [0.48, 0.42], [J.rightElbow]: [0.62, 0.48], [J.rightWrist]: [0.52, 0.42] },
  {
    [J.leftElbow]: [-0.28, -0.25, -0.05], [J.leftWrist]: [-0.04, -0.35, -0.15],
    [J.rightElbow]: [0.28, -0.25, -0.05], [J.rightWrist]: [0.04, -0.35, -0.15],
  },
);
const armsWide = pose(
  { [J.leftElbow]: [0.31, 0.35], [J.leftWrist]: [0.2, 0.35], [J.rightElbow]: [0.69, 0.35], [J.rightWrist]: [0.8, 0.35] },
  {
    [J.leftElbow]: [-0.48, -0.5, 0], [J.leftWrist]: [-0.75, -0.5, 0],
    [J.rightElbow]: [0.48, -0.5, 0], [J.rightWrist]: [0.75, -0.5, 0],
  },
);
const sunBurst = [...hold(handsTogether, 8), ...hold(armsWide, 10), ...hold(stand, 20)];

// Shoulder height through a hop, in shoulder widths: a small dip, up to 0.3 at frame 5, back down by frame 10.
const HOP = [0.04, 0.06, -0.05, -0.15, -0.25, -0.3, -0.25, -0.15, -0.03, 0.05, 0.02];
const jump = [...HOP.map((rise) => shifted(stand, 0, rise * WIDTH)), ...hold(stand, 30)];

const GESTURES: readonly { readonly move: string; readonly how: string; readonly poses: readonly Pose[] }[] = [
  { move: "thunderbolt", how: "right hand", poses: thunderbolt },
  { move: "thunderbolt", how: "left hand", poses: thunderbolt.map(mirrored) },
  { move: "trident_sweep", how: "left to right", poses: tridentSweep },
  { move: "trident_sweep", how: "right to left", poses: tridentSweep.map(mirrored) },
  { move: "aegis_push", how: "both palms", poses: aegisPush },
  { move: "swift_dash", how: "to the right", poses: swiftDash },
  { move: "swift_dash", how: "to the left", poses: swiftDash.map(mirrored) },
  { move: "moon_arrow", how: "left bow arm", poses: moonArrow },
  { move: "moon_arrow", how: "right bow arm", poses: moonArrow.map(mirrored) },
  { move: "sun_burst", how: "both arms", poses: sunBurst },
  { move: "jump", how: "a hop", poses: jump },
];

test("the god moves are registered with their kinds and keys", () => {
  const registered = GOD_IDS.map((id) => [id, MOVES.get(id)?.kind, MOVES.get(id)?.key]);
  expect(registered).toEqual(GODS);
});

test("no god move reads anything from an empty history, a few frames with no baseline, or standing still", () => {
  let brief = EMPTY_HISTORY;
  for (let i = 0; i < 5; i++) brief = pushFrame(brief, frameAt(i * STEP));
  let still = EMPTY_HISTORY;
  for (let i = 0; i < 60; i++) still = pushFrame(still, frameAt(i * STEP));
  expect(brief.baseline).toBeNull();
  expect(still.baseline).not.toBeNull();
  for (const id of GOD_IDS) {
    for (const history of [EMPTY_HISTORY, brief, still]) expect(MOVES.get(id)?.detect(history), id).toBe(0);
  }
  expect(gods(play(hold(stand, 60)))).toEqual([]);
});

test.each(GESTURES.filter(({ move }) => move !== "jump"))("$move ($how) fires exactly once", ({ move, poses }) => {
  const struck = play(poses).flatMap((input) => input.struck);
  expect(struck.filter((id) => id === move)).toEqual([move]);
});

test("jump is held from the top of a hop until just after landing, then let go", () => {
  const held = play(jump).map((input) => input.held.has("jump"));
  expect(held.slice(0, 4)).not.toContain(true);
  expect(held.slice(4, 17)).not.toContain(false);
  expect(held.slice(20)).not.toContain(true);
});

test("jump is not held by ducking and standing back up slowly, or by raising the arms", () => {
  const down = Array.from({ length: 30 }, (_, i) => shifted(stand, 0, ((i + 1) / 30) * 0.6 * WIDTH));
  const up = Array.from({ length: 90 }, (_, i) => shifted(stand, 0, (1 - (i + 1) / 90) * 0.6 * WIDTH));
  const duck = play([...down, ...hold(shifted(stand, 0, 0.6 * WIDTH), 15), ...up, ...hold(stand, 30)]);
  expect(duck.some((input) => input.held.has("duck"))).toBe(true);
  expect(duck.some((input) => input.held.has("jump"))).toBe(false);

  // Reaching up lifts the shoulders a little: a tenth of a shoulder width here.
  const armsUp = pose(
    {
      [J.leftShoulder]: [0.42, 0.334], [J.rightShoulder]: [0.58, 0.334],
      [J.leftElbow]: [0.37, 0.2], [J.rightElbow]: [0.63, 0.2],
      [J.leftWrist]: [0.39, 0.06], [J.rightWrist]: [0.61, 0.06],
    },
    {
      [J.leftElbow]: [-0.3, -0.75, 0], [J.rightElbow]: [0.3, -0.75, 0],
      [J.leftWrist]: [-0.25, -1, -0.05], [J.rightWrist]: [0.25, -1, -0.05],
    },
  );
  const reach = play([...hold(armsUp, 20), ...hold(stand, 25)]);
  expect(reach.some((input) => input.held.has("jump"))).toBe(false);
});

test.each(GESTURES)("$move ($how) does not set off a different god move", ({ move, poses }) => {
  expect(gods(play(poses)).filter((id) => id !== move)).toEqual([]);
});