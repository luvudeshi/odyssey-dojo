// The god moves: each fires from its own gesture at the right moment, stays quiet at rest and through a
// wind-up, and sets off no other move except the overlaps listed with each gesture.
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
const GODS: readonly (readonly [string, string, string, string, string])[] = [
  ["thunderbolt", "strike", "1", "THUNDERBOLT", "Thunderbolt"],
  ["trident_sweep", "strike", "2", "TRIDENT SWEEP", "Trident sweep"],
  ["aegis_push", "strike", "3", "AEGIS PUSH", "Aegis push"],
  ["swift_dash", "strike", "4", "SWIFT DASH", "Swift dash"],
  ["moon_arrow", "strike", "5", "MOON ARROW", "Moon arrow"],
  ["sun_burst", "strike", "6", "SUN BURST", "Sun burst"],
  ["jump", "defend", "ArrowUp", "JUMP", "Jump"],
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

/** One pose per frame on the way from one pose to another, ending on the second. */
function ease(from: Pose, to: Pose, frames: number): Pose[] {
  const mix = (a: readonly Landmark[], b: readonly Landmark[], part: number): Landmark[] =>
    a.map((point, index) => {
      const end = joint(b, index);
      return {
        ...point,
        x: point.x + (end.x - point.x) * part,
        y: point.y + (end.y - point.y) * part,
        z: point.z + (end.z - point.z) * part,
      };
    });
  return Array.from({ length: frames }, (_, index) => (t: number) => {
    const part = (index + 1) / frames;
    return { t, image: mix(from(t).image, to(t).image, part), world: mix(from(t).world, to(t).world, part) };
  });
}

/**
 * A second of standing still, then one pose per frame. Returns what was read on each of those frames.
 * `pause` is a gap in tracking, in ms, between the standing and the poses.
 */
function play(poses: readonly Pose[], pause = 0): CombatInput[] {
  const read = createPoseInput(MOVES);
  const inputs: CombatInput[] = [];
  let history = EMPTY_HISTORY;
  for (const [index, next] of [...hold(stand, 30), ...poses].entries()) {
    history = pushFrame(history, next(index * STEP + (index < 30 ? 0 : pause)));
    inputs.push(read(history));
  }
  return inputs.slice(30);
}

/** Every move seen in a run, in id order: each one that was struck or held at least once. */
function seen(inputs: readonly CombatInput[]): string[] {
  return [...new Set(inputs.flatMap((input) => [...input.struck, ...input.held]))].sort();
}

function gods(inputs: readonly CombatInput[]): string[] {
  return seen(inputs).filter((id) => GOD_IDS.includes(id));
}

function heldJump(inputs: readonly CombatInput[]): boolean[] {
  return inputs.map((input) => input.held.has("jump"));
}

const handUp = pose(
  { [J.rightElbow]: [0.64, 0.22], [J.rightWrist]: [0.62, 0.06] },
  { [J.rightElbow]: [0.3, -0.75, 0], [J.rightWrist]: [0.25, -1, -0.05] },
);
const thunderbolt = [...hold(handUp, 8), ...hold(stand, 25)];

/** Both hands out past the player's left side at picture height `y`, wound up to sweep. */
function handsLeft(y: number): Pose {
  return pose(
    {
      [J.leftElbow]: [0.32, y + 0.01], [J.leftWrist]: [0.24, y],
      [J.rightElbow]: [0.48, y + 0.03], [J.rightWrist]: [0.36, y],
    },
    {
      [J.leftElbow]: [-0.35, -0.3, -0.1], [J.leftWrist]: [-0.5, -0.25, -0.3],
      [J.rightElbow]: [0.1, -0.25, -0.2], [J.rightWrist]: [-0.2, -0.25, -0.35],
    },
  );
}
function handsMiddle(y: number): Pose {
  return pose(
    {
      [J.leftElbow]: [0.38, y + 0.02], [J.leftWrist]: [0.45, y],
      [J.rightElbow]: [0.62, y + 0.02], [J.rightWrist]: [0.55, y],
    },
    {
      [J.leftElbow]: [-0.3, -0.3, -0.1], [J.leftWrist]: [-0.1, -0.25, -0.35],
      [J.rightElbow]: [0.3, -0.3, -0.1], [J.rightWrist]: [0.1, -0.25, -0.35],
    },
  );
}
/** Wind up on the left, sweep across to the right, then drop the hands. */
function sweep(y: number): Pose[] {
  return [...hold(handsLeft(y), 12), handsMiddle(y), ...hold(mirrored(handsLeft(y)), 14), ...hold(stand, 20)];
}
const BELLY = 0.45;
const CHEST = 0.42;

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
const onePalmOut = pose(
  { [J.leftElbow]: [0.43, 0.4], [J.leftWrist]: [0.45, 0.4], [J.rightElbow]: [0.62, 0.5], [J.rightWrist]: [0.56, 0.42] },
  {
    [J.leftElbow]: [-0.2, -0.45, -0.3], [J.leftWrist]: [-0.18, -0.45, -0.58],
    [J.rightElbow]: [0.3, -0.25, 0], [J.rightWrist]: [0.15, -0.4, -0.12],
  },
);
// The left palm pushed out while the right arm swings straight out to the side.
const palmAndFling = pose(
  { [J.leftElbow]: [0.43, 0.4], [J.leftWrist]: [0.45, 0.4], [J.rightElbow]: [0.69, 0.35], [J.rightWrist]: [0.8, 0.35] },
  {
    [J.leftElbow]: [-0.2, -0.45, -0.3], [J.leftWrist]: [-0.18, -0.45, -0.58],
    [J.rightElbow]: [0.48, -0.5, 0], [J.rightWrist]: [0.75, -0.5, 0],
  },
);
// Fists in front of the face and 0.4 m forward, elbows still bent at about 60 degrees.
const guardOut = pose(
  { [J.leftElbow]: [0.39, 0.45], [J.leftWrist]: [0.46, 0.24], [J.rightElbow]: [0.61, 0.45], [J.rightWrist]: [0.54, 0.24] },
  {
    [J.leftElbow]: [-0.28, -0.25, -0.15], [J.leftWrist]: [-0.12, -0.6, -0.4],
    [J.rightElbow]: [0.28, -0.25, -0.15], [J.rightWrist]: [0.12, -0.6, -0.4],
  },
);
const aegisPush = [...hold(palmsAtChest, 8), ...hold(palmsOut, 10), ...hold(stand, 20)];

// One and a third shoulder widths to the right in 200 ms, then stay there.
const swiftDash = [...ease(stand, shifted(stand, 0.21, 0), 6), ...hold(shifted(stand, 0.21, 0), 20)];

const BOW_ARM = {
  image: { [J.leftElbow]: [0.31, 0.35], [J.leftWrist]: [0.2, 0.35] },
  world: { [J.leftElbow]: [-0.48, -0.5, 0], [J.leftWrist]: [-0.75, -0.5, 0] },
} as const;
const bowArmOnly = pose(BOW_ARM.image, BOW_ARM.world);
const bowDrawn = pose(
  { ...BOW_ARM.image, [J.rightElbow]: [0.7, 0.37], [J.rightWrist]: [0.6, 0.36] },
  { ...BOW_ARM.world, [J.rightElbow]: [0.47, -0.48, 0], [J.rightWrist]: [0.24, -0.48, -0.05] },
);
// The string hand 0.7 shoulder widths from its shoulder: a loose draw, not a release.
const bowWobble = pose(
  { ...BOW_ARM.image, [J.rightElbow]: [0.7, 0.4], [J.rightWrist]: [0.67, 0.42] },
  { ...BOW_ARM.world, [J.rightElbow]: [0.47, -0.42, 0], [J.rightWrist]: [0.4, -0.3, -0.05] },
);
// The string hand 0.8 shoulder widths from its shoulder: the smallest release that should count.
const bowEased = pose(
  { ...BOW_ARM.image, [J.rightElbow]: [0.69, 0.42], [J.rightWrist]: [0.68, 0.43] },
  { ...BOW_ARM.world, [J.rightElbow]: [0.45, -0.38, 0], [J.rightWrist]: [0.42, -0.28, -0.03] },
);
const bowLoosed = pose(
  { ...BOW_ARM.image, [J.rightElbow]: [0.66, 0.45], [J.rightWrist]: [0.72, 0.5] },
  { ...BOW_ARM.world, [J.rightElbow]: [0.4, -0.3, 0.05], [J.rightWrist]: [0.5, -0.1, 0] },
);
// The string arm pointed straight at the camera: the hand is over its shoulder in the picture but the elbow is straight.
const bowAndPoint = pose(
  { ...BOW_ARM.image, [J.rightElbow]: [0.59, 0.36], [J.rightWrist]: [0.6, 0.36] },
  { ...BOW_ARM.world, [J.rightElbow]: [0.2, -0.5, -0.28], [J.rightWrist]: [0.2, -0.5, -0.55] },
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
const hop = HOP.map((rise) => shifted(stand, 0, rise * WIDTH));
const jump = [...hop, ...hold(stand, 30)];

interface Gesture {
  readonly move: string;
  readonly how: string;
  readonly poses: readonly Pose[];
  /** The frame the move is first read on. */
  readonly at: number;
  /**
   * Other moves the same motion sets off. Each is an overlap we accept, so no style or weak spot should
   * offer both moves of a pair:
   * - overhead_strike is the right-hand thunderbolt, and aegis_push is a spear thrust with open palms.
   * - spear_thrust does not check that the arms went forward, so arms flung wide count too.
   * - hook reads any bent left arm crossing the body at shoulder height.
   * - a dash is also a dodge.
   */
  readonly also: readonly string[];
}

const GESTURES: readonly Gesture[] = [
  { move: "thunderbolt", how: "right hand", poses: thunderbolt, at: 8, also: ["overhead_strike"] },
  { move: "thunderbolt", how: "left hand", poses: thunderbolt.map(mirrored), at: 8, also: [] },
  { move: "trident_sweep", how: "left to right", poses: sweep(BELLY), at: 13, also: [] },
  { move: "trident_sweep", how: "right to left", poses: sweep(BELLY).map(mirrored), at: 13, also: [] },
  { move: "trident_sweep", how: "left to right at chest height", poses: sweep(CHEST), at: 13, also: ["hook"] },
  { move: "aegis_push", how: "both palms", poses: aegisPush, at: 8, also: ["spear_thrust"] },
  { move: "swift_dash", how: "to the right", poses: swiftDash, at: 2, also: ["dodge_right"] },
  { move: "swift_dash", how: "to the left", poses: swiftDash.map(mirrored), at: 2, also: ["dodge_left"] },
  { move: "moon_arrow", how: "left bow arm", poses: moonArrow, at: 10, also: [] },
  { move: "moon_arrow", how: "right bow arm", poses: moonArrow.map(mirrored), at: 10, also: [] },
  {
    move: "moon_arrow",
    how: "a small release",
    poses: [...hold(bowDrawn, 10), ...hold(bowEased, 8), ...hold(stand, 20)],
    at: 10,
    also: [],
  },
  { move: "sun_burst", how: "both arms", poses: sunBurst, at: 8, also: ["spear_thrust"] },
  { move: "jump", how: "a hop", poses: jump, at: 4, also: [] },
];

/** Half a gesture, or something close to one. None of these may read as any god move. */
const QUIET: readonly { readonly what: string; readonly poses: readonly Pose[] }[] = [
  { what: "a hand held up and never thrown down", poses: hold(handUp, 40) },
  { what: "both hands swung out to one side, then dropped", poses: [...hold(handsLeft(BELLY), 12), ...hold(stand, 20)] },
  { what: "palms out with no start at the chest", poses: [...hold(palmsOut, 12), ...hold(stand, 20)] },
  {
    what: "straight arms swung from wide to the front",
    poses: [...hold(armsWide, 8), ...hold(palmsOut, 10), ...hold(stand, 20)],
  },
  { what: "one palm pushed out", poses: [...hold(palmsAtChest, 8), ...hold(onePalmOut, 10), ...hold(stand, 20)] },
  {
    what: "one palm pushed out and the other arm flung wide",
    poses: [...hold(palmsAtChest, 8), ...hold(palmAndFling, 10), ...hold(stand, 20)],
  },
  { what: "hands raised into a guard in 165 ms", poses: [...ease(stand, guardOut, 5), ...hold(guardOut, 15)] },
  { what: "hands raised into a guard in 400 ms", poses: [...ease(stand, guardOut, 12), ...hold(guardOut, 15)] },
  { what: "a lean of 0.7 shoulder widths over 800 ms", poses: ease(stand, shifted(stand, 0.7 * WIDTH, 0), 24) },
  { what: "a shuffle of 0.4 shoulder widths in 200 ms", poses: ease(stand, shifted(stand, 0.4 * WIDTH, 0), 6) },
  { what: "a bow held drawn", poses: hold(bowDrawn, 30) },
  { what: "a bow drawn for two frames", poses: [...hold(bowDrawn, 2), ...hold(bowLoosed, 8), ...hold(stand, 20)] },
  { what: "a bow arm with no draw", poses: [...hold(bowArmOnly, 10), ...hold(stand, 20)] },
  { what: "a drawn bow, then both arms dropped", poses: [...hold(bowDrawn, 10), ...hold(stand, 20)] },
  {
    what: "a drawn bow with a loose string hand",
    poses: [...hold(bowDrawn, 10), ...hold(bowWobble, 4), ...hold(bowDrawn, 6), ...hold(stand, 20)],
  },
  {
    what: "a bow arm with the other arm pointed at the camera",
    poses: [...hold(bowAndPoint, 10), ...hold(bowLoosed, 8), ...hold(stand, 20)],
  },
  { what: "arms wide with no hands together first", poses: [...hold(armsWide, 15), ...hold(stand, 20)] },
  { what: "hands together, then dropped", poses: [...hold(handsTogether, 12), ...hold(stand, 20)] },
];

test("the god moves are registered with their kinds, keys, prompts and names", () => {
  const registered = GOD_IDS.map((id) => {
    const move = MOVES.get(id);
    return [id, move?.kind, move?.key, move?.prompt, move?.name];
  });
  expect(registered).toEqual(GODS);
});

test("god move diagrams stay inside the prompt card's box", () => {
  for (const id of GOD_IDS) {
    const diagram = MOVES.get(id)?.diagram;
    expect(diagram, id).toBeDefined();
    if (!diagram) continue;
    const arms = [diagram.leftElbow, diagram.leftWrist, diagram.rightElbow, diagram.rightWrist];
    // Hud.tsx draws shoulders at x 38 and 62, the head from y 10 and the feet to y 96, with a stroke 4 wide.
    const xs = [38, 62, ...arms.map(([x]) => x)].map((x) => x + (diagram.shiftX ?? 0));
    const ys = [10, 96, ...arms.map(([, y]) => y)].map((y) => y + (diagram.shiftY ?? 0));
    expect(Math.min(...xs, ...ys), id).toBeGreaterThanOrEqual(2);
    expect(Math.max(...xs, ...ys), id).toBeLessThanOrEqual(98);
  }
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
  expect(seen(play(hold(stand, 60)))).toEqual([]);
});

test("no god move reads anything from a body with no shoulder width", () => {
  const SAME = { [J.leftShoulder]: [0.5, 0.35], [J.rightShoulder]: [0.5, 0.35] } as const;
  const thin = pose(SAME);
  // The wrists slide a hair to the right and the whole body drifts up and across.
  const nudged = shifted(pose({ ...SAME, [J.leftWrist]: [0.402, 0.62], [J.rightWrist]: [0.602, 0.62] }), 0.001, -0.001);
  for (const frames of [5, 30]) {
    let history = EMPTY_HISTORY;
    for (let i = 0; i < frames; i++) history = pushFrame(history, thin(i * STEP));
    history = pushFrame(history, nudged(frames * STEP));
    expect(history.baseline?.shoulderWidth ?? 0).toBe(0);
    for (const id of GOD_IDS) expect(MOVES.get(id)?.detect(history), id).toBe(0);
  }
});

test.each(GESTURES.filter(({ move }) => move !== "jump"))(
  "$move ($how) fires exactly once, as the gesture ends",
  ({ move, poses, at }) => {
    const inputs = play(poses);
    expect(inputs.flatMap((input) => input.struck).filter((id) => id === move)).toEqual([move]);
    expect(inputs.findIndex((input) => input.struck.includes(move))).toBe(at);
  },
);

test.each(GESTURES)("$move ($how) sets off no other move but the overlaps listed for it", ({ move, poses, also }) => {
  expect(seen(play(poses)).filter((id) => id !== move)).toEqual(also);
});

test.each(QUIET)("no god move reads $what", ({ poses }) => {
  expect(gods(play(poses))).toEqual([]);
});

test("a guard, a jab and a slow lean set off no god move", () => {
  const guard = pose({ [J.leftWrist]: [0.47, 0.22], [J.rightWrist]: [0.53, 0.22] });
  const bent = pose({}, { [J.leftElbow]: [-0.3, -0.35, 0], [J.leftWrist]: [-0.2, -0.45, -0.05] });
  const straight = pose({}, { [J.leftElbow]: [-0.2, -0.5, -0.3], [J.leftWrist]: [-0.2, -0.5, -0.6] });
  const guarded = play([...hold(guard, 20), ...hold(stand, 20)]);
  const jabbed = play([...hold(bent, 6), ...hold(straight, 6), ...hold(stand, 20)]);
  const leaned = play(ease(stand, shifted(stand, -0.7 * WIDTH, 0), 24));
  expect(seen(guarded)).toEqual(["block"]);
  expect(seen(jabbed)).toEqual(["jab"]);
  expect(seen(leaned)).toEqual(["dodge_left"]);
});

test("trident sweep ignores a side-step and hands swept above the head or below the hips", () => {
  const struck = (poses: readonly Pose[]): string[] => play(poses).flatMap((input) => input.struck);
  // In a dash both wrists cross more than a shoulder width of the picture, but not of the body.
  const left = shifted(stand, -0.1, 0);
  const acrossTheMiddle = [...ease(stand, left, 30), ...hold(left, 30), ...ease(left, shifted(stand, 0.11, 0), 6)];
  expect(struck(swiftDash)).toEqual(["swift_dash"]);
  expect(struck(acrossTheMiddle)).toEqual(["swift_dash"]);
  expect(struck(sweep(0.1))).not.toContain("trident_sweep");
  expect(struck(sweep(0.75))).not.toContain("trident_sweep");
  // A chop from over the head on one side down to the belly on the other.
  const chop = [...hold(handsLeft(0.1), 12), ...hold(mirrored(handsLeft(BELLY)), 14), ...hold(stand, 20)];
  expect(struck(chop)).not.toContain("trident_sweep");
});

test("jump is held from the top of a hop until just after landing, then let go", () => {
  const held = heldJump(play(jump));
  expect(held.slice(0, 4)).not.toContain(true);
  expect(held.slice(4, 17)).not.toContain(false);
  expect(held.slice(20)).not.toContain(true);
});

test.each([5, 10, 15, 25])("a second hop %i frames after the first is held from its top too", (gap) => {
  const held = heldJump(play([...hop, ...hold(stand, gap), ...jump]));
  const second = HOP.length + gap;
  expect(held.slice(4, 17)).not.toContain(false);
  expect(held.slice(second + 4, second + 17)).not.toContain(false);
  expect(held.slice(second + 20)).not.toContain(true);
});

test("jump works from the baseline alone after a gap in tracking", () => {
  expect(heldJump(play(hold(stand, 20), 2000))).not.toContain(true);
  const held = heldJump(play(jump, 2000));
  expect(held.slice(0, 4)).not.toContain(true);
  expect(held.slice(4, 17)).not.toContain(false);
  expect(held.slice(20)).not.toContain(true);
});

test.each([6, 9, 12, 30, 45, 90])("jump is not held by standing up from a duck over %i frames", (frames) => {
  const low = shifted(stand, 0, 0.6 * WIDTH);
  const duck = play([...ease(stand, low, 30), ...hold(low, 45), ...ease(low, stand, frames), ...hold(stand, 30)]);
  expect(duck.some((input) => input.held.has("duck"))).toBe(true);
  expect(heldJump(duck)).not.toContain(true);
});

test("jump is not held by raising the arms, even with a shrug", () => {
  // Reaching up with a shrug lifts the shoulders a fifth of a shoulder width here, but not the head.
  const armsUp = pose(
    {
      [J.leftShoulder]: [0.42, 0.35 - 0.2 * WIDTH], [J.rightShoulder]: [0.58, 0.35 - 0.2 * WIDTH],
      [J.leftElbow]: [0.37, 0.2], [J.rightElbow]: [0.63, 0.2],
      [J.leftWrist]: [0.39, 0.06], [J.rightWrist]: [0.61, 0.06],
    },
    {
      [J.leftElbow]: [-0.3, -0.75, 0], [J.rightElbow]: [0.3, -0.75, 0],
      [J.leftWrist]: [-0.25, -1, -0.05], [J.rightWrist]: [0.25, -1, -0.05],
    },
  );
  const reach = play([...ease(stand, armsUp, 6), ...hold(armsUp, 20), ...ease(armsUp, stand, 6), ...hold(stand, 25)]);
  expect(heldJump(reach)).not.toContain(true);
});
