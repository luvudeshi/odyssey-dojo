// The same made-up move seen on a different body: smaller or taller, nearer or further, or off to one side.
// Every change is applied to the WHOLE recording, the standing frames that set the baseline included, because
// a small person is small from the first frame. (tests/helpers/noisyCamera.ts covers the other case: a player
// who moves after calibration.)
import type { PoseFrame } from "../../src/core/types";
import { createPoseInput } from "../../src/input/poseInput";
import { MOVES } from "../../src/moves/registry";
import { EMPTY_HISTORY, JOINT, pushFrame, shoulderWidth, shoulderWidth3d } from "../../src/pose/signals";
import { FRAME_MS, STANDING, blend, frameAt } from "../poseFixture";
import type { BodyPose, Step, Vec3 } from "../poseFixture";
import { CLEAN, seeded, seenBy } from "./noisyCamera";

export interface Body {
  readonly name: string;
  /**
   * Body size against the fixture's adult. Scales the picture about the body centre AND the 3D points about
   * the hips: a child is smaller in the picture and has shorter limbs in metres.
   */
  readonly size: number;
  /**
   * How much bigger the same body looks because it stands nearer (below 1: further away). Scales the picture
   * only: the 3D points are metres from the hips and do not change with distance.
   */
  readonly zoom: number;
  /** How far the whole body stands to the side, as a share of the frame width. Negative is screen left. */
  readonly shift: number;
}

/** Shoulder width of the fixture's standing person, as a share of the frame width. */
export const FIXTURE_SHOULDERS = 0.16;

export function body(name: string, changes: Partial<Omit<Body, "name">>): Body {
  return { name, size: 1, zoom: 1, shift: 0, ...changes };
}

/** The zoom that makes the fixture's shoulders take up `share` of the frame width. */
export function shouldersAt(share: number): number {
  return share / FIXTURE_SHOULDERS;
}

/** One frame as this body would give it. Points pushed outside the picture are left there, as the tracker leaves them. */
export function frameOn(who: Body, frame: PoseFrame): PoseFrame {
  // With no jitter the noisy camera only scales the picture about the body centre.
  const scaled = seenBy(CLEAN, frame, who.size * who.zoom, seeded(1));
  return {
    t: scaled.t,
    image: scaled.image.map((point) => ({ ...point, x: point.x + who.shift })),
    world: scaled.world.map((point) => ({
      ...point,
      x: point.x * who.size,
      y: point.y * who.size,
      z: point.z * who.size,
    })),
  };
}

export function recordingOn(who: Body, frames: readonly PoseFrame[]): PoseFrame[] {
  return frames.map((frame) => frameOn(who, frame));
}

/**
 * Every move the game would read over the recording, in alphabetical order: strikes thrown and defends held,
 * through the real pose input (ON at 0.7), fed one frame at a time the way the fight screen does.
 */
export function fired(frames: readonly PoseFrame[]): string[] {
  const read = createPoseInput(MOVES);
  const seen = new Set<string>();
  let history = EMPTY_HISTORY;
  for (const frame of frames) {
    history = pushFrame(history, frame);
    const input = read(history);
    for (const id of input.held) seen.add(id);
    for (const strike of input.struck) seen.add(strike.move);
  }
  return [...seen].sort();
}

/** Frames at the start of every `sequence` that stand still and set the baseline (SETTLE_FRAMES in ./poses.ts). */
export const CALIBRATION_FRAMES = 20;

/**
 * The same frame with the player turned about the vertical axis through the hips. Positive degrees bring the
 * player's right shoulder toward the camera (a turn to their own left), negative the left shoulder.
 *
 * The model is a camera far enough away that depth does not change size (weak perspective):
 * - 3D points are rotated rigidly: x' = x cos a + z sin a, z' = z cos a - x sin a, y unchanged;
 * - in the picture, each point's sideways offset from the body's centre line (the middle of the shoulders)
 *   shrinks by cos a, and the point's 3D depth z shows up sideways as z sin a, at `perMetre` shares of the
 *   frame width per metre. Picture height does not change.
 */
