// The warm-up run as a pure state machine: a short "get in view" phase, then one phase per step, then done.
// The screen calls `tick` once per animation frame; everything it shows and hands to the skill check comes from here.
import type { PoseFrame } from "../../core/types";
import type { Assess, Assessment, WarmupStep } from "../contract";

export const READY_MS = 2000;
/** The most frames kept. A 17 second run at 60 frames a second is about 1000. */
export const MAX_FRAMES = 1200;
/** Fewer frames than this in the ready phase means the camera saw nobody. */
export const MIN_READY_FRAMES = 10;

export type RunPhase = "ready" | "step" | "done";

export interface RunState {
  readonly steps: readonly WarmupStep[];
  readonly readyMs: number;
  readonly phase: RunPhase;
  /** The step being asked for: -1 in the ready phase, `steps.length` when done. */
  readonly stepIndex: number;
  /** Milliseconds left in the ready phase or the current step. */
  readonly msLeft: number;
  /** How long the current phase lasts in all, for the time bar. */
  readonly phaseMs: number;
  readonly totalMsLeft: number;
  /** Every frame seen so far, oldest first. The standing frames of the ready phase are kept: they set the baseline. */
  readonly frames: readonly PoseFrame[];
  /** How many frames arrived during the ready phase. */
  readonly readyFrames: number;
  /** When the first step begins, on the clock of `PoseFrame.t`. */
  readonly startedAtMs: number;
  /** When the run began, on the caller's clock. */
  readonly beganAtMs: number;
  /**
   * `PoseFrame.t` minus the caller's clock, read off the first frame; null until a frame arrives.
   * The tracker stamps frames with performance.now(), so on the screen this is close to 0. It is kept so
   * `startedAtMs` stays right if the tracker ever stamps frames with another clock (the video's, say).
   */
  readonly clockOffsetMs: number | null;
}

/** The whole run, ready phase included. */
export function totalMs(steps: readonly WarmupStep[], readyMs = READY_MS): number {
  return steps.reduce((sum, step) => sum + step.ms, readyMs);
}

export function startRun(steps: readonly WarmupStep[], nowMs: number, readyMs = READY_MS): RunState {
  return {
    steps,
    readyMs,
    phase: "ready",
    stepIndex: -1,
    msLeft: readyMs,
    phaseMs: readyMs,
    totalMsLeft: totalMs(steps, readyMs),
    frames: [],
    readyFrames: 0,
    startedAtMs: nowMs + readyMs,
    beganAtMs: nowMs,
    clockOffsetMs: null,
  };
}

/** Moves the run to `nowMs` and keeps `frame` when there is one. A finished run does not change. */
export function tick(state: RunState, nowMs: number, frame: PoseFrame | null): RunState {
  if (state.phase === "done") return state;
  const elapsed = Math.max(0, nowMs - state.beganAtMs);
  const clockOffsetMs = state.clockOffsetMs ?? (frame ? frame.t - nowMs : null);
  // Past the cap the oldest frames go, so the last steps are never lost.
  const frames = frame ? [...state.frames, frame].slice(-MAX_FRAMES) : state.frames;
  const readyFrames = state.readyFrames + (frame && elapsed < state.readyMs ? 1 : 0);
  const kept = { frames, readyFrames, clockOffsetMs, startedAtMs: state.beganAtMs + state.readyMs + (clockOffsetMs ?? 0) };
  const totalMsLeft = Math.max(0, totalMs(state.steps, state.readyMs) - elapsed);

  if (elapsed < state.readyMs) {
    return { ...state, ...kept, phase: "ready", stepIndex: -1, msLeft: state.readyMs - elapsed, phaseMs: state.readyMs, totalMsLeft };
  }
  let end = state.readyMs;
  for (const [index, step] of state.steps.entries()) {
    end += step.ms;
    if (elapsed < end) return { ...state, ...kept, phase: "step", stepIndex: index, msLeft: end - elapsed, phaseMs: step.ms, totalMsLeft };
  }
  return { ...state, ...kept, phase: "done", stepIndex: state.steps.length, msLeft: 0, phaseMs: 0, totalMsLeft: 0 };
}

/** True when the camera saw (almost) nobody while the player was asked to stand in view: nothing to judge. */
export function nobodySeen(state: RunState): boolean {
  return state.readyFrames < MIN_READY_FRAMES;
}

/** Hands the kept frames to the skill check. */
export function finish(state: RunState, assess: Assess): Assessment {
  return assess(state.frames, state.startedAtMs, state.steps);
}

/** "dodge_left" reads as "Dodge left". */
export function plainName(moveId: string): string {
  const words = moveId.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const LEVEL_LINE: Record<Assessment["level"], string> = {
  beginner: "Your level: beginner",
  average: "Your level: average",
  good: "Your level: good",
};

/** What the screen tells the player when nothing else is given: the level, what to work on, what is already strong. */
export function resultLines(assessment: Assessment, nameOf: (moveId: string) => string = plainName): string[] {
  const lines = [LEVEL_LINE[assessment.level]];
  for (const focus of assessment.focus) lines.push(`Work on ${nameOf(focus.moveId)}: ${focus.tip}`);
  if (assessment.strong.length > 0) lines.push(`Already strong: ${assessment.strong.map(nameOf).join(", ")}`);
  return lines;
}
