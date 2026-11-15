// Jab: the left fist snapped out from the chest is one jab; a raised, half-pushed or slowly reached arm is not.
import { expect, test } from "vitest";
import { LEFT_OUT, READY, STANDING, blend, others, play, pose, recording, thrown } from "../poseFixture";

const OUT = pose(LEFT_OUT, READY);

/** Hands up, a beat, the left fist out in four frames, a short hang, back to the chest, then a wait. */
const jab = play(recording([[READY, 300], [READY, 200], [OUT, 132], [OUT, 66], [READY, 200], [READY, 600]]));

test("the left fist snapped out from the chest and pulled back is exactly one jab", () => {
  expect(thrown(jab, "jab")).toBe(1);
});

test("a straight left arm raised slowly to shoulder height is not a jab", () => {
  const raise = play(recording([[pose(LEFT_OUT), 1000], [pose(LEFT_OUT), 300], [STANDING, 600]]));
  expect(thrown(raise, "jab")).toBe(0);
});

test("a short push that stops with the elbow still bent at 120 degrees is not a jab", () => {
  const short = play(recording([[READY, 300], [READY, 200], [blend(READY, OUT, 0.55), 132], [READY, 200], [READY, 600]]));
  expect(thrown(short, "jab")).toBe(0);
});

test("no other base move fires during a jab, apart from the cross (both read on either hand)", () => {
  expect(others(jab, "jab")).toEqual(["cross"]);
});
