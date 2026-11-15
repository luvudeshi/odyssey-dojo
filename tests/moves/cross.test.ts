// Cross: the right fist driven out from the chest is one cross; a raised or half-pushed right arm is not.
import { expect, test } from "vitest";
import { LEFT_OUT, READY, RIGHT_OUT, STANDING, blend, others, play, pose, recording, thrown } from "../poseFixture";

const OUT = pose(RIGHT_OUT, READY);

/** Hands up, a beat, the right fist out in four frames, a short hang, back to the chest, then a wait. */
const cross = play(recording([[READY, 300], [READY, 200], [OUT, 132], [OUT, 66], [READY, 200], [READY, 600]]));

test("the right fist driven out from the chest and pulled back is exactly one cross", () => {
  expect(thrown(cross, "cross")).toBe(1);
});

test("a straight right arm raised over three seconds, as if pointing at the screen, is not a cross", () => {
  const point = play(recording([[pose(RIGHT_OUT), 3000], [pose(RIGHT_OUT), 300], [STANDING, 600]]));
  expect(thrown(point, "cross")).toBe(0);
});

test("a short push that stops with the elbow still bent at 120 degrees still counts as a cross (rough form counts)", () => {
  const short = play(recording([[READY, 300], [READY, 200], [blend(READY, OUT, 0.55), 132], [READY, 200], [READY, 600]]));
  expect(thrown(short, "cross")).toBe(1);
});

// Left and right are distinct: a left-hand punch is a jab and never a cross.
test("a left-hand punch is a jab and not a cross", () => {
  const left = pose(LEFT_OUT, READY);
  const jab = play(recording([[READY, 300], [READY, 200], [left, 132], [left, 66], [READY, 200], [READY, 600]]));
  expect(thrown(jab, "cross")).toBe(0);
  expect(thrown(jab, "jab")).toBe(1);
});

test("no other base move fires during a cross", () => {
  expect(others(cross, "cross")).toEqual([]);
});
