// Double palm against block. tests/moves/detectors.test.ts lists this pair as a known confusion and leaves it out:
// block reads about 0.35 for a few frames before the arms straighten (wrists near the nose).
// This holds the pair to the real limit instead: under the 0.7 the game needs to hold a defend
// (ON in src/input/poseInput.ts), or every double palm would also raise a block.
import { expect, test } from "vitest";
import { MOVES } from "../../src/moves/registry";
import type { Key } from "../helpers/poses";
import { COCKED, DOWN, PALM, peak, pose, sequence } from "../helpers/poses";

const DEFEND_HOLD = 0.7;

/** The same double palm tests/moves/detectors.test.ts uses: both fists to the shoulders, then both palms out. */
const DOUBLE_PALM: Key[] = [
  { t: 0, pose: pose(DOWN) },
  { t: 150, pose: pose(COCKED, COCKED) },
  { t: 300, pose: pose(PALM, PALM) },
];

function detectorOf(id: string) {
  const move = MOVES.get(id);
  if (!move) throw new Error(`no move ${id}`);
  return move.detect;
}

test("the sequence is a double palm", () => {
  expect(peak(detectorOf("double_palm"), sequence(DOUBLE_PALM))).toBeGreaterThan(0.6);
});

test("a double palm stays under the block hold threshold", () => {
  expect(peak(detectorOf("block"), sequence(DOUBLE_PALM))).toBeLessThan(DEFEND_HOLD);
});
