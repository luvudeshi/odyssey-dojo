// The stake thrust must fire on the full motion and on nothing that merely looks like part of it.
import { expect, test } from "vitest";
import type { PoseFrame, PoseHistory } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { createPoseInput } from "../src/input/poseInput";
import { MOVES } from "../src/moves/registry";
import { move as stake } from "../src/moves/defs/stakeThrust";
import { EMPTY_HISTORY, JOINT, pushFrame } from "../src/pose/signals";
import { frameAt } from "./poseFixture";

const J = JOINT;

/** Both hands together at the chest, elbows bent. */
const chest = (t: number): PoseFrame =>
  frameAt(
    t,
    { [J.leftWrist]: [0.48, 0.42], [J.rightWrist]: [0.52, 0.42], [J.leftElbow]: [0.38, 0.47], [J.rightElbow]: [0.62, 0.47] },
    {
      [J.leftElbow]: [-0.3, -0.3, -0.05], [J.rightElbow]: [0.3, -0.3, -0.05],
      [J.leftWrist]: [-0.03, -0.35, -0.2], [J.rightWrist]: [0.03, -0.35, -0.2],
    },
  );

/** Both hands together, arms straight, driven forward and down. */
const down = (t: number): PoseFrame =>
  frameAt(
    t,
    { [J.leftWrist]: [0.48, 0.56], [J.rightWrist]: [0.52, 0.56], [J.leftElbow]: [0.45, 0.46], [J.rightElbow]: [0.55, 0.46] },
    {
      [J.leftElbow]: [-0.12, -0.33, -0.25], [J.rightElbow]: [0.12, -0.33, -0.25],
      [J.leftWrist]: [-0.03, -0.15, -0.5], [J.rightWrist]: [0.03, -0.15, -0.5],
    },
  );

function standing(): PoseHistory {
  let history = EMPTY_HISTORY;
  for (let i = 0; i < 20; i++) history = pushFrame(history, frameAt(i * 33));
  return history;
}

test("hands from chest to forward-and-down is one stake thrust", () => {
  const read = createPoseInput(new Map([[stake.id, stake]]));
  let history = standing();
  expect(read(history).struck).toEqual([]);
  history = pushFrame(history, chest(700));
  expect(read(history).struck).toEqual([]);
  history = pushFrame(history, down(950));
  expect(read(history).struck.map((strike) => strike.move)).toEqual(["stake_thrust"]);
  expect(read(pushFrame(history, down(990))).struck).toEqual([]);
});

test("standing still, hands at the chest, or hands held low without a windup do not fire", () => {
  expect(stake.detect(standing())).toBe(0);
  expect(stake.detect(pushFrame(standing(), chest(700)))).toBe(0);
  let low = standing();
  for (let t = 700; t < 2600; t += 100) low = pushFrame(low, down(t));
  expect(stake.detect(low)).toBe(0);
});

test("a slow drive still counts, but a windup from long ago does not", () => {
  const slow = pushFrame(pushFrame(standing(), chest(700)), down(1350));
  expect(stake.detect(slow)).toBe(1);
  const stale = pushFrame(pushFrame(standing(), chest(700)), down(1600));
  expect(stake.detect(stale)).toBe(0);
});

test("the stake thrust is not mistaken for another strike, and a jab is not a stake thrust", () => {
  const read = createPoseInput(MOVES);
  const thrust = pushFrame(pushFrame(standing(), chest(700)), down(950));
  expect(read(thrust).struck.map((strike) => strike.move)).toEqual(["stake_thrust"]);

  const bent = frameAt(700, {}, { [J.leftElbow]: [-0.3, -0.35, 0], [J.leftWrist]: [-0.2, -0.45, -0.05] });
  const straight = frameAt(900, {}, { [J.leftElbow]: [-0.2, -0.5, -0.3], [J.leftWrist]: [-0.2, -0.5, -0.6] });
  expect(stake.detect(pushFrame(pushFrame(standing(), bent), straight))).toBe(0);
});

test("a fast, full drive rates higher than a slow, shallow one, and both stay in range", () => {
  const fast = pushFrame(pushFrame(standing(), chest(700)), down(900));
  const slow = pushFrame(pushFrame(standing(), chest(700)), down(1380));
  const fastQuality = stake.quality?.(fast) ?? -1;
  const slowQuality = stake.quality?.(slow) ?? -1;
  expect(fastQuality).toBeGreaterThan(slowQuality);
  for (const value of [fastQuality, slowQuality]) {
    expect(value).toBeGreaterThanOrEqual(0.4);
    expect(value).toBeLessThanOrEqual(1);
  }
  expect(stake.quality?.(EMPTY_HISTORY)).toBe(0);
});

test("Polyphemus is finished with the stake, and it is a real strike with its own key", () => {
  expect(ENEMIES.find((enemy) => enemy.id === "polyphemus")?.finisher).toBe("stake_thrust");
  expect(MOVES.get("stake_thrust")?.kind).toBe("strike");
  const keys = [...MOVES.values()].map((move) => move.key);
  expect(keys.filter((key) => key === stake.key)).toHaveLength(1);
});
