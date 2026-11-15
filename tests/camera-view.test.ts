// The camera panel's pure parts: skeleton maths (mirror on and off), the tracking caption and the move flash.
import { expect, test } from "vitest";
import type { Landmark, PoseFrame } from "../src/core/types";
import { FLASH_SECONDS, NO_FLASH, flashText, isTracking, nextFlash } from "../src/hud/cameraCaption";
import { skeletonLines } from "../src/hud/skeletonLines";
import { JOINT } from "../src/pose/signals";

function image(visibility = 1, overrides: Readonly<Record<number, Partial<Landmark>>> = {}): Landmark[] {
  return Array.from({ length: 33 }, (_, i) => ({ x: 0.1 + i * 0.02, y: 0.2 + i * 0.01, z: 0, visibility, ...overrides[i] }));
}

test("mirror on keeps landmark x, mirror off flips it back to the raw picture", () => {
  const lm = image();
  const on = skeletonLines(lm, true, 200, 100);
  const off = skeletonLines(lm, false, 200, 100);
  const nose = lm[JOINT.nose];
  expect(on.dots[0]?.x).toBeCloseTo((nose?.x ?? NaN) * 200);
  expect(off.dots[0]?.x).toBeCloseTo((1 - (nose?.x ?? NaN)) * 200);
  expect(on.dots[0]?.y).toBeCloseTo((nose?.y ?? NaN) * 100);
});

test("12 bones plus the neck, 13 joint dots", () => {
  const { lines, dots } = skeletonLines(image(), true, 100, 100);
  expect(lines).toHaveLength(13);
  expect(dots).toHaveLength(13);
  expect(lines.every((l) => !l.faint)).toBe(true);
});

test("limbs under 0.5 visibility are faint, the rest are not", () => {
  const { lines, dots } = skeletonLines(image(1, { [JOINT.leftWrist]: { visibility: 0.2 } }), true, 100, 100);
  expect(lines.filter((l) => l.faint)).toHaveLength(1);
  expect(dots.filter((d) => d.faint)).toHaveLength(1);
});

test("a short landmark list draws only what exists", () => {
  expect(skeletonLines([], true, 100, 100)).toEqual({ lines: [], dots: [] });
});

const frame = (t: number, visibility: number): PoseFrame => ({ t, image: image(visibility), world: [] });

test("tracking needs a fresh frame with the torso visible", () => {
  expect(isTracking(null, 0)).toBe(false);
  expect(isTracking(frame(1000, 1), 1200)).toBe(true);
  expect(isTracking(frame(1000, 1), 1600)).toBe(false);
  expect(isTracking(frame(1000, 0.2), 1100)).toBe(false);
});

test("a new strike or a newly held defend flashes its name for under a second", () => {
  const nameOf = (id: string): string => id.toUpperCase();
  const none = { held: new Set<string>(), struckMove: "", struckAt: -Infinity };
  let flash = nextFlash(NO_FLASH, none, 1, nameOf);
  expect(flashText(flash, 1)).toBe("");
  flash = nextFlash(flash, { ...none, struckMove: "jab", struckAt: 2 }, 2, nameOf);
  expect(flashText(flash, 2.1)).toBe("JAB");
  expect(flashText(flash, 2 + FLASH_SECONDS + 0.01)).toBe("");
  flash = nextFlash(flash, { held: new Set(["block"]), struckMove: "jab", struckAt: 2 }, 5, nameOf);
  expect(flashText(flash, 5.1)).toBe("BLOCK");
  flash = nextFlash(flash, { held: new Set(["block"]), struckMove: "jab", struckAt: 2 }, 6, nameOf);
  expect(flashText(flash, 6)).toBe("");
});
