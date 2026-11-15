// Practice mode's pure parts on made-up frames: every move done right counts, a weak attempt gets the tip for
// the part that was weak (so the tip changes with how the move was done), and ten repetitions sum up in plain
// lines. The good sequences are the ones in tests/moves/detectors.test.ts, which does not export its table.
import { describe, expect, test } from "vitest";
import {
  KEYBOARD_REP, PRACTICE_TIPS, PRAISE, REPS, TABLED_MOVES, judgeRep, nextRep, startPractice, summarise,
} from "../src/coach";
import type { PracticeTip, RepResult } from "../src/coach";
import type { MoveDef, PoseFrame } from "../src/core/types";
import { MOVES } from "../src/moves/registry";
import { JOINT, baselineOf } from "../src/pose/signals";
import { GOD_GOOD } from "./godMoveSequences";
import { need } from "./helpers/need";
import { CLEAN, seeded, seenBy } from "./helpers/noisyCamera";
import type { Arm, Key, Leg } from "./helpers/poses";
import {
  ACROSS, CHOP, COCKED, DOWN, GUARD, HIP, HOOK_IN, HOOK_OUT, LATERAL, LEG_CHAMBER, LEG_DOWN, LEG_HALF, LEG_KICK,
  LEG_KNEE, OVERHEAD, PALM, PUNCH, STAKE_CHEST, STAKE_DOWN, pose, sequence, standing, withLegs,
} from "./helpers/poses";

const both = (arm: Arm) => pose(arm, arm);
const left = (arm: Arm) => pose(arm, DOWN);
const right = (arm: Arm) => pose(DOWN, arm);
const keys = (...pairs: [number, ReturnType<typeof pose>][]): Key[] => pairs.map(([t, p]) => ({ t, pose: p }));
const leg = (shape: Leg = LEG_DOWN) => withLegs(pose(DOWN), LEG_DOWN, shape);
const moveOf = (id: string): MoveDef => need(MOVES.get(id));

/** Each move done right. */
const GOOD: Record<string, Key[]> = {
  jab: keys([0, pose(DOWN)], [150, left(COCKED)], [300, left(PUNCH)]),
  cross: keys([0, pose(DOWN)], [150, right(COCKED)], [300, right(PUNCH)]),
  hook: keys([0, left(HOOK_OUT)], [100, left(HOOK_OUT)], [250, left(HOOK_IN)]),
  uppercut: keys([0, pose(DOWN)], [250, right(GUARD)]),
  rising_palm: keys([0, pose(DOWN)], [250, left(GUARD)]),
  hammer_fist: keys([0, pose(DOWN)], [300, left(OVERHEAD)], [500, left(CHOP)]),
  overhead_strike: keys([0, pose(DOWN)], [300, right(OVERHEAD)], [500, right(CHOP)]),
  knife_hand: keys([0, pose(DOWN)], [200, right(ACROSS)], [450, right(LATERAL)]),
  reverse_punch: keys([0, pose(DOWN)], [150, pose(HIP, COCKED)], [300, pose(HIP, PUNCH)]),
  spear_thrust: keys([0, pose(DOWN)], [150, both(COCKED)], [300, both(PUNCH)]),
  double_palm: keys([0, pose(DOWN)], [150, both(COCKED)], [300, both(PALM)]),
  chain_punch: keys(
    [0, pose(DOWN)], [100, left(COCKED)], [250, left(PUNCH)], [350, right(COCKED)], [500, right(PUNCH)],
  ),
  stake_thrust: keys([0, pose(DOWN)], [300, both(STAKE_CHEST)], [500, both(STAKE_DOWN)]),
  front_kick: keys([0, leg()], [100, leg()], [300, leg(LEG_CHAMBER)], [450, leg(LEG_KICK)]),
  knee: keys([0, leg()], [100, leg()], [300, leg(LEG_KNEE)], [500, leg(LEG_KNEE)]),
  block: keys([0, pose(DOWN)], [250, both(GUARD)], [450, both(GUARD)]),
  duck: keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, 0, 0.12)], [500, pose(DOWN, DOWN, 0, 0.12)]),
  dodge_left: keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, -0.12, 0)], [500, pose(DOWN, DOWN, -0.12, 0)]),
  dodge_right: keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, 0.12, 0)], [500, pose(DOWN, DOWN, 0.12, 0)]),
  ...GOD_GOOD,
};

