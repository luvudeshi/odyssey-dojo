// Block: both fists at the face count for as long as they stay there; hands at the chest or one fist up do not.
import { expect, test } from "vitest";
import { READY, STANDING, longestHold, others, play, pose, recording } from "../poseFixture";

/** Elbows tucked in front of the ribs, a fist either side of the chin. */
const GUARD = pose({
  leftUpper: [0, 0.4, -0.9], leftFore: [0.35, -0.9, 0.2],
  rightUpper: [0, 0.4, -0.9], rightFore: [-0.35, -0.9, 0.2],
});

/**
 * Hands to the chest, fists up to the face, held for half a second, back down the same way. Going by way of the
 * chest keeps the forearms in front of the body: turned straight from hanging to the guard they would pass through it.
 */
const block = play(
  recording([[READY, 200], [GUARD, 150], [GUARD, 500], [READY, 150], [STANDING, 200], [STANDING, 300]]),
);

test("fists brought up to the face are a block for as long as they stay there", () => {
  expect(longestHold(block, "block")).toBeGreaterThanOrEqual(500);
  expect(block.at(-1)?.held).toEqual([]);
});

test("hands held at the chest are not a block", () => {
  const chest = play(recording([[READY, 300], [READY, 500], [STANDING, 300]]));
  expect(longestHold(chest, "block")).toBe(0);
});

test("one fist at the face with the other hand left at the chest is not a block", () => {
  const oneFist = pose({ leftUpper: GUARD.leftUpper, leftFore: GUARD.leftFore }, READY);
  const half = play(recording([[READY, 200], [oneFist, 150], [oneFist, 500], [READY, 150], [STANDING, 200]]));
  expect(longestHold(half, "block")).toBe(0);
});

test("no other base move fires while the guard goes up, is held and comes down", () => {
  expect(others(block, "block")).toEqual([]);
});
