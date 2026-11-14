// A dead webcam must never soft-lock the game: calibration gives up, and keys take over from a pause.
import { expect, test } from "vitest";
import { CALIBRATION_GIVE_UP_MS, calibrationStalled, keyboardTakesOver } from "../src/pose/escape";

const idle = { held: new Set<string>(), struck: [] };

test("calibration gives up only after the wait", () => {
  expect(calibrationStalled(CALIBRATION_GIVE_UP_MS - 1)).toBe(false);
  expect(calibrationStalled(CALIBRATION_GIVE_UP_MS)).toBe(true);
});

test("an idle keyboard does not take over, a strike or held key during a pause does", () => {
  expect(keyboardTakesOver(false, true, idle)).toBe(false);
  expect(keyboardTakesOver(false, false, { held: new Set(["block"]), struck: [] })).toBe(false);
  expect(keyboardTakesOver(false, true, { held: new Set(["block"]), struck: [] })).toBe(true);
  expect(keyboardTakesOver(false, true, { held: new Set(), struck: [{ move: "x", quality: 0.7, player: 0 }] })).toBe(true);
  expect(keyboardTakesOver(true, false, idle)).toBe(true);
});
