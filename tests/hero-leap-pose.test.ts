// The hero acts out his leap on the real spartan skeleton: he sinks onto planted feet, draws his legs up in the air,
// throws a kick at the target, and his held defends ease in and out. No WebGL; the bones are read back in world space.
import { expect, test } from "vitest";
import { Group, Vector3 } from "three";
import type { Object3D } from "three";
import { Stance, createLeapPose } from "../src/render/hero/leapPose";
import type { LeapPose } from "../src/render/hero/leapPose";
import { newLeap } from "../src/render/strikeReach";
import type { Leap } from "../src/render/strikeReach";
import { loadSkeleton } from "./helpers/glbSkeleton";

const NONE: ReadonlySet<string> = new Set();

/** A fresh spartan skeleton in a hero-like group (turned to face -z, scaled, moved), as the game mounts it. */
function mount(): { root: Object3D; pose: LeapPose } {
  const hero = new Group();
  hero.rotation.y = Math.PI;
  hero.position.set(0.4, 0, 1.2);
  const root = loadSkeleton();
  root.scale.setScalar(1.17);
  hero.add(root);
  hero.updateMatrixWorld(true);
  const pose = createLeapPose(root);
  if (!pose) throw new Error("no leap pose for the spartan skeleton");
  return { root, pose };
}

function at(root: Object3D, name: string): Vector3 {
  const bone = root.getObjectByName(name);
  if (!bone) throw new Error(name);
  return bone.getWorldPosition(new Vector3());
}

const leap = (fields: Partial<Leap>): Leap => ({ ...newLeap(), ...fields });

test("a crouch sinks the hips while both feet stay planted where they stood", () => {
  const { root, pose } = mount();
  const hips = at(root, "pelvis");
  const feet = [at(root, "foot_l"), at(root, "foot_r")];
  pose.update(leap({ crouch: 1 }), NONE, null, null, 1 / 60);
  expect(hips.y - at(root, "pelvis").y).toBeCloseTo(0.26, 2);
  expect(at(root, "foot_l").distanceTo(feet[0] ?? new Vector3())).toBeLessThan(0.01);
  expect(at(root, "foot_r").distanceTo(feet[1] ?? new Vector3())).toBeLessThan(0.01);
  // The knees bend forward, the way he faces (-z), not backward.
  expect(at(root, "calf_l").z).toBeLessThan(at(root, "thigh_l").z);
});

test("in the air the lead knee drives up and forward into a jumping pose", () => {
  const { root, pose } = mount();
  const knee = at(root, "calf_l");
  pose.update(leap({ air: 1 }), NONE, null, null, 1 / 60);
  const tucked = at(root, "calf_l");
  expect(tucked.y).toBeGreaterThan(knee.y + 0.15);
  expect(tucked.z).toBeLessThan(knee.z - 0.2);
});

test("a front kick throws the right foot at the target; a knee strike raises the right knee", () => {
  const kicked = mount();
  const hip = at(kicked.root, "thigh_r");
  const target = hip.clone().add(new Vector3(0, 0.3, -2));
  kicked.pose.update(leap({ air: 1 }), NONE, "front_kick", target, 1 / 60);
  const foot = at(kicked.root, "foot_r").sub(at(kicked.root, "thigh_r")).normalize();
  const want = target.clone().sub(at(kicked.root, "thigh_r")).normalize();
  expect((foot.angleTo(want) * 180) / Math.PI).toBeLessThan(10);

  const kneed = mount();
  const knee = at(kneed.root, "calf_r");
  kneed.pose.update(leap({ air: 1 }), NONE, "knee", target, 1 / 60);
  expect(at(kneed.root, "calf_r").y).toBeGreaterThan(knee.y + 0.25);
});

test("held defends snap in within about 100 ms and back out on release", () => {
  const stance = new Stance();
  const jump = new Set(["jump"]);
  for (let i = 0; i < 6; i++) stance.ease(jump, 1 / 60);
  expect(stance.jump).toBeGreaterThan(0.9);
  expect(stance.lift).toBeGreaterThan(0.65);
  for (let i = 0; i < 6; i++) stance.ease(NONE, 1 / 60);
  expect(stance.jump).toBeLessThan(0.1);
  // A duck folds into the leap's crouch, and the bigger share wins.
  const duck = new Set(["duck"]);
  for (let i = 0; i < 30; i++) stance.ease(duck, 1 / 60);
  const act = stance.act(leap({ crouch: 0.2 }), { crouch: 0, air: 0, lean: 0, roll: 0, kick: null, target: null });
  expect(act.crouch).toBeCloseTo(0.55, 2);
});

test("a model that is not the spartan mannequin gets no leap pose", () => {
  expect(createLeapPose(new Group())).toBeNull();
});
