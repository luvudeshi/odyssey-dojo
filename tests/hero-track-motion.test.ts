import { describe, expect, test } from "vitest";
import { Group, Vector3 } from "three";
import type { Object3D } from "three";
import { createBodyTracker } from "../src/render/hero/track/BodyTracker";
import type { BodyTracker } from "../src/render/hero/track/BodyTracker";
import { trackShare } from "../src/render/hero/track/blend";
import { OneEuro } from "../src/render/hero/track/filter";
import { bendJoint, clampAngle, segmentDir } from "../src/render/hero/track/math";
import { STEP_LIMIT } from "../src/render/hero/track/targets";
import { frameOf, STAND } from "./helpers/bodyPoses";
import type { LandmarkName } from "./helpers/bodyPoses";
import { loadSkeleton } from "./helpers/glbSkeleton";
import { need } from "./helpers/need";

const NO_LEGS: readonly LandmarkName[] = ["leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle"];

function mount(): { root: Object3D; tracker: BodyTracker } {
  const hero = new Group();
  hero.rotation.y = Math.PI;
  const root = loadSkeleton();
  hero.add(root);
  hero.updateMatrixWorld(true);
  const tracker = createBodyTracker(root);
  if (!tracker) throw new Error("no tracker");
  return { root, tracker };
}

/** Runs the tracker for `seconds` of 30 fps frames starting at `from` seconds. */
function run(tracker: BodyTracker, from: number, seconds: number, opts: Parameters<typeof frameOf>[2]): void {
  for (let i = 0; i * 0.033 < seconds; i++) tracker.update(frameOf(STAND, (from + i * 0.033) * 1000, opts), from + i * 0.033, 0.033, 1);
}

const y = (root: Object3D, name: string): number => need(root.getObjectByName(name)).getWorldPosition(new Vector3()).y;

describe("steps and ducks come from the picture, against the first second", () => {
  test("stepping right in the picture moves the hero right, then back", () => {
    const { tracker } = mount();
    run(tracker, 0, 1.2, { hidden: NO_LEGS });
    expect(tracker.debug.calibrated).toBe(true);
    expect(Math.abs(tracker.stepX)).toBeLessThan(0.01);
    run(tracker, 1.2, 1.5, { hidden: NO_LEGS, shiftX: 0.25 });
    // 0.25 of the picture at 0.42 per metre is about 0.6 m.
    expect(tracker.stepX).toBeGreaterThan(0.4);
    expect(tracker.stepX).toBeLessThanOrEqual(STEP_LIMIT);
    run(tracker, 2.7, 1.5, { hidden: NO_LEGS, shiftX: -0.25 });
    expect(tracker.stepX).toBeLessThan(-0.4);
    run(tracker, 4.2, 1.5, { hidden: NO_LEGS });
    expect(Math.abs(tracker.stepX)).toBeLessThan(0.05);
  });

  test("a huge step stays inside the arena", () => {
    const { tracker } = mount();
    run(tracker, 0, 1.2, {});
    run(tracker, 1.2, 2, { shiftX: 0.45 });
    expect(tracker.stepX).toBeLessThanOrEqual(STEP_LIMIT);
  });

  test("with the legs out of the picture a duck still lowers the pelvis and bends the knees, feet planted", () => {
    const standing = mount();
    run(standing.tracker, 0, 2.5, { hidden: NO_LEGS });
    const ducking = mount();
    run(ducking.tracker, 0, 1.2, { hidden: NO_LEGS });
    run(ducking.tracker, 1.2, 1.5, { hidden: NO_LEGS, sinkY: 0.18 });
    expect(ducking.tracker.debug.drop).toBeGreaterThan(0.15);
    expect(y(ducking.root, "pelvis")).toBeLessThan(y(standing.root, "pelvis") - 0.12);
    const foot = (t: { root: Object3D }): number => Math.min(y(t.root, "foot_l"), y(t.root, "foot_r"));
    expect(Math.abs(foot(ducking) - foot(standing))).toBeLessThan(0.03);
  });

  test("leaning forward is not mistaken for a duck", () => {
    const { tracker } = mount();
    run(tracker, 0, 1.2, { hidden: NO_LEGS });
    // Shoulders lower by 0.04 m in the world and in the picture alike, hips unmoved.
    const lean = { ...STAND, leftShoulder: [-0.19, -0.46, 0] as const, rightShoulder: [0.19, -0.46, 0] as const };
    for (let i = 0; i < 50; i++) {
      const f = frameOf(lean, (1.2 + i * 0.033) * 1000, { hidden: NO_LEGS });
      tracker.update(f, 1.2 + i * 0.033, 0.033, 1);
    }
    expect(tracker.debug.drop).toBeLessThan(0.03);
  });
});

