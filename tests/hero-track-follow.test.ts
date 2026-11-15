import { describe, expect, test } from "vitest";
import { Group } from "three";
import { createBodyTracker } from "../src/render/hero/track/BodyTracker";
import type { BodyTracker } from "../src/render/hero/track/BodyTracker";
import { HURT_FLOOR, trackShare } from "../src/render/hero/track/blend";
import { OneEuro } from "../src/render/hero/track/filter";
import { LANDMARK_FILTER } from "../src/render/hero/track/targets";
import { frameOf, STAND } from "./helpers/bodyPoses";
import { loadSkeleton } from "./helpers/glbSkeleton";

function mount(): BodyTracker {
  const hero = new Group();
  hero.rotation.y = Math.PI;
  const root = loadSkeleton();
  hero.add(root);
  hero.updateMatrixWorld(true);
  const tracker = createBodyTracker(root);
  if (!tracker) throw new Error("no tracker");
  return tracker;
}

/** `seconds` of 30 fps frames from `from` seconds. */
function run(tracker: BodyTracker, from: number, seconds: number, opts: Parameters<typeof frameOf>[2]): void {
  for (let i = 0; i * 0.033 < seconds; i++) tracker.update(frameOf(STAND, (from + i * 0.033) * 1000, opts), from + i * 0.033, 0.033, 1);
}

describe("the hero keeps following and never goes still while the body is moving", () => {
  test("a wrist that blinks out of the picture keeps its arm on the last tracked direction, then eases back", () => {
    const tracker = mount();
    run(tracker, 0, 1.5, {});
    expect(Math.min(...Object.values(tracker.debug.limbs))).toBeGreaterThan(0.95);
    run(tracker, 1.5, 0.2, { hidden: ["leftWrist"] });
    expect(tracker.debug.limbs.lowerarmL).toBeGreaterThan(0.9);
    run(tracker, 1.7, 0.7, { hidden: ["leftWrist"] });
    expect(tracker.debug.limbs.lowerarmL).toBeLessThan(0.1);
    expect(tracker.debug.limbs.lowerarmR).toBeGreaterThan(0.95);
  });

  test("when poses stop the body holds for half a second, then eases to the clip over about half a second", () => {
    const tracker = mount();
    run(tracker, 0, 1.5, {});
    const last = frameOf(STAND, 1500, {});
    for (let i = 1; i <= 12; i++) tracker.update(last, 1.5 + i * 0.033, 0.033, 1);
    expect(tracker.debug.weight).toBeGreaterThan(0.99);
    for (let i = 13; i <= 20; i++) tracker.update(last, 1.5 + i * 0.033, 0.033, 1);
    expect(tracker.debug.weight).toBeGreaterThan(0.1);
    expect(tracker.debug.weight).toBeLessThan(0.9);
    for (let i = 21; i <= 90; i++) tracker.update(last, 1.5 + i * 0.033, 0.033, 1);
    expect(tracker.debug.weight).toBeLessThan(0.05);
    // A new pose brings it straight back.
    for (let i = 0; i < 8; i++) tracker.update(frameOf(STAND, 5000 + i * 33, {}), 4.6 + i * 0.033, 0.033, 1);
    expect(tracker.debug.weight).toBeGreaterThan(0.6);
  });

  test("the landmark filter closes a fast arm swing within three camera frames", () => {
    const f = new OneEuro(LANDMARK_FILTER.minCutoff, LANDMARK_FILTER.beta, LANDMARK_FILTER.dCutoff);
    for (let i = 0; i < 30; i++) f.filter(0, i / 30);
    // A metre in a tenth of a second is a punch.
    let v = 0;
    for (let i = 1; i <= 3; i++) v = f.filter(Math.min(1, i / 3), 1 + i / 30);
    expect(v).toBeGreaterThan(0.7);
  });

  test("a hurt flinch leaves the arms mostly on the body", () => {
    expect(trackShare({ sinceHurt: 0.25, won: false, lost: false }, 0.5)).toBeGreaterThanOrEqual(HURT_FLOOR);
  });
});