// Arms for the weak attempts, in left-side coordinates like tests/helpers/poses.ts.
/** A punch that stops with the elbow still well bent. */
const SHORT: Arm = { elbow: [0.39, 0.43], wrist: [0.42, 0.37], elbow3: [-0.25, -0.38, -0.12], wrist3: [-0.22, -0.48, -0.32] };
/** A straight arm pushed out at belly height. */
const LOW: Arm = { elbow: [0.4, 0.45], wrist: [0.39, 0.5], elbow3: [-0.25, -0.25, -0.25], wrist3: [-0.3, -0.05, -0.5] };
/** The hook's two ends swung at belly height. */
const LOW_HOOK_OUT: Arm = { ...HOOK_OUT, elbow: [0.3, 0.5], wrist: [0.26, 0.5] };
const LOW_HOOK_IN: Arm = { ...HOOK_IN, elbow: [0.3, 0.5], wrist: [0.42, 0.5] };
/** A front kick that stops low, and one that gets the foot up with the leg still bent. */
const LEG_LOW_KICK: Leg = { knee: [0.45, 0.72], ankle: [0.45, 0.8], knee3: [-0.1, 0.2, -0.38], ankle3: [-0.1, 0.5, -0.6] };
const LEG_BENT_KICK: Leg = { knee: [0.45, 0.66], ankle: [0.45, 0.68], knee3: [-0.1, 0.05, -0.42], ankle3: [-0.1, 0.25, -0.55] };

/** The same frames with the hips left where they stood: the shoulders came down by a bow from the waist. */
function hipsStay(frames: readonly PoseFrame[]): PoseFrame[] {
  return frames.map((frame) => ({
    ...frame,
    image: frame.image.map((point, index) => (index === JOINT.leftHip || index === JOINT.rightHip ? { ...point, y: 0.65 } : point)),
  }));
}

const T = PRACTICE_TIPS;

