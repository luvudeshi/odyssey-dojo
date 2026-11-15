// What the fight's flash says about a move the moment it counts: a grade word, the bonus for that grade and, when
// something was off, one short tip ("Hands too low"). The grading is strikeFeedback.ts; the flash is the MISS
// flash's own element (src/hud/MissFlash.tsx). This file is what sits between them and can be tested without a
// screen: which moments get a flash, whether the body may be read, how long the flash stays, and the rule that
// only one is ever up. Nothing here is spoken or played, and the bonus is a number in the flash only: the fight's
// score is not touched.
import type { CombatEvent, CombatInput, CombatPhase, PoseHistory } from "../../core/types";
import { strikeFeedback } from "./strikeFeedback";
import type { FeedbackGrade, StrikeFeedback } from "./strikeFeedback";

/** What the flash shows: strikeFeedback's own answer. */
export type FlashFeedback = StrikeFeedback;

/** The four grades as the stylesheet names them (`data-feedback`). */
export const GRADE_KEYS: Readonly<Record<FeedbackGrade, string>> = {
  EXCELLENT: "excellent", GREAT: "great", GOOD: "good", "NEEDS IMPROVEMENT": "needs-improvement",
};

/** What a screen reader is told: one sentence with the same facts as the flash. */
export function spokenLine(feedback: FlashFeedback): string {
  const word = feedback.grade.charAt(0) + feedback.grade.slice(1).toLowerCase();
  return `${word}, ${String(feedback.points)} points.${feedback.tip ? ` ${feedback.tip}.` : ""}`;
}

// ---------- which moments get a flash ----------

/** A move made on a key this short a time ago was a key press, not a body move: the body is not read for it. */
export const KEY_WINDOW_MS = 500;

/** The defend a phase asks for and whether it has been made (the same reading as the HUD's defend chip). */
function defendOf(phase: CombatPhase): { counter: string | null; met: boolean } {
  const defend = phase.kind === "defend";
  return { counter: defend ? phase.attack.counter : null, met: defend && phase.seen === "met" };
}

/**
 * The defend that has just counted, or null: made while the attack is coming (the phase turns "met"), or, for one
 * held from before, when the attack lands on it and the strike opens. The same rule as the HUD's defend chip, so
 * the grade comes up with the chip, while the body is still in the defend.
 */
export function defendJustCounted(from: CombatPhase, to: CombatPhase): string | null {
  const [last, now] = [defendOf(from), defendOf(to)];
  if (now.met && !(last.met && last.counter === now.counter)) return now.counter;
  if (from.kind === "defend" && !last.met && to.kind === "strike") return last.counter;
  return null;
}

/**
 * Call once per frame of the fight, after the engine's step. Returns the feedback to flash now, or null.
 *   from, to   the phase before and after the step
 *   keys       what the keyboard gave this frame (not the camera's part of the input)
 *   events     the step's events
 *   history    the pose history the detectors read; null with no camera
 * A strike that landed is graded from its event, a defend the moment it counts. A move made on a key gets its
 * grade with no tip, even with the camera on: the body did not make it, so the body is not read.
 */
export type FeedbackWatch = (
  from: CombatPhase, to: CombatPhase, keys: CombatInput, events: readonly CombatEvent[], history: PoseHistory | null, nowMs: number,
) => FlashFeedback | null;

export function createFeedbackWatch(): FeedbackWatch {
  const keyAt = new Map<string, number>();
  return (from, to, keys, events, history, nowMs) => {
    for (const strike of keys.struck) keyAt.set(strike.move, nowMs);
    for (const move of keys.held) keyAt.set(move, nowMs);
    const body = (move: string): PoseHistory | null => (nowMs - (keyAt.get(move) ?? -Infinity) <= KEY_WINDOW_MS ? null : history);
    // The last strike of the frame wins: with two players both may land at once, and there is one flash.
    let hit: Extract<CombatEvent, { type: "enemyHit" }> | null = null;
    for (const event of events) if (event.type === "enemyHit") hit = event;
    if (hit) return strikeFeedback(hit.move, body(hit.move), hit.quality);
    const defend = defendJustCounted(from, to);
    return defend === null ? null : strikeFeedback(defend, body(defend));
  };
}

// ---------- how long it stays, and one at a time ----------

/** MISS stays this long (as it always has). */
export const MISS_MS = 700;
/** A grade pops in over this long, ... */
export const POP_IN_MS = 160;
/** ...stands still this long, enough to read a word, a number and a five-word tip, ... */
export const POP_HOLD_MS = 1400;
/** ...and fades over this long. */
export const POP_OUT_MS = 340;
export const POP_TOTAL_MS = POP_IN_MS + POP_HOLD_MS + POP_OUT_MS;

/** The one flash on screen: MISS (`feedback` null) or a grade. */
export interface Flash {
  readonly id: number;
  readonly feedback: FlashFeedback | null;
}

/** `id` is the number of the last flash shown; it goes up by one with every flash. */
export interface FlashState {
  readonly id: number;
  readonly showing: Flash | null;
}

export const NO_FLASH: FlashState = { id: 0, showing: null };

export type FlashAction =
  | { readonly type: "show"; readonly feedback: FlashFeedback | null }
  | { readonly type: "expire"; readonly id: number };

/**
 * One flash at a time. A new one takes the place of the one showing, however fresh that one is, so quick moves
 * never pile up; and the timer of a flash that was replaced cannot take the new one down (its id no longer matches).
 */
export function flashStep(last: FlashState, action: FlashAction): FlashState {
  if (action.type === "show") {
    const id = last.id + 1;
    return { id, showing: { id, feedback: action.feedback } };
  }
  return last.showing?.id === action.id ? { id: last.id, showing: null } : last;
}

/** How long a flash stays up before it is taken away. */
export function flashMs(flash: Flash): number {
  return flash.feedback ? POP_TOTAL_MS : MISS_MS;
}
