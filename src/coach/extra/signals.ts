// Measurements and small builders shared by the Dojo's extra moves (./moves). Each extra move is written as a
// list of conditions in the same shape as src/moves/measures.ts, and its detector is "every condition holds", so
// the live checklist and the detector cannot disagree. Picture measurements are in shoulder widths of the mirrored
// webcam picture; 3D ones are in shoulder widths of the 3D body (see src/moves/handSignals.ts).
// Every threshold in ./moves is a first guess: none has been tried on a real camera.
import type { Baseline, PoseFrame, PoseHistory } from "../../core/types";
import { bodyWidth } from "../../moves/handSignals";
import type { Side } from "../../moves/handSignals";
import { SIDES } from "../../moves/legSignals";
import { readMeasure } from "../../moves/measures";
import type { Measure, Single } from "../../moves/measures";
import { JOINT, distance2d, joint, latest, shoulderCenter, shoulderWidth } from "../../pose/signals";

type Read = Single["read"];
type FrameRead = (frame: PoseFrame, baseline: Baseline | null) => number;
type FrameTest = (frame: PoseFrame, baseline: Baseline | null) => boolean;

export const atLeast = (name: string, threshold: number, read: Read, scale?: number): Single =>
  ({ name, need: "min", threshold, read, ...(scale !== undefined && { scale }) });
export const atMost = (name: string, threshold: number, read: Read, scale?: number): Single =>
  ({ name, need: "max", threshold, read, ...(scale !== undefined && { scale }) });

/** A value read from the newest frame alone. */
export const now = (read: FrameRead): Read => (history) => {
  const frame = latest(history);
  return frame ? read(frame, history.baseline) : NaN;
};

/** Milliseconds since `seen` was last true. Infinity when it is true in none of the frames kept. */
export const since = (seen: FrameTest): Read => (history) => {
  const frame = latest(history);
  const last = history.frames.filter((old) => seen(old, history.baseline)).at(-1);
  return frame && last ? frame.t - last.t : Infinity;
};

/** How long `ok` has been true without a break up to the newest frame, in milliseconds. NaN when it is not true now. */
export const heldFor = (ok: FrameTest): Read => (history) => {
  const frames = history.frames;
  const frame = frames.at(-1);
  if (!frame || !ok(frame, history.baseline)) return NaN;
  let start = frame;
  for (let i = frames.length - 2; i >= 0; i--) {
    const old = frames[i];
    if (!old || !ok(old, history.baseline)) break;
    start = old;
  }
  return frame.t - start.t;
};

/** How long the newest unbroken stretch of `ok` lasted, whether or not it is still going. NaN when there is none. */
export const lastRun = (ok: FrameTest): Read => (history) => {
  const flags = history.frames.map((frame) => ok(frame, history.baseline));
  const end = flags.lastIndexOf(true);
  if (end < 0) return NaN;
  let start = end;
  while (start > 0 && flags[start - 1]) start--;
  return (history.frames[end]?.t ?? 0) - (history.frames[start]?.t ?? 0);
};

export const yes = (ok: boolean): number => (ok ? 1 : 0);

/** True when every condition holds on the newest frame. False with no frames. */
export function met(conditions: readonly Measure[], history: PoseHistory): boolean {
  return history.frames.length > 0 && conditions.every((condition) => readMeasure(condition, history).passed);
}

/** A move either side may make: its conditions for each side, and the side that is making it now, if any. */
export function eitherSide(build: (side: Side) => readonly Measure[]): {
  readonly measures: readonly (readonly Measure[])[];
  side(history: PoseHistory): Side | undefined;
} {
  const measures = SIDES.map(build);
  return { measures, side: (history) => SIDES.find((_, index) => met(measures[index] ?? [], history)) };
}

interface Limb {
  readonly shoulder: number; readonly elbow: number; readonly wrist: number;
  readonly hip: number; readonly knee: number; readonly ankle: number;
}

