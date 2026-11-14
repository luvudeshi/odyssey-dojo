// A worse camera for detector tests: seeded landmark jitter, joints the tracker is unsure of, a slower frame
// rate, and a player who has moved closer to or further from the lens since calibration.
// Calibration works as in the game (src/screens/Calibration.tsx): the baseline is the average of a second of
// standing still, handed to the fight ready-made, so it does not depend on how many frames a second arrive.
import type { Landmark, PoseFrame, PoseHistory } from "../../src/core/types";
import { JOINT, baselineOf, pushFrame } from "../../src/pose/signals";
import { STANDING, blend, bodyFrame, type BodyPose, type Step } from "../poseFixture";

export interface Camera {
  /** Frames a second. */
  readonly fps: number;
  /** Size of the player in the picture during the fight, against calibration: 1.2 is 20% closer, 0.8 further. */
  readonly scale: number;
  /** Standard deviation of the noise on every picture landmark, as a share of the frame. 0.01 is 1%. */
  readonly jitter: number;
  /** Joints the tracker reports with low visibility: they wander `UNSURE_JITTER` times as much. */
  readonly unsure: readonly number[];
  readonly seed: number;
}

export const CLEAN: Camera = { fps: 30, scale: 1, jitter: 0, unsure: [], seed: 1 };
export const WRISTS_AND_HIPS: readonly number[] = [JOINT.leftWrist, JOINT.rightWrist, JOINT.leftHip, JOINT.rightHip];
export const UNSURE_VISIBILITY = 0.3;
export const UNSURE_JITTER = 3;
/** Middle of the calibration stance in the picture, between shoulders and hips: the point the player grows or shrinks about. */
const BODY_CENTRE = { x: 0.5, y: 0.5 };
/** Metres one share of the frame covers at fighting distance, to give the 3D points the same noise as the picture. */
const METRES_PER_FRAME = 2;
const CALIBRATION_MS = 1000;

/** Mulberry32: a small seeded generator, so a noisy run is the same every time. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bell-curve noise with a standard deviation of 1, cut off at 2.5 so one freak frame cannot decide a test. */
function bell(random: () => number): number {
  const value = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  return Math.max(-2.5, Math.min(2.5, value));
}

/** The frame as this camera would report it. */
export function seenBy(camera: Camera, frame: PoseFrame, scale: number, random: () => number): PoseFrame {
  const shake = (index: number): number => camera.jitter * (camera.unsure.includes(index) ? UNSURE_JITTER : 1);
  const visibility = (point: Landmark, index: number): number =>
    camera.unsure.includes(index) ? UNSURE_VISIBILITY : point.visibility;
  return {
    t: frame.t,
    image: frame.image.map((point, index) => ({
      ...point,
      x: BODY_CENTRE.x + (point.x - BODY_CENTRE.x) * scale + shake(index) * bell(random),
      y: BODY_CENTRE.y + (point.y - BODY_CENTRE.y) * scale + shake(index) * bell(random),
      visibility: visibility(point, index),
    })),
    world: frame.world.map((point, index) => ({
      x: point.x + shake(index) * METRES_PER_FRAME * bell(random),
      y: point.y + shake(index) * METRES_PER_FRAME * bell(random),
      z: point.z + shake(index) * METRES_PER_FRAME * bell(random),
      visibility: visibility(point, index),
    })),
  };
}

/** The poses of each step in turn at the camera's frame rate, starting from `from`. */
function posesOf(steps: readonly Step[], frameMs: number, from: BodyPose): BodyPose[] {
  const poses: BodyPose[] = [];
  let last = from;
  for (const [to, ms] of steps) {
    const count = Math.max(1, Math.round(ms / frameMs));
    for (let i = 1; i <= count; i++) poses.push(blend(last, to, i / count));
    last = to;
  }
  return poses;
}

/** What each detector said on one frame of the fight. */
export interface Sample {
  readonly t: number;
  readonly confidence: number;
}

/**
 * Calibrates on a second of standing at the calibration distance, then plays the steps at the camera's distance
 * and returns the detector's confidence on every frame of them. `t` counts from the first step.
 */
export function film(detect: (history: PoseHistory) => number, steps: readonly Step[], camera: Camera): Sample[] {
  const random = seeded(camera.seed);
  const frameMs = 1000 / camera.fps;
  const still = posesOf([[STANDING, CALIBRATION_MS]], frameMs, STANDING);
  const calibration = still.map((body, i) => seenBy(camera, bodyFrame(i * frameMs, body), 1, random));
  let history: PoseHistory = { frames: [], baseline: baselineOf(calibration) };
  return posesOf(steps, frameMs, STANDING).map((body, i) => {
    const t = (i + 1) * frameMs;
    history = pushFrame(history, seenBy(camera, bodyFrame(CALIBRATION_MS + t, body), camera.scale, random));
    return { t, confidence: detect(history) };
  });
}

/** The longest unbroken stretch at or above `level`, in milliseconds. */
export function longestAbove(samples: readonly Sample[], level: number, fps: number): number {
  let run = 0;
  let longest = 0;
  for (const sample of samples) {
    run = sample.confidence >= level ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return (longest * 1000) / fps;
}

/** The lowest confidence between two times, in milliseconds from the first step. */
export function lowest(samples: readonly Sample[], from: number, to: number): number {
  return Math.min(...samples.filter((sample) => sample.t >= from && sample.t <= to).map((sample) => sample.confidence));
}

/** The highest confidence anywhere in the run. */
export function highest(samples: readonly Sample[]): number {
  return Math.max(0, ...samples.map((sample) => sample.confidence));
}
