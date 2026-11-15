// The 3D half of the move guide (src/coach/guide3d.ts): every move's figure is finite all the way round its loop, an end
// pushed at the camera comes toward the viewer, and no bone is stretched or squashed beyond what the flat poses show.
import { expect, test } from "vitest";
import { guideFor, poseAt, towardOf } from "../src/coach/guide";
import type { GuideEnd, GuideJoint } from "../src/coach/guide";
import { figure3d, isLit } from "../src/coach/guide3d";
import type { Vec3 } from "../src/coach/guide3d";
import { MOVES } from "../src/moves/registry";

const GUIDED = [...MOVES.values()].flatMap((move) => {
  const guide = guideFor(move);
  return guide ? [{ id: move.id, guide }] : [];
});
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const BONES: readonly (readonly [GuideJoint, GuideJoint])[] = ["left", "right"].flatMap((s) => [
  [`${s}Shoulder`, `${s}Elbow`], [`${s}Elbow`, `${s}Wrist`], [`${s}Hip`, `${s}Knee`], [`${s}Knee`, `${s}Foot`],
] as [GuideJoint, GuideJoint][]);
/** The flat poses draw a limb between 0.05 m (pointing at the camera) and 0.77 m; in 3D none is under 0.15 (a blend between two poses dips a little) or over 0.8. */
const SHORTEST = 0.15;
const LONGEST = 0.8;
const TIMES = 24;

test("there are guides to test", () => {
  expect(GUIDED.length).toBeGreaterThanOrEqual(26);
});

test("every joint is finite and every bone a believable length, all round every loop", () => {
  for (const { id, guide } of GUIDED) {
    for (let i = 0; i < TIMES; i++) {
      const { pose, toward } = poseAt(guide, (i / TIMES) * guide.loopMs);
      for (const mirrored of [true, false]) {
        const figure = figure3d(pose, toward, mirrored);
        for (const [name, point] of Object.entries(figure)) expect(point.every(Number.isFinite), `${id} ${name} @${String(i)}`).toBe(true);
        for (const [from, to] of BONES) {
          const length = dist(figure[from], figure[to]);
          expect(length, `${id} ${from}-${to} @${String(i)}`).toBeGreaterThanOrEqual(SHORTEST);
          expect(length, `${id} ${from}-${to} @${String(i)}`).toBeLessThanOrEqual(LONGEST);
        }
      }
    }
  }
});

test("an end pushed at the camera comes toward the viewer at toward 1 and is flat at 0", () => {
  for (const { id, guide } of GUIDED) {
    for (const key of guide.keyframes) {
      for (const end of key.forward) {
        const pushed = figure3d(key.pose, towardOf(key))[end as Exclude<GuideEnd, "head">];
        const idle = figure3d(key.pose, { ...towardOf(key), [end]: 0 })[end as Exclude<GuideEnd, "head">];
        expect(pushed[2], `${id} ${end} at ${String(key.t)}`).toBeGreaterThanOrEqual(0.2);
        expect(idle[2], `${id} ${end} at ${String(key.t)}`).toBeLessThan(pushed[2]);
      }
    }
  }
});

test("a straight punch is an arm reaching at the viewer at near full length", () => {
  const jab = GUIDED.find((entry) => entry.id === "jab");
  const key = jab?.guide.keyframes[1];
  if (!key) throw new Error("jab has no punch keyframe");
  const figure = figure3d(key.pose, towardOf(key));
  expect(dist(figure.leftShoulder, figure.leftWrist)).toBeGreaterThan(0.7);
  expect(figure.leftWrist[2]).toBeGreaterThan(0.7);
});

test("the mirror flips left and right, and a ducking leg bends its knee forward", () => {
  const duck = GUIDED.find((entry) => entry.id === "duck");
  const key = duck?.guide.keyframes.at(-1);
  if (!key) throw new Error("duck has no keyframes");
  const [mirror, plain] = [figure3d(key.pose, towardOf(key), true), figure3d(key.pose, towardOf(key), false)];
  expect(plain.leftHip[0]).toBeCloseTo(-mirror.leftHip[0]);
  expect(mirror.leftKnee[2]).toBeGreaterThan(0.05);
});

test("the lit rule: a leg is one limb, a wrist is its own", () => {
  expect(isLit(["rightKnee"], "rightFoot")).toBe(true);
  expect(isLit(["rightWrist"], "leftWrist")).toBe(false);
  expect(isLit(["leftWrist"], "leftWrist")).toBe(true);
  expect(isLit(["rightFoot"], "rightWrist")).toBe(false);
});
