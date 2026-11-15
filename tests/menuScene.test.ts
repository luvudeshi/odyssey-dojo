import { expect, test } from "vitest";
import { pointerOffset } from "../src/screens/MenuScene";

test("the menu scene follows the pointer by at most half a window either way", () => {
  expect(pointerOffset(720, 1440)).toBe(0);
  expect(pointerOffset(0, 1440)).toBe(-0.5);
  expect(pointerOffset(1440, 1440)).toBe(0.5);
  expect(pointerOffset(5000, 1440)).toBe(0.5);
  expect(pointerOffset(-40, 1440)).toBe(-0.5);
  expect(pointerOffset(10, 0)).toBe(0);
});
