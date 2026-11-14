// Spear thrust: both fists driven out together are one thrust; one hand alone, or both pushed half way, is not.
import { expect, test } from "vitest";
import { LEFT_OUT, READY, RIGHT_OUT, STANDING, blend, others, play, pose, recording, thrown } from "../poseFixture";

const LEFT = pose(LEFT_OUT, READY);
const BOTH = pose({ ...LEFT_OUT, ...RIGHT_OUT }, READY);

/** Hands up, a beat, both fists out in four frames, a short hang, back to the chest, then a wait. */
const thrust = play(recording([[READY, 300], [READY, 200], [BOTH, 132], [BOTH, 100], [READY, 200], [READY, 600]]));

test("both fists driven out together from the chest and pulled back are exactly one spear thrust", () => {
  expect(thrown(thrust, "spear_thrust")).toBe(1);
});

test("the left fist alone, a jab, is not a spear thrust", () => {
  const jab = play(recording([[READY, 300], [READY, 200], [LEFT, 132], [LEFT, 66], [READY, 200], [READY, 600]]));
  expect(thrown(jab, "spear_thrust")).toBe(0);
});

test("both hands pushed half way, stopping with the elbows still bent at 120 degrees, are not a spear thrust", () => {
  const short = play(recording([[READY, 300], [READY, 200], [blend(READY, BOTH, 0.55), 132], [READY, 200], [READY, 600]]));
  expect(thrown(short, "spear_thrust")).toBe(0);
});

test("both straight arms raised slowly to shoulder height are not a spear thrust", () => {
  const arms = pose({ ...LEFT_OUT, ...RIGHT_OUT });
  const raise = play(recording([[arms, 1000], [arms, 300], [STANDING, 600]]));
  expect(thrown(raise, "spear_thrust")).toBe(0);
});

test("no other base move fires when both fists go out on the same frame", () => {
  expect(others(thrust, "spear_thrust")).toEqual([]);
});

// Fails today: a jab is thrown one frame before the spear thrust. The jab only checks that the right arm is not
// straight yet, so whichever arm straightens first, even 33 ms early, is read as a punch of its own.
test.fails("no other base move fires when the left fist arrives one frame ahead of the right", () => {
  const leftLeads = play(
    recording([
      [READY, 300], [READY, 200],
      [blend(READY, LEFT, 0.25), 33], [blend(LEFT, BOTH, 0.75), 99], [BOTH, 33],
      [BOTH, 100], [READY, 200], [READY, 600],
    ]),
  );
  expect(thrown(leftLeads, "spear_thrust")).toBe(1);
  expect(others(leftLeads, "spear_thrust")).toEqual([]);
});
