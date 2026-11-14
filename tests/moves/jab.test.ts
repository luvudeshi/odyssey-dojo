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

// Fails today: armThrust only asks that the elbow was under 115 degrees at some point in the last 450 ms and is
// over 145 now. A steady reach from the chest covers those 30 degrees in a quarter of its time, so it still
// fires when the whole reach takes 1.7 s. The cross and the spear thrust share armThrust and do the same.
test.fails("the left arm reached out slowly, taking a full second, is not a jab", () => {
  const reach = play(recording([[READY, 300], [READY, 200], [OUT, 1000], [OUT, 300], [READY, 200], [READY, 600]]));
  expect(thrown(reach, "jab")).toBe(0);
});

// Fails today: the jab's confidence is 0 or 1 on the 145 degree line, so an elbow reading that wobbles between
// 150 and 142 degrees drops it below the pose input's OFF level and raises it again, and each rise is a new jab.
// Three are thrown here.
test.fails("a jab that stops just short of a locked elbow is still one jab when the tracker wobbles", () => {
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

test("no other base move fires during a jab", () => {
  expect(others(jab, "jab")).toEqual([]);
});
