import { describe, expect, test } from "vitest";
import { Group, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import { createBodyTracker } from "../src/render/hero/track/BodyTracker";
import type { BodyTracker } from "../src/render/hero/track/BodyTracker";
import { LIMBS } from "../src/render/hero/track/boneMap";
import { segmentDir } from "../src/render/hero/track/math";
import { frameOf, INDEX, POSES, STAND } from "./helpers/bodyPoses";
import type { LandmarkName, V3 } from "./helpers/bodyPoses";
import { loadSkeleton } from "./helpers/glbSkeleton";
import { need } from "./helpers/need";

/** The spartan skeleton inside a hero-like group (turned to face -z, scaled, moved), as the game mounts it. */
function mount(): { root: Object3D; tracker: BodyTracker } {
  const hero = new Group();
  hero.rotation.y = Math.PI;
  hero.position.set(0.4, 0, 1.2);
  const root = loadSkeleton();
  root.scale.setScalar(1.17);
  hero.add(root);
  hero.updateMatrixWorld(true);
  const tracker = createBodyTracker(root);
  if (!tracker) throw new Error("no tracker for the spartan skeleton");
  return { root, tracker };
}

function settle(tracker: BodyTracker, pose: Record<LandmarkName, V3>, opts: Parameters<typeof frameOf>[2] = {}, seconds = 1.5): void {
  for (let i = 0; i * 0.033 < seconds; i++) tracker.update(frameOf(pose, i * 33, opts), i * 0.033, 0.033, 1);
}

function world(root: Object3D, name: string): Vector3 {
  const bone = root.getObjectByName(name);
  if (!bone) throw new Error(name);
  return bone.getWorldPosition(new Vector3());
}

function degrees(a: Vector3, b: Vector3): number {
  return (a.angleTo(b) * 180) / Math.PI;
}

/** Scene direction of the landmark segment, the same convention the game uses. */
function landmarkDir(pose: Record<LandmarkName, V3>, from: number, to: number): Vector3 {
  const name = (i: number): LandmarkName => need((Object.keys(INDEX) as LandmarkName[]).find((n) => INDEX[n] === i));
  const a = pose[name(from)];
  const b = pose[name(to)];
  const out = new Vector3();
  expect(segmentDir({ x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] }, out)).toBe(true);
  return out;
}

describe("body tracking drives the spartan's own bones", () => {
  for (const name of ["armsOut", "punchRight", "guard", "leanLeft", "leanRight", "twistRight", "squat"]) {
    test(`${name}: every driven limb points within 10 degrees of its landmark segment`, () => {
      const { root, tracker } = mount();
      const pose = need(POSES[name]);
      settle(tracker, pose);
      for (const l of LIMBS) {
        const fk = world(root, l.child).sub(world(root, l.bone)).normalize();
        expect(degrees(fk, landmarkDir(pose, l.from, l.to)), `${name} ${l.key}`).toBeLessThan(10);
      }
    });
  }

  test("leaning 20 degrees each way tips the chest about 20 degrees the right way", () => {
    const chest = (name: string): Vector3 => {
      const { root, tracker } = mount();
      settle(tracker, need(POSES[name]));
      return world(root, "neck_01").sub(world(root, "spine_03")).normalize();
    };
    const upright = chest("guard");
    const right = chest("leanRight");
    const left = chest("leanLeft");
    expect(degrees(upright, right)).toBeGreaterThan(10);
    expect(degrees(upright, right)).toBeLessThan(30);
    expect(degrees(upright, left)).toBeGreaterThan(10);
    // Lean to the player's right is toward scene +x for both.
    expect(right.x).toBeGreaterThan(upright.x + 0.15);
    expect(left.x).toBeLessThan(upright.x - 0.15);
  });

  test("the shoulder line turns against the hip line when the player twists", () => {
    const { root, tracker } = mount();
    settle(tracker, need(POSES.twistRight));
    const clavicle = world(root, "clavicle_r").sub(world(root, "clavicle_l")).normalize();
    const hips = world(root, "thigh_r").sub(world(root, "thigh_l")).normalize();
    const shoulders = landmarkDir(need(POSES.twistRight), INDEX.leftShoulder, INDEX.rightShoulder);
    expect(degrees(clavicle, shoulders)).toBeLessThan(12);
    expect(degrees(hips, new Vector3(1, 0, 0))).toBeLessThan(12);
  });

  test("a squat lowers the pelvis and keeps the lowest foot on the floor", () => {
    const standing = mount();
    settle(standing.tracker, STAND);
    const squatting = mount();
    settle(squatting.tracker, need(POSES.squat));
    const foot = (r: Object3D): number => Math.min(world(r, "foot_l").y, world(r, "foot_r").y);
    expect(world(squatting.root, "pelvis").y).toBeLessThan(world(standing.root, "pelvis").y - 0.15);
    expect(Math.abs(foot(squatting.root) - foot(standing.root))).toBeLessThan(0.03);
  });
});