export function limb(side: Side): Limb {
  return side === "left"
    ? { shoulder: JOINT.leftShoulder, elbow: JOINT.leftElbow, wrist: JOINT.leftWrist, hip: JOINT.leftHip, knee: JOINT.leftKnee, ankle: JOINT.leftAnkle }
    : { shoulder: JOINT.rightShoulder, elbow: JOINT.rightElbow, wrist: JOINT.rightWrist, hip: JOINT.rightHip, knee: JOINT.rightKnee, ankle: JOINT.rightAnkle };
}

/** +1 for the right side, -1 for the left: the mirrored picture has the player's right at the larger x. */
const outward = (side: Side): number => (side === "right" ? 1 : -1);

/** How far picture point `index` is out to `side` of x position `from`, in shoulder widths. NaN with no shoulders. */
function outFrom(frame: PoseFrame, index: number, from: number, side: Side): number {
  const width = shoulderWidth(frame);
  return width === 0 ? NaN : (outward(side) * (joint(frame.image, index).x - from)) / width;
}

/** How far the knee is out to its own side of its hip. 0 standing or with the knee lifted straight in front. */
export function kneeOut(frame: PoseFrame, side: Side): number {
  return outFrom(frame, limb(side).knee, joint(frame.image, limb(side).hip).x, side);
}

/** How far the ankle is out to its own side of its hip. 0 standing; about 1.4 with the leg pushed out sideways. */
export function ankleOut(frame: PoseFrame, side: Side): number {
  return outFrom(frame, limb(side).ankle, joint(frame.image, limb(side).hip).x, side);
}

/** How far the elbow is out to its own side of the body's centre line. About 0.6 hanging, 1.5 lifted out sideways. */
export function elbowOut(frame: PoseFrame, side: Side): number {
  return outFrom(frame, limb(side).elbow, shoulderCenter(frame).x, side);
}

/** How far the elbow is above the shoulder line. About -0.9 hanging, 0 at shoulder height. */
export function elbowRise(frame: PoseFrame, side: Side): number {
  const width = shoulderWidth(frame);
  return width === 0 ? NaN : (shoulderCenter(frame).y - joint(frame.image, limb(side).elbow).y) / width;
}

/** How far the wrist is above the nose. Negative is below it. */
export function wristOverNose(frame: PoseFrame, side: Side): number {
  const width = shoulderWidth(frame);
  return width === 0 ? NaN : (joint(frame.image, JOINT.nose).y - joint(frame.image, limb(side).wrist).y) / width;
}

/** How far the wrist is from its own shoulder in the picture. About 1.7 hanging, under 0.6 with the hand at the shoulder. */
export function handToShoulder(frame: PoseFrame, side: Side): number {
  const width = shoulderWidth(frame);
  const ids = limb(side);
  return width === 0 ? NaN : distance2d(joint(frame.image, ids.wrist), joint(frame.image, ids.shoulder)) / width;
}

/** How far 3D point `index` is toward the camera from 3D point `from`, in 3D shoulder widths. */
function toward(frame: PoseFrame, index: number, from: number, baseline: Baseline | null): number {
  const width = bodyWidth(frame, baseline);
  return width === 0 ? NaN : (joint(frame.world, from).z - joint(frame.world, index).z) / width;
}

/** How far the wrist is in front of its shoulder. 0 hanging, about 1.4 with the arm straight at the camera. */
export function handForward(frame: PoseFrame, side: Side, baseline: Baseline | null): number {
  return toward(frame, limb(side).wrist, limb(side).shoulder, baseline);
}

/** How far the elbow is in front of its shoulder. 0 hanging or pulled back. */
export function elbowForward(frame: PoseFrame, side: Side, baseline: Baseline | null): number {
  return toward(frame, limb(side).elbow, limb(side).shoulder, baseline);
}

/** How far the ankle is in front of its hip. 0 standing. */
export function footForward(frame: PoseFrame, side: Side, baseline: Baseline | null): number {
  return toward(frame, limb(side).ankle, limb(side).hip, baseline);
}
