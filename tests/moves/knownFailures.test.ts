// The seven detector cases from issue #81 that used to fail: near misses that must not count, and one move that must not read as two.
import { expect, test } from "vitest";
import { LEFT_OUT, READY, RIGHT_OUT, blend, others, play, pose, recording, thrown } from "../poseFixture";

/** Left arm punched straight at the camera. */
const OUT = pose(LEFT_OUT, READY);
/** Left arm straight out to the player's left at shoulder height. */
const WIDE = pose({ leftUpper: [-1, 0, -0.2], leftFore: [-1, 0, -0.4] }, READY);
/** Right elbow above the shoulder, hand tipped back over the head. */
const COCKED = pose({ rightUpper: [0.3, -1, -0.1], rightFore: [-0.3, -0.5, 0.8] }, READY);
/** Right arm straight up, hand well above the head. */
const RAISED = pose({ rightUpper: [0.2, -1, -0.1], rightFore: [-0.1, -1, -0.2] }, READY);
/** Right arm out in front, the hand at chest height: the end of the chop. */
const CHOPPED = pose({ rightUpper: [-0.1, 0.3, -1], rightFore: [0, 0.5, -1] }, READY);
/** Both fists punched straight at the camera. */
const BOTH = pose({ ...LEFT_OUT, ...RIGHT_OUT }, READY);

// A punch is a snap. A steady reach from the chest that takes a full second straightens the elbow just as far,
// but never quickly, so it must not count.
test("the left arm reached out very slowly, taking three seconds, is not a jab", () => {
  const reach = play(recording([[READY, 300], [READY, 200], [OUT, 3000], [OUT, 300], [READY, 200], [READY, 600]]));
  expect(thrown(reach, "jab")).toBe(0);
});

// An elbow reading that wobbles between about 150 and 142 degrees at the end of a punch must not drop the jab
// and raise it again: each rise would be a new jab.
test("a jab that stops just short of a locked elbow is still one jab when the tracker wobbles", () => {
  const nearly = blend(READY, OUT, 0.78);
  const wobbled = blend(READY, OUT, 0.72);
  const soft = play(
    recording([
      [READY, 300], [READY, 200], [nearly, 132],
      [wobbled, 33], [nearly, 33], [wobbled, 33], [nearly, 33], [wobbled, 33],
      [READY, 200], [READY, 600],
    ]),
  );
  expect(thrown(soft, "jab")).toBe(1);
});

// A punch goes toward the camera. An arm straightened out to the side ends with a straight elbow at shoulder
// height too, but the fist is beside the shoulder, not in front of it.
test("a straight left arm flung out to the side at shoulder height is not a jab", () => {
  const fling = play(recording([[READY, 300], [READY, 200], [WIDE, 200], [WIDE, 300], [READY, 400], [READY, 600]]));
  expect(thrown(fling, "jab")).toBe(0);
});

// Folding a sideways arm back to the chest bends the elbow and moves the fist to the player's right in the
// picture, but the fist never crosses the body, so it is not a hook.
test("a straight left arm held out to the side and pulled back to the chest in 200 ms is not a hook", () => {
  const back = play(recording([[READY, 300], [READY, 200], [WIDE, 200], [WIDE, 300], [READY, 200], [READY, 600]]));
  expect(thrown(back, "hook")).toBe(0);
});

// A chop is fast. A hand lowered from overhead to the chest at a steady pace over a full second is not one.
test("a raised hand lowered to the chest at an easy pace, over a full second, is not an overhead strike", () => {
  const lowered = play(recording([[READY, 300], [RAISED, 300], [RAISED, 300], [READY, 1000], [READY, 600]]));
  expect(thrown(lowered, "overhead_strike")).toBe(0);
});

// The chop takes the right arm from bent to straight and ends near shoulder height, which must not read as a cross.
test("no other base move fires during an overhead strike", () => {
  const strike = play(
    recording([[READY, 300], [COCKED, 300], [COCKED, 100], [CHOPPED, 165], [CHOPPED, 100], [READY, 200], [READY, 600]]),
  );
  expect(thrown(strike, "overhead_strike")).toBe(1);
  expect(others(strike, "overhead_strike")).toEqual([]);
});

// Real players throw a two-handed thrust with one fist a frame ahead. The early fist must not be read as a jab.
test("no other base move fires when the left fist arrives one frame ahead of the right", () => {
  const leftLeads = play(
    recording([
      [READY, 300], [READY, 200],
      [blend(READY, OUT, 0.25), 33], [blend(OUT, BOTH, 0.75), 99], [BOTH, 33],
      [BOTH, 100], [READY, 200], [READY, 600],
    ]),
  );
  expect(thrown(leftLeads, "spear_thrust")).toBe(1);
  expect(others(leftLeads, "spear_thrust")).toEqual([]);
});
