// Is the player's body usable by the tracker right now, and the timing rules built on that.
import type { PoseFrame, PoseHistory } from "../core/types";
import { JOINT, joint, latest, shoulderCenter, shoulderWidth } from "./signals";

export type PresenceReason = "step back" | "step closer" | "move into view" | "I can't see you";
export type Presence = { readonly ok: true } | { readonly ok: false; readonly reason: PresenceReason };

const MIN_VISIBILITY = 0.5;
const MIN_WIDTH = 0.1;
const MAX_WIDTH = 0.5;
const CENTER_RANGE = [0.25, 0.75] as const;
/** A frame older than this means the tracker has stopped seeing anyone. */
const STALE_MS = 300;
const REQUIRED = [
  JOINT.leftShoulder, JOINT.rightShoulder, JOINT.leftHip, JOINT.rightHip, JOINT.leftWrist, JOINT.rightWrist,
] as const;

export function checkPresence(frame: PoseFrame): Presence {
  if (REQUIRED.some((index) => joint(frame.image, index).visibility < MIN_VISIBILITY)) {
    return { ok: false, reason: "I can't see you" };
  }
  const width = shoulderWidth(frame);
  if (width > MAX_WIDTH) return { ok: false, reason: "step back" };
  if (width < MIN_WIDTH) return { ok: false, reason: "step closer" };
  const { x } = shoulderCenter(frame);
  if (x < CENTER_RANGE[0] || x > CENTER_RANGE[1]) return { ok: false, reason: "move into view" };
  return { ok: true };
}

/** Presence at time `now`: a missing or stale frame counts as not seen. */
export function presenceAt(history: PoseHistory, now: number): Presence {
  const frame = latest(history);
  if (!frame || now - frame.t > STALE_MS) return { ok: false, reason: "I can't see you" };
  return checkPresence(frame);
}

export const COUNTDOWN_MS = 3000;

/** Calibration timer: counts only while the body is usable, and starts over when it is lost. */
export function countdownStep(elapsedMs: number, ok: boolean, dtMs: number): number {
  return ok ? Math.min(COUNTDOWN_MS, elapsedMs + dtMs) : 0;
}

export const LOST_MS = 700;
export const GRACE_MS = 1000;

export interface Gate {
  readonly paused: boolean;
  /** While running: how long the body has been missing. While paused: how long it has been back. */
  readonly ms: number;
}
export const GATE_START: Gate = { paused: false, ms: 0 };

/** Pause after the body is lost for LOST_MS; resume once it has been back for GRACE_MS. */
export function gateStep(gate: Gate, ok: boolean, dtMs: number): Gate {
  if (gate.paused) {
    const back = ok ? gate.ms + dtMs : 0;
    return back >= GRACE_MS ? GATE_START : { paused: true, ms: back };
  }
  const lost = ok ? 0 : gate.ms + dtMs;
  return lost > LOST_MS ? { paused: true, ms: 0 } : { paused: false, ms: lost };
}