/** A weak attempt: the move, what was wrong with it, the tip it must get, and the frames. */
const WEAK: readonly (readonly [string, string, PracticeTip, PoseFrame[]])[] = [
  ["jab", "the arm stops short", T.reach, sequence(keys([0, pose(DOWN)], [150, left(COCKED)], [300, left(SHORT)], [450, left(SHORT)]))],
  ["jab", "thrown at belly height", T.height, sequence(keys([0, pose(DOWN)], [150, left(COCKED)], [300, left(LOW)]))],
  ["jab", "flung out to the side", T.aim, sequence(keys([0, pose(DOWN)], [150, left(COCKED)], [300, left(LATERAL)]))],
  // The hand comes back afterwards, as it does in a real attempt: the punch is still what gets judged.
  ["jab", "flung out to the side, then back to the face", T.aim, sequence(keys([0, pose(DOWN)], [150, left(COCKED)], [300, left(LATERAL)], [450, left(GUARD)], [800, left(GUARD)]))],
  ["jab", "thrown at belly height, then dropped", T.height, sequence(keys([0, pose(DOWN)], [150, left(COCKED)], [300, left(LOW)], [500, pose(DOWN)], [800, pose(DOWN)]))],
  ["jab", "reached out slowly", T.snap, sequence(keys([0, pose(DOWN)], [3000, left(PUNCH)]))],
  ["cross", "the arm stops short", T.reach, sequence(keys([0, pose(DOWN)], [150, right(COCKED)], [300, right(SHORT)], [450, right(SHORT)]))],
  ["cross", "thrown at belly height", T.height, sequence(keys([0, pose(DOWN)], [150, right(COCKED)], [300, right(LOW)]))],
  ["cross", "reached out slowly", T.snap, sequence(keys([0, pose(DOWN)], [3000, right(PUNCH)]))],
  ["hook", "the bent arm held still", T.hookSwing, sequence(keys([0, left(HOOK_OUT)], [800, left(HOOK_OUT)]))],
  ["hook", "swung at belly height", T.hookLevel, sequence(keys([0, left(LOW_HOOK_OUT)], [100, left(LOW_HOOK_OUT)], [250, left(LOW_HOOK_IN)]))],
  ["hook", "swung with a straight arm", T.hookBend, sequence(keys([0, left(LATERAL)], [100, left(LATERAL)], [250, left(PUNCH)]))],
  ["block", "the hands stop at the chest", T.guard, sequence(keys([0, pose(DOWN)], [250, both(COCKED)], [450, both(COCKED)]))],
  ["block", "one hand stays down", T.guard, sequence(keys([0, pose(DOWN)], [250, left(GUARD)], [450, left(GUARD)]))],
  ["block", "the hands go up and straight back down", T.hold, sequence(keys([0, pose(DOWN)], [120, both(GUARD)], [240, pose(DOWN)]))],
  ["duck", "a shallow dip", T.depth, sequence(keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, 0, 0.06)], [500, pose(DOWN, DOWN, 0, 0.06)]))],
  ["duck", "a bow from the waist", T.knees, hipsStay(sequence(need(GOOD.duck)))],
  ["dodge_left", "a small lean", T.distance, sequence(keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, -0.06, 0)], [500, pose(DOWN, DOWN, -0.06, 0)]))],
  ["dodge_left", "a step the wrong way", T.toLeft, sequence(need(GOOD.dodge_right))],
  ["dodge_left", "a sway out and straight back", T.stay, sequence(keys([0, pose(DOWN)], [100, pose(DOWN, DOWN, -0.12, 0)], [200, pose(DOWN)]))],
  ["dodge_right", "a step the wrong way", T.toRight, sequence(need(GOOD.dodge_left))],
  ["front_kick", "the leg swung up with no knee lift", T.kickChamber, sequence(keys([0, leg()], [100, leg()], [400, leg(LEG_KICK)]))],
  ["front_kick", "a kick that stops low", T.kickHeight, sequence(keys([0, leg()], [100, leg()], [300, leg(LEG_CHAMBER)], [450, leg(LEG_LOW_KICK)]))],
  ["front_kick", "the foot up but the leg bent", T.kickStraight, sequence(keys([0, leg()], [100, leg()], [300, leg(LEG_CHAMBER)], [450, leg(LEG_BENT_KICK)]))],
  ["front_kick", "the feet out of the picture", T.feet, sequence(need(GOOD.jab))],
  ["knee", "a knee lifted only a little", T.kneeHeight, sequence(keys([0, leg()], [100, leg()], [300, leg(LEG_HALF)], [600, leg(LEG_HALF)]))],
  ["knee", "a knee up and straight back down", T.kneeHold, sequence(keys([0, leg()], [100, leg()], [250, leg(LEG_KNEE)], [400, leg()]))],
  ["uppercut", "a slow raise to the chin", T.drive, sequence(keys([0, pose(DOWN)], [2000, right(GUARD)], [2800, right(GUARD)]))],
  ["overhead_strike", "the hand lowered gently", T.raise, sequence(keys([0, pose(DOWN)], [300, right(OVERHEAD)], [1500, right(CHOP)]))],
  ["knife_hand", "a swing out with no start across the body", T.chamber, sequence(keys([0, pose(DOWN)], [400, right(LATERAL)]))],
  ["reverse_punch", "the other hand left hanging", T.pull, sequence(need(GOOD.cross))],
  ["double_palm", "the hands pushed out wide", T.together, sequence(need(GOOD.spear_thrust))],
  ["chain_punch", "one punch with no second", T.follow, sequence(need(GOOD.jab))],
  // Moves with no table of their own get the one tip for their kind.
  ["trident_sweep", "a jab instead", T.strike, sequence(need(GOOD.jab))],
  ["stake_thrust", "the hands held at the chest", T.strike, sequence(keys([0, pose(DOWN)], [300, both(STAKE_CHEST)], [900, both(STAKE_CHEST)]))],
  ["jump", "a duck instead", T.defend, sequence(need(GOOD.duck))],
];

