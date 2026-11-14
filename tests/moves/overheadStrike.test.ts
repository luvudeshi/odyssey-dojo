// Overhead strike: the right hand cocked over the head and chopped down is one strike; a chop from the chin or a hand lowered gently is not.
import { expect, test } from "vitest";
import { READY, others, play, pose, recording, thrown } from "../poseFixture";

/** Right elbow above the shoulder, hand tipped back over the head. */
const COCKED = pose({ rightUpper: [0.3, -1, -0.1], rightFore: [-0.3, -0.5, 0.8] }, READY);
/** Right arm straight up, hand well above the head. */
const RAISED = pose({ rightUpper: [0.2, -1, -0.1], rightFore: [-0.1, -1, -0.2] }, READY);
/** Right arm out in front, the hand at chest height: the end of the chop. */
const CHOPPED = pose({ rightUpper: [-0.1, 0.3, -1], rightFore: [0, 0.5, -1] }, READY);

/** Hands up, the right hand cocked over the head, a beat, the chop in five frames, a short hang, back to the chest. */
const strike = play(
  recording([[READY, 300], [COCKED, 300], [COCKED, 100], [CHOPPED, 165], [CHOPPED, 100], [READY, 200], [READY, 600]]),
);

test("the right hand cocked over the head and chopped down is exactly one overhead strike", () => {
  expect(thrown(strike, "overhead_strike")).toBe(1);
});

test("a chop that starts with the hand at the chin, never over the head, is not an overhead strike", () => {
  const chin = pose({ rightUpper: [0.1, 0.3, -1], rightFore: [-0.2, -1, -0.2] }, READY);
  const chop = play(recording([[READY, 300], [chin, 200], [CHOPPED, 165], [CHOPPED, 100], [READY, 200], [READY, 600]]));
  expect(thrown(chop, "overhead_strike")).toBe(0);
});

test("a hand raised over the head and kept there is not an overhead strike", () => {
  const up = play(recording([[READY, 300], [RAISED, 300], [RAISED, 1000]]));
  expect(thrown(up, "overhead_strike")).toBe(0);
});

// Fails today: the detector only asks that the right wrist was above the nose at some point in the last 500 ms and
// is below the shoulder now. Those two heights are about 25 cm apart, so a hand only has to cover that stretch in
// half a second. Lowered from overhead to the chest at a steady pace, it still fires when the whole way takes 1.5 s.
test.fails("a raised hand lowered to the chest at an easy pace, over a full second, is not an overhead strike", () => {
  const lowered = play(recording([[READY, 300], [RAISED, 300], [RAISED, 300], [READY, 1000], [READY, 600]]));
  expect(thrown(lowered, "overhead_strike")).toBe(0);
});

// Fails today: a cross is thrown one frame after the overhead strike. The chop takes the right arm from bent to
// straight and ends within 30 cm of shoulder height, which is all armThrust asks of a punch.
test.fails("no other base move fires during an overhead strike", () => {
  expect(others(strike, "overhead_strike")).toEqual([]);
});
