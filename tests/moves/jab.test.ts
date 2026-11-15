// Jab: the left fist snapped out from the chest is one jab; a raised, half-pushed or slowly reached arm is not.
import { expect, test } from "vitest";
import { folding } from "../../src/moves/handSignals";
import { EMPTY_HISTORY, pushFrame } from "../../src/pose/signals";
import { LEFT_OUT, READY, RIGHT_OUT, STANDING, blend, others, play, pose, recording, thrown } from "../poseFixture";

const OUT = pose(LEFT_OUT, READY);

/** Hands up, a beat, the left fist out in four frames, a short hang, back to the chest, then a wait. */
const jab = play(recording([[READY, 300], [READY, 200], [OUT, 132], [OUT, 66], [READY, 200], [READY, 600]]));

test("the left fist snapped out from the chest and pulled back is exactly one jab", () => {
  expect(thrown(jab, "jab")).toBe(1);
});

test("a straight left arm raised over three seconds is not a jab", () => {
  const raise = play(recording([[pose(LEFT_OUT), 3000], [pose(LEFT_OUT), 300], [STANDING, 600]]));
  expect(thrown(raise, "jab")).toBe(0);
});

test("a short push that stops with the elbow still bent at 120 degrees still counts as a jab (rough form counts)", () => {
  const short = play(recording([[READY, 300], [READY, 200], [blend(READY, OUT, 0.55), 132], [READY, 200], [READY, 600]]));
  expect(thrown(short, "jab")).toBe(1);
});

test("no other base move fires during a jab", () => {
  expect(others(jab, "jab")).toEqual([]);
});

test("a right-hand punch is not a jab: left and right stay distinct", () => {
  const right = pose(RIGHT_OUT, READY);
  const punch = play(recording([[READY, 300], [READY, 200], [right, 132], [right, 66], [READY, 200], [READY, 600]]));
  expect(thrown(punch, "jab")).toBe(0);
  expect(thrown(punch, "cross")).toBe(1);
});

test("an arm folding up is not a punch: folding reads a closing elbow, not a held or opening one", () => {
  const fold = (steps: Parameters<typeof recording>[0]) => recording(steps).reduce(pushFrame, EMPTY_HISTORY);
  expect(folding(fold([[OUT, 100], [READY, 120]]), "left")).toBe(true);
  expect(folding(fold([[READY, 100], [OUT, 120]]), "left")).toBe(false);
  expect(folding(fold([[OUT, 100], [OUT, 120]]), "left")).toBe(false);
});

test("a straight arm swung backward is not a jab or a cross", () => {
  const back = pose({ leftUpper: [0, 0.64, 0.77], leftFore: [0, 0.64, 0.77], rightUpper: [0, 0.64, 0.77], rightFore: [0, 0.64, 0.77] });
  const swing = play(recording([[READY, 300], [back, 400], [back, 200], [READY, 400], [READY, 600]]));
  expect(thrown(swing, "jab")).toBe(0);
  expect(thrown(swing, "cross")).toBe(0);
});
