// The warm-up run with a grade after every step, as a pure state machine: a short "get in view" phase, then for
// each step the step itself and a rest while its grade is on screen, then done. A step ends early, a moment after
// its move is seen, so a player who makes the moves is through in about the same time as before.
// The screen calls `advance` once per animation frame. The moves are read with the same detectors, on the same
// kind of history, as the skill check (`assessWarmup`), which is handed the steps as they were really timed.
import type { PoseFrame, PoseHistory } from "../../core/types";
import { MOVES } from "../../moves/registry";
import { EMPTY_HISTORY, clamp01, pushFrame } from "../../pose/signals";
import type { Assess, Assessment, StepResult, WarmupStep } from "../contract";
import { feedbackFor } from "../warmupGrades";
import type { StepFeedback } from "../warmupGrades";
import { MIN_READY_FRAMES, READY_MS } from "./run";

/** How long a grade stays on screen before the next step is asked for. */
export const FEEDBACK_MS = 1200;
/** A step stays open this long after its move is seen, so a defense can be read at its surest. */
export const HOLD_MS = 350;
/** The most frames kept: about 25 seconds at 60 frames a second, more than the longest run. */
export const MAX_GRADED_FRAMES = 2400;
/** A move counts as seen at this confidence: the same line the fight uses (src/input/poseInput.ts). */
const ON = 0.7;

export type GradedPhase = "ready" | "step" | "rest" | "done";

export interface GradedRun {
  readonly steps: readonly WarmupStep[];
  readonly readyMs: number;
  readonly phase: GradedPhase;
  /** The step being asked for or just graded: -1 in the ready phase, `steps.length` when done. */
  readonly stepIndex: number;
  /** Milliseconds left in the phase, and how long it lasts in all. A step that ends early has time left over. */
  readonly msLeft: number;
  readonly phaseMs: number;
  /** When the phase began and when the run began, on the caller's clock. */
  readonly phaseStartMs: number;
  readonly beganAtMs: number;
  /** Every frame seen so far, oldest first; the standing frames of the ready phase set the baseline. */
  readonly frames: readonly PoseFrame[];
  readonly readyFrames: number;
  /** `PoseFrame.t` minus the caller's clock, read off the first frame; null until one arrives. */
  readonly clockOffsetMs: number | null;
  /** What the detectors are looking at: the last second of frames and the standing measure. */
  readonly history: PoseHistory;
  /** The frames of the step being asked for. */
  readonly stepFrames: readonly PoseFrame[];
  /** When the step's move was first seen, on the caller's clock, with how long it took and how well a strike was thrown. */
  readonly seen: { readonly atMs: number; readonly reactMs: number; readonly thrown: number | null } | null;
  /** The surest the step's detector got. */
  readonly peak: number;
  /** One entry per finished step. */
  readonly feedback: readonly StepFeedback[];
  /** How long each finished step really lasted, in milliseconds. */
  readonly taken: readonly number[];
  readonly points: number;
}

export function startGraded(steps: readonly WarmupStep[], nowMs: number, readyMs = READY_MS): GradedRun {
  return {
    steps, readyMs, phase: "ready", stepIndex: -1, msLeft: readyMs, phaseMs: readyMs, phaseStartMs: nowMs, beganAtMs: nowMs,
    frames: [], readyFrames: 0, clockOffsetMs: null, history: EMPTY_HISTORY, stepFrames: [], seen: null, peak: 0,
    feedback: [], taken: [], points: 0,
  };
}

/** The run at the start of step `index`, or done when there is no such step. */
function toStep(state: GradedRun, index: number, atMs: number): GradedRun {
  const step = state.steps[index];
  if (!step) return { ...state, phase: "done", stepIndex: state.steps.length, msLeft: 0, phaseMs: 0, phaseStartMs: atMs };
  return { ...state, phase: "step", stepIndex: index, msLeft: step.ms, phaseMs: step.ms, phaseStartMs: atMs, stepFrames: [], seen: null, peak: 0 };
}

/** Moves the run to `nowMs` and takes in `frame` when there is one. A finished run does not change. */
export function advance(state: GradedRun, nowMs: number, frame: PoseFrame | null): GradedRun {
  if (state.phase === "done") return state;
  const usable = frame && Number.isFinite(frame.t) ? frame : null;
  const clockOffsetMs = state.clockOffsetMs ?? (usable ? usable.t - nowMs : null);
  let run: GradedRun = usable
    ? { ...state, clockOffsetMs, frames: [...state.frames, usable].slice(-MAX_GRADED_FRAMES), history: pushFrame(state.history, usable) }
    : state;

  if (run.phase === "ready") {
    if (nowMs - run.beganAtMs < run.readyMs) {
      return { ...run, readyFrames: run.readyFrames + (usable ? 1 : 0), msLeft: run.readyMs - Math.max(0, nowMs - run.beganAtMs) };
    }
    run = toStep(run, 0, run.beganAtMs + run.readyMs);
  }
  if (run.phase === "rest") {
    const until = run.phaseStartMs + run.phaseMs;
    if (nowMs < until) return { ...run, msLeft: until - nowMs };
    run = toStep(run, run.stepIndex + 1, until);
  }
  const step = run.steps[run.stepIndex];
  if (run.phase !== "step" || !step) return run;

  const move = MOVES.get(step.moveId);
  const startT = run.phaseStartMs + (clockOffsetMs ?? 0);
  if (usable && move && usable.t >= startT && usable.t < startT + step.ms) {
    const confidence = move.detect(run.history);
    const seen = run.seen ?? (confidence >= ON ? { atMs: nowMs, reactMs: usable.t - startT, thrown: move.quality?.(run.history) ?? null } : null);
    run = { ...run, stepFrames: [...run.stepFrames, usable], peak: Math.max(run.peak, Number.isFinite(confidence) ? confidence : 0), seen };
  }
  const end = Math.min(run.phaseStartMs + step.ms, run.seen ? run.seen.atMs + HOLD_MS : Infinity);
  if (nowMs < end) return { ...run, msLeft: run.phaseStartMs + step.ms - nowMs };

  // A strike says how well it was thrown; a defense is as good as the surest the detector got. Same as the skill check.
  const quality = run.seen ? clamp01(run.seen.thrown ?? run.peak) : 0;
  const result: StepResult = { step, done: run.seen !== null, reactMs: run.seen?.reactMs ?? null, quality: Number.isFinite(quality) ? quality : 0 };
  const graded = feedbackFor(result, run.stepFrames, run.history.baseline);
  return {
    ...run, phase: "rest", msLeft: FEEDBACK_MS, phaseMs: FEEDBACK_MS, phaseStartMs: end,
    feedback: [...run.feedback, graded], taken: [...run.taken, end - run.phaseStartMs], points: run.points + graded.grade.points,
  };
}

/** True when the camera saw (almost) nobody while the player was asked to stand in view: nothing to grade. */
export function nobodyThere(state: GradedRun): boolean {
  return state.phase !== "ready" && state.readyFrames < MIN_READY_FRAMES;
}

/** The steps as they were really timed: each as long as it lasted, with the rest its grade was shown for. */
export function timedSteps(state: GradedRun): WarmupStep[] {
  return state.steps.map((step, index) => ({ ...step, ms: state.taken[index] ?? step.ms, restMs: FEEDBACK_MS }));
}

/** Hands the kept frames and the real timing to the skill check. `startedAtMs` is on the frames' clock. */
export function finishGraded(state: GradedRun, assess: Assess): Assessment {
  return assess(state.frames, state.beganAtMs + state.readyMs + (state.clockOffsetMs ?? 0), timedSteps(state));
}
