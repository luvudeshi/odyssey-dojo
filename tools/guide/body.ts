// A made-up player who copies the guide's figure: the frames a webcam would give for somebody following the
// keyframes exactly. The demo page feeds these to the checklist, and tests/coachGuide.test.ts plays them through the
// real detectors to check that copying the figure is counted.
// Same conventions as the tracker: image x mirrored (the player's left is at the left), y down; world in metres from
// the hips, y down, z negative toward the camera.
import type { Guide, GuideEnd, GuideJoint, GuidePose, Toward } from "../../src/coach/guide";
import { poseAt } from "../../src/coach/guide";
import type { Landmark, PoseFrame } from "../../src/core/types";
import { JOINT } from "../../src/pose/signals";

export const FRAME_MS = 33;
/** The still frames the game takes its baseline from. */
export const STAND_FRAMES = 20;
/** How much of the picture a metre covers: shoulders 0.4 m apart are 0.16 of the picture, as in the test fixtures. */
const PICTURE = 0.4;
const SHOULDER_Y = 0.35;
const SHOULDER_M = 1.42;

const INDEX: Readonly<Record<GuideJoint, number>> = {
  head: JOINT.nose,
  leftShoulder: JOINT.leftShoulder, rightShoulder: JOINT.rightShoulder,
  leftElbow: JOINT.leftElbow, rightElbow: JOINT.rightElbow,
  leftWrist: JOINT.leftWrist, rightWrist: JOINT.rightWrist,
  leftHip: JOINT.leftHip, rightHip: JOINT.rightHip,
  leftKnee: JOINT.leftKnee, rightKnee: JOINT.rightKnee,
  leftFoot: JOINT.leftAnkle, rightFoot: JOINT.rightAnkle,
};

/** How far toward the camera, in metres, each joint is when its limb's end is fully forward: [joint, end, metres]. */
const DEPTH: readonly (readonly [GuideJoint, GuideEnd, number])[] = [
  ["leftWrist", "leftWrist", 0.5], ["leftElbow", "leftWrist", 0.25],
  ["rightWrist", "rightWrist", 0.5], ["rightElbow", "rightWrist", 0.25],
  ["leftFoot", "leftFoot", 0.85], ["leftKnee", "leftFoot", 0.42],
  ["rightFoot", "rightFoot", 0.85], ["rightKnee", "rightFoot", 0.42],
  ["leftKnee", "leftKnee", 0.42], ["leftFoot", "leftKnee", 0.35],
  ["rightKnee", "rightKnee", 0.42], ["rightFoot", "rightKnee", 0.35],
];

/** One webcam frame of a body standing exactly in `pose`. */
export function bodyFrame(t: number, pose: GuidePose, toward: Toward): PoseFrame {
  const hipX = (pose.leftHip[0] + pose.rightHip[0]) / 2;
  const hipY = (pose.leftHip[1] + pose.rightHip[1]) / 2;
  const image: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  const world: Landmark[] = [...image];
  for (const [name, [x, y]] of Object.entries(pose) as [GuideJoint, readonly [number, number]][]) {
    const z = -Math.max(0, ...DEPTH.filter(([joint]) => joint === name).map(([, end, metres]) => metres * toward[end]));
    image[INDEX[name]] = { x: 0.5 + x * PICTURE, y: SHOULDER_Y + (SHOULDER_M - y) * PICTURE, z: 0, visibility: 1 };
    world[INDEX[name]] = { x: x - hipX, y: hipY - y, z, visibility: 1 };
  }
  return { t, image, world };
}

/** Standing in the guide's start pose for the baseline, then `loops` times round the guide, at 30 frames a second. */
export function following(guide: Guide, loops = 1): PoseFrame[] {
  const frames: PoseFrame[] = [];
  const count = STAND_FRAMES + Math.ceil((guide.loopMs * loops) / FRAME_MS);
  for (let i = 0; i < count; i++) {
    const { pose, toward } = poseAt(guide, Math.max(0, i - STAND_FRAMES) * FRAME_MS);
    frames.push(bodyFrame(i * FRAME_MS, pose, toward));
  }
  return frames;
}

/**
 * The frame at time `t` for a player who has been at it for `elapsedMs`: still in the start pose for the first loop
 * (the baseline), then in step with the guide's figure.
 */
export function bodyAt(guide: Guide, t: number, elapsedMs: number): PoseFrame {
  const { pose, toward } = poseAt(guide, elapsedMs < guide.loopMs ? 0 : elapsedMs);
  return bodyFrame(t, pose, toward);
}
