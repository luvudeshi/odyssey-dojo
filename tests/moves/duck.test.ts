// Duck: sinking a head's height on bent knees counts while the player stays down; a small dip of the knees does not.
import { expect, test } from "vitest";
import { READY, longestHold, others, play, pose, recording } from "../poseFixture";

const CROUCH = pose({ drop: 0.25 }, READY);

/** Hands up, down 25 cm in a quarter second, half a second low, back up. */
const duck = play(recording([[READY, 300], [CROUCH, 250], [CROUCH, 500], [READY, 300], [READY, 300]]));

test("dropping 25 cm on bent knees is a duck for as long as the player stays down", () => {
  expect(longestHold(duck, "duck")).toBeGreaterThanOrEqual(500);
  expect(duck.at(-1)?.held).toEqual([]);
});

test("a 6 cm dip of the knees, the bounce of a player keeping loose, is not a duck", () => {
  const dip = pose({ drop: 0.06 }, READY);
  const bounce = play(recording([[READY, 300], [dip, 200], [dip, 500], [READY, 200]]));
  expect(longestHold(bounce, "duck")).toBe(0);
});

// The duck starts counting at a drop of a little over 11 cm; this pins that line from below.
test("a 10 cm dip held for half a second is still not a duck", () => {
  const dip = pose({ drop: 0.1 }, READY);
  const nearly = play(recording([[READY, 300], [dip, 200], [dip, 500], [READY, 200]]));
  expect(longestHold(nearly, "duck")).toBe(0);
});

test("no other base move fires while ducking and standing back up", () => {
  expect(others(duck, "duck")).toEqual([]);
});
