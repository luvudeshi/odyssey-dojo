// The four defend moves on a worse camera than the other tests use: 1% landmark jitter, wrists and hips the tracker
// is unsure of, 15 frames a second, and a player 20% closer to or further from the lens than at calibration.
// Done right, each move stays at or above the 0.7 hold level (src/input/poseInput.ts) for the half second it is
// held; standing or waiting with the hands up, it never reaches it. Every case runs on ten seeds.
import { expect, test } from "vitest";
import type { MoveDef } from "../../src/core/types";
import { move as block } from "../../src/moves/defs/block";
import { move as dodgeLeft } from "../../src/moves/defs/dodgeLeft";
import { move as dodgeRight } from "../../src/moves/defs/dodgeRight";
import { move as duck } from "../../src/moves/defs/duck";
import { CLEAN, WRISTS_AND_HIPS, film, highest, longestAbove, lowest, type Camera } from "../helpers/noisyCamera";
import { READY, STANDING, pose, type BodyPose, type Step } from "../poseFixture";

const HOLD = 0.7;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const JITTER = 0.01;

const CAMERAS: readonly (readonly [string, Camera])[] = [
  ["1% jitter", { ...CLEAN, jitter: JITTER }],
  ["1% jitter and unsure wrists and hips", { ...CLEAN, jitter: JITTER, unsure: WRISTS_AND_HIPS }],
  ["1% jitter at 15 frames a second", { ...CLEAN, jitter: JITTER, fps: 15 }],
  ["1% jitter, 20% closer than calibration", { ...CLEAN, jitter: JITTER, scale: 1.2 }],
  ["1% jitter, 20% further than calibration", { ...CLEAN, jitter: JITTER, scale: 0.8 }],
];

/** Elbows tucked in front of the ribs, a fist either side of the chin. */
const GUARD = pose({
  leftUpper: [0, 0.4, -0.9], leftFore: [0.35, -0.9, 0.2],
  rightUpper: [0, 0.4, -0.9], rightFore: [-0.35, -0.9, 0.2],
});
/** Each move done right: a 25 cm drop, and a 20 cm step with the shoulders leaning 10 cm further. */
const DONE_RIGHT: readonly (readonly [MoveDef, BodyPose])[] = [
  [block, GUARD],
  [duck, pose({ drop: 0.25 }, READY)],
  [dodgeLeft, pose({ step: -0.2, lean: -0.1 }, READY)],
  [dodgeRight, pose({ step: 0.2, lean: 0.1 }, READY)],
];

/** Hands up, into the move in 150 ms, half a second there, back out. The move is fully made from 350 to 850 ms. */
const act = (made: BodyPose): Step[] => [[READY, 200], [made, 150], [made, 500], [READY, 150], [STANDING, 200]];
const MADE_FROM = 350;
const MADE_TO = 850;
/** Standing, then hands up at the chest for over a second: a player waiting for the next prompt. */
const NEUTRAL: Step[] = [[STANDING, 500], [READY, 300], [READY, 1200]];

/** Wrists that wander 3% of the frame take this long to average out, so an unsure block is read from this much later. */
const UNSURE_SETTLE_MS = 100;

/**
 * The worst the move does over every seed: its lowest reading while made (from `settle` ms after it is made),
 * and its shortest unbroken hold.
 */
function worst(move: MoveDef, made: BodyPose, camera: Camera, settle = 0): { low: number; held: number } {
  const runs = SEEDS.map((seed) => film((history) => move.detect(history), act(made), { ...camera, seed }));
  return {
    low: Math.min(...runs.map((run) => lowest(run, MADE_FROM + settle, MADE_TO))),
    held: Math.min(...runs.map((run) => longestAbove(run, HOLD, camera.fps))),
  };
}

/** The highest the move reads on a neutral stance over every seed. */
function neutral(move: MoveDef, camera: Camera): number {
  return Math.max(...SEEDS.map((seed) => highest(film((history) => move.detect(history), NEUTRAL, { ...camera, seed }))));
}

for (const [name, camera] of CAMERAS) {
  for (const [move, made] of DONE_RIGHT) {
    test(`${move.id} done right holds for its half second on ${name}`, () => {
      const settle = move === block && camera.unsure.length > 0 ? UNSURE_SETTLE_MS : 0;
      const { low, held } = worst(move, made, camera, settle);
      expect(low).toBeGreaterThanOrEqual(HOLD);
      expect(held).toBeGreaterThanOrEqual(500);
    });

    test(`${move.id} stays below the hold level on a neutral stance on ${name}`, () => {
      expect(neutral(move, camera)).toBeLessThan(HOLD);
    });
  }
}

// Before the fix the dodge measured the shift against the calibration shoulder width only, so from 20% further
// away a 20 cm lean read 0.67 on a perfect camera and was never held.
test("a 20 cm lean with no step is still a dodge from 20% further away on a clean camera", () => {
  const far = { ...CLEAN, scale: 0.8 };
  expect(worst(dodgeLeft, pose({ lean: -0.2 }, READY), far).low).toBeGreaterThanOrEqual(0.8);
  expect(worst(dodgeRight, pose({ lean: 0.2 }, READY), far).low).toBeGreaterThanOrEqual(0.8);
});

// Measured limits, not passes. They pin how far each move degrades so a later change cannot make it worse unseen.

// A 20 cm lean is 3 cm past the 17 cm line and 1% jitter moves a shoulder about 2.5 cm, so the hold flickers.
// Lowest reading 0.67 near and 0.62 far (0.60 and 0.43 before the fix); shortest hold 500 and 267 ms (300 and 33).
test("limit: a bare 20 cm lean on a jittery camera flickers but is held for most of the half second", () => {
  const lean = pose({ lean: -0.2 }, READY);
  const near = worst(dodgeLeft, lean, { ...CLEAN, jitter: JITTER });
  expect(near.low).toBeGreaterThanOrEqual(0.6);
  expect(near.held).toBeGreaterThanOrEqual(400);
  const far = worst(dodgeLeft, lean, { ...CLEAN, jitter: JITTER, scale: 0.8 });
  expect(far.low).toBeGreaterThanOrEqual(0.55);
  expect(far.held).toBeGreaterThanOrEqual(200);
});

// Everything at once: wrists wandering 3% of a frame that is 20% smaller, with three frames to steady them.
// Lowest reading once settled 0.67 over twenty seeds, shortest hold 333 ms (0.00 and 133 ms before the fix).
test("limit: the block on 15 frames a second, 20% further away, with unsure wrists, is held for 300 ms or more", () => {
  const camera = { ...CLEAN, jitter: JITTER, fps: 15, scale: 0.8, unsure: WRISTS_AND_HIPS };
  const { low, held } = worst(block, GUARD, camera, UNSURE_SETTLE_MS);
  expect(low).toBeGreaterThanOrEqual(0.6);
  expect(held).toBeGreaterThanOrEqual(300);
  expect(neutral(block, camera)).toBeLessThan(HOLD);
});
