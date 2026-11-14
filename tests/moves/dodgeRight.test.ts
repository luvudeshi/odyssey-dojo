// Dodge right: a step or a lean to the player's own right counts while they stay there; a small sway does not.
import { expect, test } from "vitest";
import { READY, longestHold, others, play, pose, recording, thrown } from "../poseFixture";

/** A 20 cm step to the right with the shoulders leaning 10 cm further. */
const STEPPED = pose({ step: 0.2, lean: 0.1 }, READY);
const LEANED = pose({ lean: 0.2 }, READY);

/** Hands up, across in 200 ms, half a second there, back to the middle. */
const dodge = play(recording([[READY, 300], [STEPPED, 200], [STEPPED, 500], [READY, 300], [READY, 300]]));

test("a step to the right is a dodge right for as long as the player stays there", () => {
  expect(longestHold(dodge, "dodge_right")).toBeGreaterThanOrEqual(500);
  expect(dodge.at(-1)?.held).toEqual([]);
});

test("leaning the shoulders 20 cm right without moving the feet counts too", () => {
  const lean = play(recording([[READY, 300], [LEANED, 200], [LEANED, 500], [READY, 300]]));
  expect(longestHold(lean, "dodge_right")).toBeGreaterThanOrEqual(500);
});

test("an 8 cm sway to the right, a shift of weight, is not a dodge", () => {
  const swayed = pose({ lean: 0.08 }, READY);
  const sway = play(recording([[READY, 300], [swayed, 200], [swayed, 500], [READY, 200]]));
  expect(longestHold(sway, "dodge_right")).toBe(0);
});

test("no other base move fires while dodging right and coming back", () => {
  expect(others(dodge, "dodge_right")).toEqual([]);
});

// The left fist rides across the picture with the body, which is the motion the hook looks for.
test("a 30 cm step right in 200 ms with the elbows half bent and the fists by the collarbones is not a hook", () => {
  const loose = pose({
    leftUpper: [-0.3, 0.6, -0.5], leftFore: [0.5, -0.6, -0.5],
    rightUpper: [0.3, 0.6, -0.5], rightFore: [-0.5, -0.6, -0.5],
  });
  const across = pose({ step: 0.3 }, loose);
  const quick = play(recording([[loose, 300], [across, 200], [across, 400], [loose, 300]]));
  expect(longestHold(quick, "dodge_right")).toBeGreaterThanOrEqual(400);
  expect(thrown(quick, "hook")).toBe(0);
});
