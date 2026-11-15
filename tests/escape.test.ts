// A dead webcam must never soft-lock the game: calibration says what is wrong and offers the keyboard, and keys take over from a pause.
import { expect, test } from "vitest";
import { CALIBRATION_GIVE_UP_MS, calibrationNeedsHelp, calibrationStalled, keyboardTakesOver } from "../src/pose/escape";

const idle = { held: new Set<string>(), struck: [] };

test("calibration counts as stalled only after the wait", () => {
  expect(calibrationStalled(CALIBRATION_GIVE_UP_MS - 1)).toBe(false);
  expect(calibrationStalled(CALIBRATION_GIVE_UP_MS)).toBe(true);
});

test("a stalled calibration asks the player to step back, and never skips by itself", () => {
  expect(calibrationNeedsHelp(CALIBRATION_GIVE_UP_MS - 1, false)).toBe(false);
  expect(calibrationNeedsHelp(CALIBRATION_GIVE_UP_MS, false)).toBe(true);
  expect(calibrationNeedsHelp(CALIBRATION_GIVE_UP_MS * 3, true)).toBe(false);
});

test("an idle keyboard does not take over, a strike or held key during a pause does", () => {
  expect(keyboardTakesOver(false, true, idle)).toBe(false);
  expect(keyboardTakesOver(false, false, { held: new Set(["block"]), struck: [] })).toBe(false);
  expect(keyboardTakesOver(false, true, { held: new Set(["block"]), struck: [] })).toBe(true);
  expect(keyboardTakesOver(false, true, { held: new Set(), struck: [{ move: "x", quality: 0.7, player: 0 }] })).toBe(true);
  expect(keyboardTakesOver(true, false, idle)).toBe(true);
});