const sound = (result: RepResult): void => {
  for (const value of [result.quality, result.peak]) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  }
  expect(result.tip === null).toBe(result.part === null);
  expect((result.tip ?? "").length).toBeLessThanOrEqual(90);
  if (!result.counted) {
    expect(result.quality).toBe(0);
    expect(result.tip).not.toBeNull();
  }
};

test("the table of good sequences covers the whole registry", () => {
  expect(Object.keys(GOOD).sort()).toEqual([...MOVES.keys()].sort());
  expect(MOVES.size).toBe(26);
});

describe.each(Object.keys(GOOD))("%s", (id) => {
  const move = moveOf(id);
  test("done right: counts, with a quality and nothing to fix", () => {
    const result = judgeRep(move, sequence(need(GOOD[id])));
    sound(result);
    expect(result.counted).toBe(true);
    expect(result.peak).toBeGreaterThanOrEqual(0.7);
    expect(result.quality).toBeGreaterThan(0.5);
    expect(result.tip).toBeNull();
  });
  test("standing still: does not count, and says no move was seen (or that the feet are not in view)", () => {
    const result = judgeRep(move, standing());
    sound(result);
    expect(result.counted).toBe(false);
    expect(result.part).toBe(id === "front_kick" || id === "knee" ? T.feet.part : T.still.part);
  });
  test("every other move's frames: a sound result and no throw", () => {
    for (const other of Object.values(GOOD)) sound(judgeRep(move, sequence(other)));
  });
});

describe("the tip names the part that was weak", () => {
  test.each(WEAK)("%s, %s", (id, _how, say, frames) => {
    const result = judgeRep(moveOf(id), frames);
    sound(result);
    expect(result.part).toBe(say.part);
    expect(result.tip).toBe(say.tip);
  });

  test("so it changes with how the move was done", () => {
    for (const id of ["jab", "cross", "hook", "block", "duck", "dodge_left", "front_kick"]) {
      const tips = new Set(WEAK.filter(([move]) => move === id).map(([, , , frames]) => judgeRep(moveOf(id), frames).tip));
      expect(tips.size, id).toBeGreaterThanOrEqual(2);
      expect(tips.has(null), id).toBe(false);
    }
  });

  test("a move that counted can still get a tip: a guard dropped at once counts and is told to hold", () => {
    const [, , , frames] = need(WEAK.find(([, , say]) => say === T.hold));
    expect(judgeRep(moveOf("block"), frames)).toMatchObject({ counted: true, part: "hold" });
  });

  test("a good punch followed by the hand coming back to the face still has nothing to fix", () => {
    const frames = sequence(keys([0, pose(DOWN)], [150, left(COCKED)], [300, left(PUNCH)], [450, left(GUARD)], [900, left(GUARD)]));
    expect(judgeRep(moveOf("jab"), frames)).toMatchObject({ counted: true, tip: null, part: null });
  });

  test("a near miss is told from nothing by its peak", () => {
    const [, , , lean] = need(WEAK.find(([, , say]) => say === T.distance));
    const near = judgeRep(moveOf("dodge_left"), lean);
    expect(near.counted).toBe(false);
    expect(near.peak).toBeGreaterThan(0.3);
    expect(judgeRep(moveOf("dodge_left"), standing()).peak).toBeLessThan(0.1);
  });
});

