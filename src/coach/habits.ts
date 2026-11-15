// Scores a warm-up (three punches, hands up, a step left and right) into the player's two weakest habits.
// Pure: frames in, habits out. Every threshold here is a first guess, not yet tuned on a real body.
import type { PoseFrame } from "../core/types";
import { JOINT, clamp01, elbowAngle, joint, shoulderCenter, shoulderWidth } from "../pose/signals";

export type DefenseId = "block" | "duck" | "dodge_left" | "dodge_right";
export type HabitId = "dropped_hands" | "low_guard" | "weak_left" | "weak_right" | "short_punches";

export interface Habit {
  readonly id: HabitId;
  readonly label: string;
  /** One line telling the player how to fix it. */
  readonly tip: string;
  /** 0..1: how bad it is. */
  readonly severity: number;
  /** The defense this habit needs practice in, or "strike" for a habit of the player's own punches. */
  readonly trains: DefenseId | "strike";
}

type Side = "left" | "right";
interface Punch {
  readonly side: Side;
  readonly t: number;
  readonly angle: number;
}

const MIN_FRAMES = 10;
const MIN_SPAN_MS = 1000;
/** Habits milder than this are not worth a tip. */
const MIN_SEVERITY = 0.15;
/** Elbow angle under which the arm counts as bent, ready to punch (same as armThrust in pose/signals). */
const BENT_DEG = 115;
const PUNCH_MS = 400;
const AFTER_PUNCH_MS = 500;
/** A punch this straight or straighter is a full punch; one at SHORT_DEG or under is as short as it gets. */
const FULL_DEG = 165;
const SHORT_DEG = 120;
/** A full dodge, in shoulder widths (same as the dodge detectors). */
const FULL_STEP = 0.6;

const TEXT: Record<HabitId, readonly [label: string, tip: string, trains: Habit["trains"]]> = {
  dropped_hands: ["Hands drop after a punch", "Pull your fist back to your chin after each punch to cover your face.", "block"],
  low_guard: ["Low guard", "Keep both fists up by your cheeks: that is what covers your head.", "block"],
  weak_left: ["Weaker left side", "Step further to your left. Move your whole chest, not only your head.", "dodge_left"],
  weak_right: ["Weaker right side", "Step further to your right. Move your whole chest, not only your head.", "dodge_right"],
  short_punches: ["Short punches", "Straighten your arm all the way on each punch, then pull it back.", "strike"],
};

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
}

function wrist(side: Side): number {
  return side === "left" ? JOINT.leftWrist : JOINT.rightWrist;
}

/** True when the fist is out in front at shoulder height: the far end of a punch. */
function reaching(frame: PoseFrame, side: Side): boolean {
  const shoulder = joint(frame.world, side === "left" ? JOINT.leftShoulder : JOINT.rightShoulder);
  const fist = joint(frame.world, wrist(side));
  return Math.abs(fist.y - shoulder.y) < 0.3 && shoulder.z - fist.z > 0.2;
}

/** Each time an arm goes from bent to reaching forward, with the straightest elbow it got to. */
function punches(frames: readonly PoseFrame[], side: Side): Punch[] {
  const found: Punch[] = [];
  let cocked = false;
  let i = 0;
  for (let start = frames[i]; start; start = frames[i]) {
    if (elbowAngle(start, side) < BENT_DEG || !cocked) {
      cocked = cocked || elbowAngle(start, side) < BENT_DEG;
      i += 1;
      continue;
    }
    cocked = false;
    let peak: Punch | null = null;
    for (let next = frames[i]; next; next = frames[i]) {
      const angle = elbowAngle(next, side);
      if (next.t - start.t > PUNCH_MS || angle < BENT_DEG) break;
      if (reaching(next, side) && (!peak || angle > peak.angle)) peak = { side, t: next.t, angle };
      i += 1;
    }
    if (peak) found.push(peak);
  }
  return found;
}

/**
 * The player's two weakest habits, worst first. Empty when there are too few frames to judge
 * (keyboard-only play has none) or when nothing is weak enough to be worth a tip.
 */
export function scoreWarmup(frames: readonly PoseFrame[]): Habit[] {
  const seen = frames.filter((frame) => Number.isFinite(frame.t) && shoulderWidth(frame) > 0);
  const span = (seen.at(-1)?.t ?? 0) - (seen[0]?.t ?? 0);
  const width = median(seen.map(shoulderWidth));
  if (seen.length < MIN_FRAMES || span < MIN_SPAN_MS || !(width > 0)) return [];
  const centerX = median(seen.map((frame) => shoulderCenter(frame).x));
  /** How far a point sits below the shoulder line, in shoulder widths. */
  const below = (frame: PoseFrame, index: number): number =>
    (joint(frame.image, index).y - shoulderCenter(frame).y) / width;

  const thrown = [...punches(seen, "left"), ...punches(seen, "right")];
  // (a) After each punch, how far that fist falls below the shoulders in the next half second.
  const drops = thrown.map((punch) =>
    Math.max(
      0,
      ...seen
        .filter((frame) => frame.t > punch.t && frame.t <= punch.t + AFTER_PUNCH_MS)
        .map((frame) => below(frame, wrist(punch.side))),
    ),
  );
  // (b) Of the frames with both fists raised above the elbows, the share with a fist under the shoulders.
  const raised = seen.filter(
    (frame) =>
      below(frame, JOINT.leftWrist) < below(frame, JOINT.leftElbow) - 0.15 &&
      below(frame, JOINT.rightWrist) < below(frame, JOINT.rightElbow) - 0.15,
  );
  const low = raised.filter((frame) => Math.max(below(frame, JOINT.leftWrist), below(frame, JOINT.rightWrist)) > 0.1);
  // (c) The furthest the chest got to each side. The picture is mirrored, so the player's left is smaller x.
  const shifts = seen.map((frame) => (shoulderCenter(frame).x - centerX) / width);
  const reachLeft = Math.max(0, ...shifts.map((shift) => -shift));
  const reachRight = Math.max(0, ...shifts);

  const scores: readonly (readonly [HabitId, number])[] = [
    ["dropped_hands", (mean(drops) - 0.2) / 1],
    ["low_guard", raised.length < 5 ? 1 : low.length / raised.length],
    [reachLeft <= reachRight ? "weak_left" : "weak_right", (FULL_STEP - Math.min(reachLeft, reachRight)) / FULL_STEP],
    // (d) How straight the arm got at the end of each punch.
    ["short_punches", thrown.length === 0 ? 0 : (FULL_DEG - mean(thrown.map((p) => p.angle))) / (FULL_DEG - SHORT_DEG)],
  ];
  return scores
    .map(([id, raw]) => {
      const [label, tip, trains] = TEXT[id];
      return { id, label, tip, severity: Number.isFinite(raw) ? clamp01(raw) : 0, trains };
    })
    .filter((habit) => habit.severity >= MIN_SEVERITY)
    .sort((a, b) => b.severity - a.severity) // Array.sort is stable: ties keep the order above.
    .slice(0, 2);
}
