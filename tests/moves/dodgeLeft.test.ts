// Dodge left: a step or a lean to the player's own left counts while they stay there; a small sway does not.
import { expect, test } from "vitest";
import { READY, longestHold, others, play, pose, recording } from "../poseFixture";

/** A 20 cm step to the left with the shoulders leaning 10 cm further. */
const STEPPED = pose({ step: -0.2, lean: -0.1 }, READY);
const LEANED = pose({ lean: -0.2 }, READY);

/** Hands up, across in 200 ms, half a second there, back to the middle. */
const dodge = play(recording([[READY, 300], [STEPPED, 200], [STEPPED, 500], [READY, 300], [READY, 300]]));

test("a step to the left is a dodge left for as long as the player stays there", () => {
  expect(longestHold(dodge, "dodge_left")).toBeGreaterThanOrEqual(500);
  expect(dodge.at(-1)?.held).toEqual([]);
});

test("leaning the shoulders 20 cm left without moving the feet counts too", () => {
  const lean = play(recording([[READY, 300], [LEANED, 200], [LEANED, 500], [READY, 300]]));
  expect(longestHold(lean, "dodge_left")).toBeGreaterThanOrEqual(500);
});

test("an 8 cm sway to the left, a shift of weight, is not a dodge", () => {
  const swayed = pose({ lean: -0.08 }, READY);
  const sway = play(recording([[READY, 300], [swayed, 200], [swayed, 500], [READY, 200]]));
  expect(longestHold(sway, "dodge_left")).toBe(0);
});

test("no other base move fires while dodging left and coming back", () => {
  expect(others(dodge, "dodge_left")).toEqual([]);
});