describe("safety", () => {
  test("no frames leaves every bone exactly as the clip wrote it", () => {
    const { root, tracker } = mount();
    const before: Quaternion[] = [];
    root.traverse((o) => before.push(o.quaternion.clone()));
    for (let i = 0; i < 30; i++) tracker.update(null, i * 0.033, 0.033, 1);
    const after: Quaternion[] = [];
    root.traverse((o) => after.push(o.quaternion.clone()));
    expect(after.every((q, i) => q.equals(need(before[i])))).toBe(true);
    expect(tracker.active).toBe(false);
    expect(tracker.stepX).toBe(0);
  });

  test("missing, zero-length and NaN segments never put NaN in a bone", () => {
    const { root, tracker } = mount();
    const pose = { ...STAND, leftElbow: STAND.leftShoulder, rightWrist: [Number.NaN, 0, 0] as V3, leftAnkle: STAND.leftKnee };
    settle(tracker, pose, { hidden: ["rightKnee", "nose"] });
    root.traverse((o) => {
      for (const n of [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.position.x, o.position.y, o.position.z]) expect(Number.isFinite(n), o.name).toBe(true);
    });
  });

  test("a limb the camera cannot see stays on the clip", () => {
    const { root, tracker } = mount();
    const forearm = need(root.getObjectByName("lowerarm_l"));
    const clip = forearm.quaternion.clone();
    settle(tracker, need(POSES.armsOut), { hidden: ["leftWrist"] });
    expect(forearm.quaternion.angleTo(clip)).toBeLessThan(0.01);
    const upper = need(root.getObjectByName("upperarm_r"));
    expect(upper.quaternion.angleTo(clip)).toBeGreaterThan(0.1);
  });

  test("hurt, victory and defeat give the pose back to the clip", () => {
    const { root, tracker } = mount();
    settle(tracker, need(POSES.armsOut));
    const arm = need(root.getObjectByName("upperarm_r"));
    for (let i = 0; i < 30; i++) tracker.update(frameOf(need(POSES.armsOut), 5000 + i * 33), 1.6 + i * 0.033, 0.033, 0);
    expect(tracker.debug.weight).toBeLessThan(0.01);
    // The mixer's pose for this frame is left untouched once the weight is gone.
    const clip = new Quaternion(0.1, 0.2, 0.3, 0.9).normalize();
    arm.quaternion.copy(clip);
    tracker.update(frameOf(need(POSES.armsOut), 6000), 3, 0.033, 0);
    expect(arm.quaternion.equals(clip)).toBe(true);
  });

  test("the camera going quiet hands the pose back and a return recalibrates", () => {
    const { tracker } = mount();
    settle(tracker, STAND);
    expect(tracker.active).toBe(true);
    const last = frameOf(STAND, 9999);
    tracker.update(last, 1.6, 0.033, 1);
    for (let i = 0; i < 60; i++) tracker.update(last, 1.7 + i * 0.033, 0.033, 1);
    expect(tracker.active).toBe(false);
    expect(tracker.debug.calibrated).toBe(true);
    tracker.update(frameOf(STAND, 20000), 20, 0.033, 1);
    expect(tracker.debug.calibrated).toBe(false);
  });

  test("a model with other bone names is left alone", () => {
    expect(createBodyTracker(new Group())).toBeNull();
  });
});