describe("smoothing and clamps", () => {
  test("the filter closes most of a step within about 100 ms and holds steady on noise", () => {
    const f = new OneEuro();
    for (let i = 0; i < 30; i++) f.filter(0, i / 30);
    let v = 0;
    for (let i = 0; i < 3; i++) v = f.filter(1, 1 + (i + 1) / 30);
    expect(v).toBeGreaterThan(0.6);
    const g = new OneEuro();
    let worst = 0;
    for (let i = 0; i < 60; i++) {
      const smoothed = g.filter(i % 2 ? 0.01 : -0.01, i / 30);
      if (i > 0) worst = Math.max(worst, Math.abs(smoothed));
    }
    expect(worst).toBeLessThan(0.01);
  });

  test("the filter ignores NaN and restarts after a long gap", () => {
    const f = new OneEuro();
    f.filter(1, 0);
    expect(f.filter(Number.NaN, 0.03)).toBe(1);
    expect(f.filter(5, 3)).toBe(5);
    expect(new OneEuro().filter(Number.NaN, 0)).toBe(0);
    expect(f.filter(9, 3)).toBe(5);
  });

  test("segments that are missing, zero-length or not numbers are refused", () => {
    const out = new Vector3(7, 7, 7);
    const p = { x: 0, y: 0, z: 0 };
    expect(segmentDir(p, p, out)).toBe(false);
    expect(segmentDir(p, { x: Number.NaN, y: 0, z: 0 }, out)).toBe(false);
    expect(out.toArray()).toEqual([7, 7, 7]);
    expect(segmentDir(p, { x: 0, y: -1, z: 0 }, out)).toBe(true);
    expect(out.y).toBe(1);
  });

  test("a folded elbow is held to its limit and a straight one is left alone", () => {
    const ref = new Vector3(0, 1, 0);
    const folded = new Vector3(0.01, -1, 0).normalize();
    clampAngle(folded, ref, 2.6);
    expect(folded.angleTo(ref)).toBeCloseTo(2.6, 3);
    const fine = new Vector3(1, 1, 0).normalize();
    const copy = fine.clone();
    clampAngle(fine, ref, 2.6);
    expect(fine.equals(copy)).toBe(true);
    const same = ref.clone();
    clampAngle(same, ref.clone().negate(), 0);
    expect(Number.isFinite(same.x)).toBe(true);
  });

  test("the two-bone bend puts the knee forward and keeps both bone lengths", () => {
    const hip = new Vector3(0, 0.8, 0);
    const ankle = new Vector3(0, 0.1, 0);
    const knee = bendJoint(hip, ankle, 0.4, 0.43, new Vector3(0, 0, -1), new Vector3());
    expect(knee.z).toBeLessThan(0);
    expect(knee.distanceTo(hip)).toBeCloseTo(0.4, 3);
    expect(knee.distanceTo(ankle)).toBeCloseTo(0.43, 3);
    const stretched = bendJoint(hip, new Vector3(0, -5, 0), 0.4, 0.43, new Vector3(0, 0, -1), new Vector3());
    expect(Number.isFinite(stretched.z)).toBe(true);
  });
});

describe("the clip comes back for the short moments that need it", () => {
  test("hurt dips the body's share to nothing mid-hit and returns", () => {
    expect(trackShare({ sinceHurt: 99, won: false, lost: false }, 0.5)).toBe(1);
    expect(trackShare({ sinceHurt: 0.25, won: false, lost: false }, 0.5)).toBeCloseTo(0, 5);
    expect(trackShare({ sinceHurt: 0.01, won: false, lost: false }, 0.5)).toBeGreaterThan(0.9);
    expect(trackShare({ sinceHurt: 0.49, won: false, lost: false }, 0.5)).toBeGreaterThan(0.9);
  });

  test("victory and defeat are all clip", () => {
    expect(trackShare({ sinceHurt: 99, won: true, lost: false }, 0.5)).toBe(0);
    expect(trackShare({ sinceHurt: 99, won: false, lost: true }, 0.5)).toBe(0);
  });
});
