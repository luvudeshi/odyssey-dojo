// Hook: the bent left arm whipped across the body is one hook; the same path taken slowly, or with a straight arm, is not.
import { expect, test } from "vitest";
import { READY, others, play, pose, recording, thrown } from "../poseFixture";

/** Elbow out to the left at shoulder height, forearm pointing at the camera. */
const LOADED = pose({ leftUpper: [-1, 0.15, -0.3], leftFore: [0.1, -0.1, -1] }, READY);
/** Elbow swung to the front, forearm lying across the chest: the fist has crossed the body. */
const ACROSS = pose({ leftUpper: [0.3, 0, -1], leftFore: [1, 0, -0.15] }, READY);

/** Hands up, elbow lifted out, the swing in five frames, a short hang, back to the chest, then a wait. */
const hook = play(recording([[READY, 300], [LOADED, 200], [ACROSS, 165], [ACROSS, 66], [READY, 200], [READY, 600]]));

test("the bent left arm whipped across the body and pulled back is exactly one hook", () => {
  expect(thrown(hook, "hook")).toBe(1);
});

test("a less sharp hook that takes a quarter of a second still counts once", () => {
  const easy = play(recording([[READY, 300], [LOADED, 200], [ACROSS, 250], [ACROSS, 66], [READY, 200], [READY, 600]]));
  expect(thrown(easy, "hook")).toBe(1);
});

test("the same swing taking half a second, a slow sweep of the arm, is not a hook", () => {
  const sweep = play(recording([[READY, 300], [LOADED, 200], [ACROSS, 500], [ACROSS, 66], [READY, 200], [READY, 600]]));
  expect(thrown(sweep, "hook")).toBe(0);
});

test("a straight left arm swung across at the same speed, a slap, is not a hook", () => {
  const wide = pose({ leftUpper: [-1, 0, -0.2], leftFore: [-1, 0, -0.4] }, READY);
  const swung = pose({ leftUpper: [0.3, 0, -1], leftFore: [0.6, 0, -1] }, READY);
  const slap = play(recording([[READY, 300], [wide, 200], [swung, 165], [swung, 66], [READY, 200], [READY, 600]]));
  expect(thrown(slap, "hook")).toBe(0);
});

test("no other base move fires during a hook", () => {
  expect(others(hook, "hook")).toEqual([]);
});
