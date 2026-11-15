import { expect, test } from "vitest";
import type { PoseFrame, PoseHistory } from "../../src/core/types";
import { armWent, armsWent, bodyWent, legRose } from "../../src/moves/looseSignals";
import type { ArmWay, BodyWay } from "../../src/moves/looseSignals";
import { EMPTY_HISTORY, JOINT, pushFrame } from "../../src/pose/signals";
import { loadTrace } from "../../tools/recorder/trace";
import type { StoredTrace } from "../../tools/recorder/trace";
import { LEFT_OUT, READY, RIGHT_OUT, STANDING, blend, pose, recording } from "../poseFixture";
import type { BodyPose, Step } from "../poseFixture";

const WAYS: readonly ArmWay[] = ["forward", "across", "up", "down", "out"];
const BODY_WAYS: readonly BodyWay[] = ["left", "right", "up", "down"];

function historyOf(frames: readonly PoseFrame[]): PoseHistory {
  return frames.reduce<PoseHistory>((h, f) => pushFrame(h, f), EMPTY_HISTORY);
}
/** The history after holding `from` and moving to `to` over 300 ms, then holding 200 ms. */
function after(from: BodyPose, to: BodyPose, share = 1): PoseHistory {
  const steps: Step[] = [[from, 600], [blend(from, to, share), 300], [blend(from, to, share), 200]];
  return historyOf(recording(steps));
}
const ways = (h: PoseHistory, side: "left" | "right"): ArmWay[] => WAYS.filter((w) => armWent(h, side, w) === 1);

// World axes: x to the player's right, y down, z negative toward the camera.
const LEFT_UP = pose({ leftUpper: [-0.3, 0.1, -0.2], leftFore: [0, -1, -0.1] }, READY);
const LEFT_DOWN = pose({ leftUpper: [-0.07, 1, 0], leftFore: [0, 1, 0] }, READY);
const LEFT_ACROSS = pose({ leftUpper: [0.3, 0.2, -0.3], leftFore: [1, 0, -0.1] }, READY);
const LEFT_OUTWARD = pose({ leftUpper: [-1, 0.1, 0], leftFore: [-1, 0, 0] }, READY);

test("a left arm punched at the camera is forward, and only forward", () => {
  expect(ways(after(READY, pose(LEFT_OUT, READY)), "left")).toEqual(["forward"]);
  expect(ways(after(READY, blend(READY, pose(LEFT_OUT, READY), 0.5)), "left")).toEqual(["forward"]);
});

test("a punch from hanging hands is forward, not up", () => {
  expect(ways(after(STANDING, pose(LEFT_OUT)), "left")).toEqual(["forward"]);
});

test("a left hand raised from the guard is up, one dropped is down", () => {
  expect(ways(after(READY, LEFT_UP), "left")).toContain("up");
  expect(ways(after(READY, LEFT_UP), "left")).not.toContain("forward");
  expect(ways(after(READY, LEFT_DOWN), "left")).toEqual(["down"]);
});

test("a left hand swept toward the body is across, one flung to its side is out", () => {
  expect(ways(after(READY, LEFT_ACROSS), "left")).toContain("across");
  expect(ways(after(READY, LEFT_ACROSS), "left")).not.toContain("out");
  expect(ways(after(READY, LEFT_OUTWARD), "left")).toContain("out");
  expect(ways(after(READY, LEFT_OUTWARD), "left")).not.toContain("across");
});

test("the other side: a right-arm movement reads on the right and never on the left", () => {
  const h = after(READY, pose(RIGHT_OUT, READY));
  expect(ways(h, "right")).toEqual(["forward"]);
  expect(ways(h, "left")).toEqual([]);
  const mirrored = after(READY, pose({ rightUpper: [0.3, 0.1, -0.2], rightFore: [0, -1, -0.1] }, READY));
  expect(ways(mirrored, "right")).toContain("up");
  expect(ways(mirrored, "left")).toEqual([]);
});

