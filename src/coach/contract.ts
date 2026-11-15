// What the warm-up screen and the skill check agree on. The screen shows the steps and collects frames;
// the skill check turns those frames into an assessment. Types only, so either side can be built alone.
import type { PoseFrame } from "../core/types";
import type { Habit } from "./habits";

/** One thing the warm-up asks the player to do. */
export interface WarmupStep {
  readonly id: string;
  /** The move to make, an id from src/moves/defs. */
  readonly moveId: string;
  /** What the screen says, at most 40 characters. */
  readonly say: string;
  /** How long the player has, in milliseconds. */
  readonly ms: number;
  /** Time after the step when nothing is asked (the grade is on screen), in milliseconds. Left out: none. */
  readonly restMs?: number;
}

export type SkillLevel = "beginner" | "average" | "good";

export interface StepResult {
  readonly step: WarmupStep;
  /** Whether the move was seen inside the step's time. */
  readonly done: boolean;
  /** Milliseconds from the start of the step to the move, or null when it was not seen. */
  readonly reactMs: number | null;
  /** How well it was made, 0 to 1. 0 when it was not seen. */
  readonly quality: number;
}

export interface Focus {
  readonly moveId: string;
  /** One line on what to change, at most 90 characters. */
  readonly tip: string;
}

export interface Assessment {
  readonly level: SkillLevel;
  /** The moves to work on, weakest first, at most two. */
  readonly focus: readonly Focus[];
  /** Ids of the moves the player already makes well. */
  readonly strong: readonly string[];
  readonly habits: readonly Habit[];
  readonly steps: readonly StepResult[];
}

/** Turns the frames of a warm-up into an assessment. `startedAtMs` is the time (same clock as `PoseFrame.t`) the first step began. */
export type Assess = (frames: readonly PoseFrame[], startedAtMs: number, steps: readonly WarmupStep[]) => Assessment;