export function turnedFrame(frame: PoseFrame, degrees: number, perMetre: number): PoseFrame {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const centre = (frame.image[11]?.x ?? 0.5) / 2 + (frame.image[12]?.x ?? 0.5) / 2;
  return {
    t: frame.t,
    image: frame.image.map((point, index) => ({
      ...point,
      x: centre + (point.x - centre) * cos + (frame.world[index]?.z ?? 0) * perMetre * sin,
    })),
    world: frame.world.map((point) => ({ ...point, x: point.x * cos + point.z * sin, z: point.z * cos - point.x * sin })),
  };
}

/** The recording with every frame from number `from` on turned. `from` 0 is a player who never faced the camera. */
export function recordingTurned(frames: readonly PoseFrame[], degrees: number, from: number): PoseFrame[] {
  const first = frames[0];
  if (!first) return [];
  // Shares of the frame width one metre covers, from the standing frame: 0.16 / 0.4 m on the fixture.
  const perMetre = shoulderWidth(first) / shoulderWidth3d(first);
  return frames.map((frame, index) => (index < from ? frame : turnedFrame(frame, degrees, perMetre)));
}

/**
 * A body's own proportions, in metres on the 3D body. `recordingOn` scales every part of the fixture's adult
 * evenly; this sets the parts apart, so adult arms can hang from narrow shoulders (issue #178).
 */
export interface Build {
  /** Shoulder to shoulder. */
  readonly shoulders: number;
  /** Shoulder to wrist with the arm straight, split between upper arm and forearm as on the fixture (6 to 5). */
  readonly arm: number;
  /** Shoulders to hips. */
  readonly torso: number;
}

/** The body `bodyFrame` in tests/poseFixture.ts draws. */
export const FIXTURE_BUILD: Build = { shoulders: 0.4, arm: 0.55, torso: 0.5 };

/** Shares of the picture one metre covers, across and down: the same as tests/poseFixture.ts. */
const PICTURE_X = 0.4;
const PICTURE_Y = 0.6;

function along(from: Vec3, direction: Vec3, length: number): Vec3 {
  const scale = length / (Math.hypot(...direction) || 1);
  return [from[0] + direction[0] * scale, from[1] + direction[1] * scale, from[2] + direction[2] * scale];
}

/**
 * One frame of a body pose on a body of this build: `bodyFrame` in tests/poseFixture.ts with the three lengths
 * free. The picture is drawn from the 3D points at the same shares of the frame per metre, so the two agree.
 */
export function builtFrame(build: Build, t: number, at: BodyPose): PoseFrame {
  const half = build.shoulders / 2;
  const leftShoulder: Vec3 = [-half + at.lean, -build.torso, 0];
  const rightShoulder: Vec3 = [half + at.lean, -build.torso, 0];
  const upper = (build.arm * 6) / 11;
  const leftElbow = along(leftShoulder, at.leftUpper, upper);
  const rightElbow = along(rightShoulder, at.rightUpper, upper);
  const world: Record<number, Vec3> = {
    [JOINT.nose]: [at.lean * 1.2, -build.torso - 0.25, -0.05],
    [JOINT.leftShoulder]: leftShoulder, [JOINT.rightShoulder]: rightShoulder,
    [JOINT.leftElbow]: leftElbow, [JOINT.rightElbow]: rightElbow,
    [JOINT.leftWrist]: along(leftElbow, at.leftFore, build.arm - upper),
    [JOINT.rightWrist]: along(rightElbow, at.rightFore, build.arm - upper),
    [JOINT.leftHip]: [-0.125, 0, 0], [JOINT.rightHip]: [0.125, 0, 0],
  };
  const image: Record<number, readonly [number, number]> = {};
  for (const [index, point] of Object.entries(world)) {
    image[Number(index)] = [0.5 + (point[0] + at.step) * PICTURE_X, 0.65 + (point[1] + at.drop) * PICTURE_Y];
  }
  return frameAt(t, image, world);
}

/** `recording` in tests/poseFixture.ts on a body of this build: 20 still frames for the baseline, then each step. */
export function builtRecording(build: Build, steps: readonly Step[]): PoseFrame[] {
  const poses: BodyPose[] = Array.from({ length: CALIBRATION_FRAMES }, () => STANDING);
  let from = STANDING;
  for (const [to, ms] of steps) {
    const count = Math.max(1, Math.round(ms / FRAME_MS));
    for (let i = 1; i <= count; i++) poses.push(blend(from, to, i / count));
    from = to;
  }
  return poses.map((at, index) => builtFrame(build, index * FRAME_MS, at));
}