test("both arms together: armsWent reads, and no one-arm rule does", () => {
  const both = after(READY, pose({ ...LEFT_OUT, ...RIGHT_OUT }, READY));
  expect(armsWent(both)).toBe(1);
  expect(armsWent(both, "forward")).toBe(1);
  expect(armsWent(both, "up")).toBe(0);
  expect(ways(both, "left")).toEqual([]);
  expect(armsWent(after(READY, pose(LEFT_OUT, READY)))).toBe(0);
});

test("standing still with a tenth of a shoulder width of jitter gives 0 for everything", () => {
  const jittered = recording([[STANDING, 1500]]).map((frame, i): PoseFrame => {
    const dx = (i % 2 === 0 ? 1 : -1) * 0.016;
    const dy = (i % 3 === 0 ? 1 : -1) * 0.016;
    return { ...frame, image: frame.image.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy * (i % 2 === 0 ? 1 : -1) })) };
  });
  const h = historyOf(jittered);
  for (const side of ["left", "right"] as const) expect(ways(h, side)).toEqual([]);
  expect(armsWent(h)).toBe(0);
  expect(BODY_WAYS.map((w) => bodyWent(h, w))).toEqual([0, 0, 0, 0]);
  expect(legRose(h)).toBe(0);
});

test("a sidestep or a duck, arms kept on the body, is no arm movement", () => {
  for (const body of [pose({ step: 0.5 }, READY), pose({ drop: 0.25 }, READY), pose({ lean: 0.2 }, READY)]) {
    const h = after(READY, body);
    for (const side of ["left", "right"] as const) expect(ways(h, side)).toEqual([]);
    expect(armsWent(h)).toBe(0);
  }
});

test("the body went a way: each of left, right, down and up reads only itself", () => {
  const read = (h: PoseHistory): BodyWay[] => BODY_WAYS.filter((w) => bodyWent(h, w) === 1);
  expect(read(after(READY, pose({ step: -0.5 }, READY)))).toEqual(["left"]);
  expect(read(after(READY, pose({ step: 0.5 }, READY)))).toEqual(["right"]);
  expect(read(after(READY, pose({ drop: 0.25 }, READY)))).toEqual(["down"]);
  expect(read(after(READY, pose({ drop: -0.2 }, READY)))).toEqual(["up"]);
  expect(read(after(READY, pose(LEFT_OUT, READY)))).toEqual([]);
});

test("a leg rose: 0 when the legs are out of view, 1 for a raised knee in view", () => {
  expect(legRose(after(READY, READY))).toBe(0);
  const withLeg = (f: PoseFrame, raise: number): PoseFrame => ({
    ...f,
    image: f.image.map((p, k) => {
      if (k === JOINT.leftKnee) return { x: 0.45, y: 0.8 - raise, z: 0, visibility: 1 };
      if (k === JOINT.rightKnee) return { x: 0.55, y: 0.8, z: 0, visibility: 1 };
      if (k === JOINT.leftAnkle) return { x: 0.45, y: 0.95 - raise, z: 0, visibility: 1 };
      if (k === JOINT.rightAnkle) return { x: 0.55, y: 0.95, z: 0, visibility: 1 };
      return p;
    }),
  });
  const base = recording([[READY, 1000]]);
  expect(legRose(historyOf(base.map((f) => withLeg(f, 0))))).toBe(0);
  const lifted = base.map((f, i) => withLeg(f, i < base.length - 12 ? 0 : 0.12 * Math.min(1, (i - (base.length - 12) + 1) / 6)));
  expect(legRose(historyOf(lifted), "left")).toBe(1);
  expect(legRose(historyOf(lifted), "right")).toBe(0);
});

const FILES = import.meta.glob<StoredTrace>("../fixtures/poses/*.json", { eager: true, import: "default" });
const trace = (name: string) => loadTrace(Object.entries(FILES).find(([path]) => path.endsWith(name))?.[1] as StoredTrace);

test("the block recording gives 0 for every one-arm rule at every frame", () => {
  const block = trace("block-madeup-1.json");
  let h: PoseHistory = EMPTY_HISTORY;
  for (const frame of block.frames) {
    h = { ...pushFrame(h, frame), baseline: block.baseline };
    for (const side of ["left", "right"] as const) expect(ways(h, side)).toEqual([]);
  }
});
