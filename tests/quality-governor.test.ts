// The quality governor drops to low only when a window of frames has too many slow ones.
import { expect, test } from "vitest";
import { EMPTY_WINDOW, governorStep } from "../src/render/qualityGovernor";
import type { FrameWindow } from "../src/render/qualityGovernor";

function run(deltas: readonly number[]): boolean {
  let window: FrameWindow = EMPTY_WINDOW;
  for (const delta of deltas) {
    const step = governorStep(window, delta);
    window = step.window;
    if (step.drop) return true;
  }
  return false;
}

test("steady 60 fps never drops", () => {
  expect(run(Array.from({ length: 600 }, () => 16.7))).toBe(false);
});

test("a couple of hitches in a window do not drop", () => {
  expect(run(Array.from({ length: 200 }, (_, i) => (i === 20 || i === 120 ? 90 : 16.7)))).toBe(false);
});

test("a camera and GPU fight with every third frame at 33 ms for two windows drops", () => {
  expect(run(Array.from({ length: 600 }, (_, i) => (i % 3 === 0 ? 33.4 : 16.7)))).toBe(true);
});

test("one slow window alone does not drop, then a healthy window forgets it", () => {
  const slowSecond = Array.from({ length: 180 }, (_, i) => (i % 3 === 0 ? 33.4 : 16.7));
  const healthy = Array.from({ length: 200 }, () => 16.7);
  expect(run([...slowSecond.slice(0, 120), ...healthy, ...slowSecond.slice(0, 120), ...healthy])).toBe(false);
});

test("a pause gap is ignored and restarts the window", () => {
  expect(governorStep({ frames: 50, slow: 50, ms: 2000, bad: 1 }, 5000)).toEqual({ window: EMPTY_WINDOW, drop: false });
});
