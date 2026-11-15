// The 3D rulers on the baseline (issue #158): a shoulder width and a torso length measured once, while the player
// stands facing the camera, and used by the detectors in place of the current frame's own 3D body.
import { expect, test } from "vitest";
import type { Baseline, PoseFrame } from "../../src/core/types";
import { armOut, bodyWidth, torsoLength } from "../../src/moves/handSignals";
import { JOINT, baselineOf, shoulderWidth3d, torsoLength3d } from "../../src/pose/signals";
import { CALIBRATION_FRAMES, body, recordingOn, recordingTurned } from "../helpers/anyBody";
import { NEUTRAL, PUNCH, frameOf, histories, pose, sequence } from "../helpers/poses";
import { frameAt } from "../poseFixture";

const standing = (count: number): PoseFrame[] => Array.from({ length: count }, (_, i) => frameOf(i * 33, NEUTRAL));
/** The frame with its 3D body shrunk toward the hips, as when the tracker loses the body for a frame. */
const shrunk = (frame: PoseFrame, by: number): PoseFrame => ({
  ...frame,
  world: frame.world.map((point) => ({ ...point, x: point.x * by, y: point.y * by, z: point.z * by })),
});

test("baselineOf measures the fixture's adult: shoulders 0.4 m, torso 0.5 m", () => {
  const baseline = baselineOf(standing(20));
  expect(baseline.shoulderWidth3d).toBeCloseTo(0.4, 10);
  expect(baseline.torsoLength3d).toBeCloseTo(0.5, 10);
  // The picture measurements are the ones it always made.
  expect(baseline.centerX).toBeCloseTo(0.5, 10);
  expect(baseline.shoulderY).toBeCloseTo(0.35, 10);
  expect(baseline.shoulderWidth).toBeCloseTo(0.16, 10);
});

test("the rulers follow body size, and do not change with a turn", () => {
  const child = baselineOf(recordingOn(body("0.6x", { size: 0.6 }), standing(20)));
  expect(child.shoulderWidth3d).toBeCloseTo(0.24, 10);
  expect(child.torsoLength3d).toBeCloseTo(0.3, 10);
  const turned = baselineOf(recordingTurned(standing(20), 30, 0));
  expect(turned.shoulderWidth3d).toBeCloseTo(0.4, 10);
  expect(turned.torsoLength3d).toBeCloseTo(0.5, 10);
});

test("the rulers are the middle value, so a few bad calibration frames do not move them", () => {
  const frames = standing(20).map((frame, i) => (i % 3 === 0 ? shrunk(frame, 0.5) : frame));
  const baseline = baselineOf(frames);
  expect(baseline.shoulderWidth3d).toBeCloseTo(0.4, 10);
  expect(baseline.torsoLength3d).toBeCloseTo(0.5, 10);
});

test("pushFrame's own baseline, from the first 20 frames, carries the rulers", () => {
  const history = histories(sequence([{ t: 0, pose: NEUTRAL }])).at(-1);
  expect(history?.frames.length).toBeGreaterThanOrEqual(CALIBRATION_FRAMES);
  expect(history?.baseline?.shoulderWidth3d).toBeCloseTo(0.4, 10);
  expect(history?.baseline?.torsoLength3d).toBeCloseTo(0.5, 10);
});

test("detectors take the ruler from the baseline, and from the frame only when the baseline has none", () => {
  const calibrated = baselineOf(standing(20));
  const frame = shrunk(frameOf(0, NEUTRAL), 0.5);
  expect(shoulderWidth3d(frame)).toBeCloseTo(0.2, 10);
  expect(torsoLength3d(frame)).toBeCloseTo(0.25, 10);
  expect(bodyWidth(frame, calibrated)).toBeCloseTo(0.4, 10);
  expect(torsoLength(frame, calibrated)).toBeCloseTo(0.5, 10);
  // A baseline built by code that has no 3D points (the ghost figure builds one from the picture alone).
  const pictureOnly: Baseline = { centerX: 0.5, shoulderY: 0.35, shoulderWidth: 0.16 };
  for (const none of [null, pictureOnly, { ...pictureOnly, shoulderWidth3d: 0, torsoLength3d: 0 }]) {
    expect(bodyWidth(frame, none)).toBeCloseTo(0.2, 10);
    expect(torsoLength(frame, none)).toBeCloseTo(0.25, 10);
  }
});

test("a fist 0.28 m under its shoulder is at shoulder height by the calibrated torso, whatever the frame's torso reads", () => {
  const calibrated = baselineOf(standing(20));
  // A straight left arm with the fist 0.28 m lower than the shoulder: inside the 0.3 m a 0.5 m torso allows.
  const low = frameOf(0, pose({ ...PUNCH, elbow3: [-0.25, -0.36, -0.25], wrist3: [-0.3, -0.22, -0.5] }));
  // The same frame with the tracker's hips read 0.25 m too high: this frame's own torso is half as long.
  const squashed = frameAt(
    0,
    {},
    {
      ...Object.fromEntries(low.world.map((point, index) => [index, [point.x, point.y, point.z] as const])),
      [JOINT.leftHip]: [-0.1, -0.25, 0],
      [JOINT.rightHip]: [0.1, -0.25, 0],
    },
  );
  expect(torsoLength3d(squashed)).toBeCloseTo(0.25, 10);
  expect(armOut(low, "left", calibrated)).toBe(true);
  expect(armOut(squashed, "left", calibrated)).toBe(true);
  // With no calibrated ruler the frame's own short torso is all there is, and 0.28 m is too far.
  expect(armOut(squashed, "left", null)).toBe(false);
});
