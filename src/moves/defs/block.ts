import type { MoveDef, PoseFrame } from "../../core/types";
import { JOINT, armThrust, clamp01, joint, latest, recent, shoulderWidth } from "../../pose/signals";

/** A webcam's landmarks shake by about 1% of the frame; the guard is read from this many milliseconds of frames. */
const STEADY_MS = 200;

function mean(frames: readonly PoseFrame[], read: (frame: PoseFrame) => number): number {
  return frames.reduce((sum, frame) => sum + read(frame), 0) / frames.length;
}

/** How far a wrist is from the nose in the picture, with both points averaged over the frames first. */
function reach(frames: readonly PoseFrame[], wrist: number): number {
  return Math.hypot(
    mean(frames, (frame) => joint(frame.image, wrist).x - joint(frame.image, JOINT.nose).x),
    mean(frames, (frame) => joint(frame.image, wrist).y - joint(frame.image, JOINT.nose).y),
  );
}

/** 1 when both fists are within 0.8 shoulder widths of the nose over these frames, 0 from 1.3 out. */
function guard(frames: readonly PoseFrame[]): number {
  const far = Math.max(reach(frames, JOINT.leftWrist), reach(frames, JOINT.rightWrist));
  return clamp01((1.3 - far / mean(frames, shoulderWidth)) / 0.5);
}

export const move: MoveDef = {
  id: "block",
  name: "Block",
  kind: "defend",
  prompt: "BLOCK",
  hint: "Bring both fists up to your face",
  key: " ",
  diagram: { leftElbow: [40, 40], leftWrist: [44, 22], rightElbow: [60, 40], rightWrist: [56, 22] },
  teaches: "Hands high protects your head while you look for a way out",
  detect(history) {
    const frame = latest(history);
    if (!frame) return 0;
    // A punch toward the camera also ends with a fist near the face: not a guard.
    if (armThrust(history, "left") || armThrust(history, "right")) return 0;
    // The newest frame alone puts the guard up at once; the steadied reading keeps it up through the shake.
    return Math.max(guard([frame]), guard(recent(history, STEADY_MS)));
  },
};
