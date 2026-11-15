// The tip for a strike prompt that ran out with nothing counted. Bodies from tests/helpers/poses.ts: none was
// recorded from a camera.
import { describe, expect, test } from "vitest";
import { STILL_TIP, strikeMissTip } from "../src/coach/extra/strikeMissTip";
import { FEEDBACK_RULES, TIP_MAX } from "../src/coach/extra/strikeFeedback";
import type { PoseFrame, PoseHistory } from "../src/core/types";
import { MOVES } from "../src/moves/registry";
import { JOINT } from "../src/pose/signals";
import { COCKED, DOWN, HOOK_IN, HOOK_OUT, NEUTRAL, PUNCH, histories, pose, sequence, standing } from "./helpers/poses";
import type { Key, Pose } from "./helpers/poses";

const left = (arm: Pose["left"]): Pose => pose(arm, DOWN);
const right = (arm: Pose["right"]): Pose => pose(DOWN, arm);
/** The fight's history (the last second) as the prompt runs out, a moment after the keys end. */
function played(keys: readonly Key[], edit: (frame: PoseFrame) => PoseFrame = (frame) => frame): PoseHistory {
  const end = keys.at(-1);
  const all = end ? [...keys, { t: end.t + 300, pose: end.pose }] : keys;
  const history = histories(sequence(all).map(edit)).at(-1);
  if (!history) throw new Error("no frames");
  return history;
}
const STRIKE_IDS = Object.keys(FEEDBACK_RULES).filter((id) => MOVES.get(id)?.kind === "strike").sort();

describe("a strike that never came says what the body did", () => {
  test("nothing moved", () => {
    expect(strikeMissTip("jab", histories(standing(1500)).at(-1))).toBe(STILL_TIP);
    expect(strikeMissTip("cross", played([{ t: 0, pose: NEUTRAL }, { t: 900, pose: NEUTRAL }]))).toBe(STILL_TIP);
  });

  test("the other hand", () => {
    const cross = played([{ t: 0, pose: NEUTRAL }, { t: 150, pose: right(COCKED) }, { t: 300, pose: right(PUNCH) }]);
    expect(strikeMissTip("jab", cross)).toBe("Other hand: left jab");
    const jab = played([{ t: 0, pose: NEUTRAL }, { t: 150, pose: left(COCKED) }, { t: 300, pose: left(PUNCH) }]);
    expect(strikeMissTip("cross", jab)).toBe("Other hand: right cross");
  });

  test("another strike", () => {
    const hook = played([{ t: 0, pose: left(HOOK_OUT) }, { t: 100, pose: left(HOOK_OUT) }, { t: 250, pose: left(HOOK_IN) }]);
    expect(strikeMissTip("jab", hook)).toBe("Jab, not hook");
  });

  test("an arm pulled back but never thrown: extend it", () => {
    const cocked = played([{ t: 0, pose: NEUTRAL }, { t: 300, pose: left(COCKED) }, { t: 700, pose: left(COCKED) }]);
    expect(strikeMissTip("jab", cocked)).toBe("Extend your arm fully");
  });

  test.each(STRIKE_IDS)("%s with a moving body gets a tip that fits", (id) => {
    const tip = strikeMissTip(id, played([{ t: 0, pose: NEUTRAL }, { t: 300, pose: left(COCKED) }, { t: 700, pose: right(COCKED) }]));
    if (id === "front_kick" || id === "knee") return expect(tip).toBeNull();
    expect(tip).toBeTruthy();
    expect(tip?.length).toBeLessThanOrEqual(TIP_MAX);
  });
});

describe("with no body to read", () => {
  test("keyboard, unknown move, no frames", () => {
    expect(strikeMissTip("jab", null)).toBeNull();
    expect(strikeMissTip("jab", undefined)).toBeNull();
    expect(strikeMissTip("jab", { frames: [], baseline: null })).toBeNull();
    expect(strikeMissTip("not_a_move", played([{ t: 0, pose: NEUTRAL }, { t: 300, pose: left(PUNCH) }]))).toBeNull();
  });

  test("shoulders not seen", () => {
    const dim = (frame: PoseFrame): PoseFrame => ({
      ...frame,
      image: frame.image.map((point, index) => (index === JOINT.leftShoulder || index === JOINT.rightShoulder ? { ...point, visibility: 0.1 } : point)),
    });
    expect(strikeMissTip("jab", played([{ t: 0, pose: NEUTRAL }, { t: 300, pose: left(PUNCH) }], dim))).toBeNull();
  });

  test("a kick with the legs out of view: no tip about legs", () => {
    expect(strikeMissTip("front_kick", played([{ t: 0, pose: NEUTRAL }, { t: 300, pose: left(COCKED) }]))).toBeNull();
  });
});