describe("what is not the player's doing is said as it is", () => {
  const hidden = (frames: readonly PoseFrame[]): PoseFrame[] =>
    frames.map((frame) => ({ ...frame, image: frame.image.map((point) => ({ ...point, visibility: 0 })) }));

  test.each([...MOVES.keys()])("%s: no frames, and nobody in the picture", (id) => {
    for (const frames of [[], hidden(sequence(need(GOOD[id])))]) {
      const result = judgeRep(moveOf(id), frames);
      sound(result);
      expect(result).toMatchObject({ counted: false, peak: 0, part: T.camera.part, tip: T.camera.tip });
    }
  });

  test("a shaking camera (landmarks off by 1% of the frame) is not read as the player moving", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const camera = { ...CLEAN, jitter: 0.01, seed };
      const random = seeded(seed);
      const shaken = standing().map((frame) => seenBy(camera, frame, 1, random));
      for (const id of ["jab", "hook", "block", "duck", "dodge_left"]) {
        expect(judgeRep(moveOf(id), shaken), `${id}, seed ${String(seed)}`).toMatchObject({ counted: false, part: T.still.part });
      }
    }
  });

  test("a duck with no standing start is asked for one", () => {
    const frames = sequence(need(GOOD.duck)).slice(20);
    expect(frames.length).toBeLessThan(20);
    expect(judgeRep(moveOf("duck"), frames).part).toBe(T.stance.part);
  });

  test("with the baseline from calibration passed in, the same frames count", () => {
    const all = sequence(need(GOOD.duck));
    expect(judgeRep(moveOf("duck"), all.slice(20), baselineOf(all.slice(0, 20)))).toMatchObject({ counted: true, tip: null });
  });

  test("frames with a broken time are left out, not thrown on", () => {
    const frames = [...sequence(need(GOOD.jab)), { ...need(standing()[0]), t: Number.NaN }];
    expect(judgeRep(moveOf("jab"), frames).counted).toBe(true);
  });
});

describe("the tips", () => {
  test("are one line of at most 90 characters, with a part name of at most 20", () => {
    for (const [key, say] of Object.entries(PRACTICE_TIPS)) {
      expect(say.tip.length, key).toBeGreaterThan(0);
      expect(say.tip.length, key).toBeLessThanOrEqual(90);
      expect(say.part.length, key).toBeLessThanOrEqual(20);
      expect(say.tip, key).not.toMatch(/\n/);
    }
    expect(PRAISE.length).toBeLessThanOrEqual(90);
  });

  test("all but seven tips are reached by an attempt above", () => {
    const reached = new Set(WEAK.map(([, , say]) => say.tip));
    reached.add(T.camera.tip).add(T.stance.tip).add(T.still.tip);
    const never = Object.entries(PRACTICE_TIPS).filter(([, say]) => !reached.has(say.tip)).map(([key]) => key);
    expect(never.sort()).toEqual(["drop", "finish", "kneeFold", "riseBend", "sweepLevel", "sweepOpen", "sweepOut"]);
  });

  test("nineteen moves have their own table and seven get the tip for their kind", () => {
    expect(TABLED_MOVES.every((id) => MOVES.has(id))).toBe(true);
    expect([...MOVES.keys()].filter((id) => !TABLED_MOVES.includes(id)).sort()).toEqual(
      ["aegis_push", "jump", "moon_arrow", "stake_thrust", "sun_burst", "swift_dash", "trident_sweep"],
    );
  });
});

const hit = (quality: number, say?: PracticeTip): RepResult => ({
  counted: true, quality, peak: 1, tip: say?.tip ?? null, part: say?.part ?? null,
});
const miss = (say: PracticeTip = T.reach): RepResult => ({ counted: false, quality: 0, peak: 0.2, tip: say.tip, part: say.part });
const short = (lines: readonly string[]): void => {
  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(lines.length).toBeLessThanOrEqual(3);
  for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(120);
};

