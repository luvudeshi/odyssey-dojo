// Measured on the owner's own camera at a desk (Saturday 8:20 PM): elbows read 0.29 to 0.47 and a wrist 0.35 to 0.84,
// so with one 0.5 rule for every joint only one of the four arm segments followed him.
import { expect, test } from "vitest";
import type { PoseFrame } from "../src/core/types";
import { ARM_VISIBILITY, HOLD_MS, PoseTargets } from "../src/render/hero/track/targets";
import { frameOf, INDEX, POSES, STAND } from "./helpers/bodyPoses";
import type { LandmarkName } from "./helpers/bodyPoses";

const LEFT_ARM: readonly LandmarkName[] = ["leftElbow", "leftWrist"];

function withVisibility(frame: PoseFrame, names: readonly LandmarkName[], visibility: number): PoseFrame {
  const at = new Set<number>(names.map((name) => INDEX[name]));
  const set = (points: PoseFrame["image"]): PoseFrame["image"] => points.map((p, i) => (at.has(i) ? { ...p, visibility } : p));
  return { ...frame, image: set(frame.image), world: set(frame.world) };
}

test("an arm follows the player when its elbow and wrist read between 0.3 and 0.5", () => {
  const targets = new PoseTargets();
  targets.ingest(withVisibility(frameOf(STAND, 0), LEFT_ARM, 0.35));
  expect(targets.dirOk.upperarmL).toBe(true);
  expect(targets.dirOk.lowerarmL).toBe(true);
  expect(ARM_VISIBILITY).toBeLessThanOrEqual(0.35);
});

test("an arm the camera cannot see goes back to the clip, and the legs keep the stricter rule", () => {
  const targets = new PoseTargets();
  const frame = withVisibility(withVisibility(frameOf(STAND, 0), LEFT_ARM, 0.2), ["leftKnee", "leftAnkle"], 0.4);
  targets.ingest(frame);
  expect(targets.dirOk.upperarmL).toBe(false);
  expect(targets.dirOk.lowerarmL).toBe(false);
  expect(targets.dirOk.upperarmR).toBe(true);
  expect(targets.dirOk.thighL).toBe(false);
});

test("a joint that drops out for a moment keeps its limb, and loses it once the hold runs out", () => {
  const targets = new PoseTargets();
  const pose = Object.values(POSES)[0] ?? STAND;
  targets.ingest(frameOf(pose, 0));
  const before = targets.dir.lowerarmL.clone();
  targets.ingest(withVisibility(frameOf(STAND, HOLD_MS - 20), LEFT_ARM, 0.1));
  expect(targets.dirOk.lowerarmL).toBe(true);
  expect(targets.dir.lowerarmL.distanceTo(before)).toBeLessThan(1e-6);
  targets.ingest(withVisibility(frameOf(STAND, HOLD_MS + 20), LEFT_ARM, 0.1));
  expect(targets.dirOk.lowerarmL).toBe(false);
  expect(targets.dirOk.upperarmL).toBe(false);
});