describe("summarise", () => {
  test("all good", () => {
    const sum = summarise(Array.from({ length: REPS }, (_, index) => hit(index === 2 ? 0.95 : 0.8)));
    expect(sum).toMatchObject({ total: 10, counted: 10, bestQuality: 0.95, bestRep: 3, trend: "steady", part: null, tip: null });
    expect(sum.meanQuality).toBeCloseTo(0.815);
    expect(sum.lines).toEqual(["10 of 10 counted. Your best was your 3rd.", PRAISE]);
    short(sum.lines);
  });

  test("all missed", () => {
    const sum = summarise(Array.from({ length: REPS }, () => miss()));
    expect(sum).toMatchObject({ total: 10, counted: 0, meanQuality: 0, bestQuality: 0, bestRep: null, trend: "steady", part: "reach" });
    expect(sum.lines).toEqual([
      "None of your 10 counted yet. Slow down and make each one clear.",
      `Work on reach: ${T.reach.tip}`,
    ]);
    short(sum.lines);
  });

  test("improving", () => {
    const sum = summarise([miss(), miss(), miss(T.height), hit(0.5, T.reach), hit(0.6), hit(0.7), hit(0.7), hit(0.9), hit(0.8), hit(0.8)]);
    expect(sum).toMatchObject({ counted: 7, bestRep: 8, trend: "improving", part: "reach", tip: T.reach.tip });
    expect(sum.lines).toEqual([
      "7 of 10 counted. Your best was your 8th.",
      "You got better as you went: your second half was stronger than your first.",
      `Work on reach: ${T.reach.tip}`,
    ]);
    short(sum.lines);
  });

  test("tiring", () => {
    const sum = summarise([hit(0.9), hit(0.9), hit(0.8), hit(0.8), hit(0.7), hit(0.6, T.snap), miss(T.snap), miss(T.snap), miss(T.reach), miss(T.reach)]);
    expect(sum).toMatchObject({ counted: 6, bestRep: 1, trend: "tiring", part: "speed" });
    expect(sum.lines[1]).toBe("Your first half was stronger. Rest for a moment, then go again.");
    short(sum.lines);
  });

  test("what is not the player's doing is not called something to work on", () => {
    const sum = summarise(Array.from({ length: REPS }, () => miss(T.feet)));
    expect(sum.lines.at(-1)).toBe(T.feet.tip);
  });

  test("the longest tip still fits a line, for every tip there is", () => {
    for (const say of Object.values(PRACTICE_TIPS)) short(summarise(Array.from({ length: REPS }, () => miss(say))).lines);
    short(summarise(Array.from({ length: 23 }, (_, index) => hit(index === 22 ? 1 : 0.1, T.kickStraight))).lines);
  });

  test("no repetitions, one, and a broken quality are safe", () => {
    expect(summarise([])).toMatchObject({ total: 0, counted: 0, meanQuality: 0, bestRep: null, trend: "steady" });
    short(summarise([]).lines);
    expect(summarise([hit(0.8)])).toMatchObject({ counted: 1, bestRep: 1, trend: "steady" });
    expect(summarise([hit(Number.NaN), hit(0.6)])).toMatchObject({ meanQuality: 0.3, bestRep: 2 });
  });

  test("sums up real judged repetitions", () => {
    const jab = moveOf("jab");
    const weak = need(WEAK[0])[3];
    const reps = Array.from({ length: REPS }, (_, index) => judgeRep(jab, index < 3 ? weak : sequence(need(GOOD.jab))));
    const sum = summarise(reps);
    expect(sum).toMatchObject({ counted: 7, trend: "improving", part: "reach" });
    short(sum.lines);
  });
});

describe("a practice", () => {
  test("is ten repetitions, then done, and takes no more", () => {
    let state = startPractice("jab");
    expect(state).toEqual({ moveId: "jab", reps: [], done: false });
    for (let index = 0; index < REPS; index++) {
      expect(state.done).toBe(false);
      state = nextRep(state, index % 2 === 0 ? KEYBOARD_REP : miss());
    }
    expect(state.done).toBe(true);
    expect(state.reps).toHaveLength(10);
    expect(nextRep(state, KEYBOARD_REP)).toBe(state);
    expect(summarise(state.reps).counted).toBe(5);
  });

  test("does not change the state it was given", () => {
    const start = startPractice("block");
    nextRep(start, KEYBOARD_REP);
    expect(start.reps).toEqual([]);
  });
});
