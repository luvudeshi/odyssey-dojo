// What the fight's flash says about an attempt that needs work, and when. In story mode the flash is only for
// attempts to improve on: a strike that landed but was graded GOOD or NEEDS IMPROVEMENT with something to fix, a
// strike prompt that went by with no strike (MISS, with how to do it), and a defend that failed (the attack hit).
// A strong strike (EXCELLENT or GREAT) and a defend that held get nothing from here: the game's own hit word stays
// as it is. No points are shown (the fight's score is not touched). The grading is strikeFeedback.ts; the flash is
// the MISS flash's own element (src/hud/MissFlash.tsx). Nothing here is spoken or played.
import type { CombatEvent, CombatInput, CombatPhase, PoseHistory } from "../../core/types";
import { MOVES } from "../../moves/registry";
import { TIP_MAX, strikeFeedback, tipsFor } from "./strikeFeedback";
import type { StrikeFeedback } from "./strikeFeedback";

/** The word on the flash: MISS, or one of the two grades that leave something to fix. */
export type FlashWord = "MISS" | "GOOD" | "NEEDS IMPROVEMENT";

/** What the flash shows: a word and one short line on what to do. */
export interface FlashFeedback {
  readonly word: FlashWord;
  readonly tip: string | null;
}

/** The words as the stylesheet names them (`data-feedback`). */
export const WORD_KEYS: Readonly<Record<FlashWord, string>> = { MISS: "miss", GOOD: "good", "NEEDS IMPROVEMENT": "needs-improvement" };

/** What a screen reader is told: one sentence with the same words as the flash. */
export function spokenLine(feedback: FlashFeedback): string {
  const word = feedback.word.charAt(0) + feedback.word.slice(1).toLowerCase();
  return `${word}.${feedback.tip ? ` ${feedback.tip}.` : ""}`;
}

/**
 * The story-mode rule for a strike that landed: flashed only when it needs improvement and there is something to
 * say. EXCELLENT and GREAT never are, and neither is a grade with no tip (a key press has no body to read).
 */
export function shouldShowFeedback(feedback: StrikeFeedback): boolean {
  return (feedback.grade === "GOOD" || feedback.grade === "NEEDS IMPROVEMENT") && feedback.tip !== null;
}

/** A landed strike's flash, or null when the rule above says nothing is shown. */
export function landedStrike(feedback: StrikeFeedback): FlashFeedback | null {
  if (!shouldShowFeedback(feedback)) return null;
  return { word: feedback.grade === "GOOD" ? "GOOD" : "NEEDS IMPROVEMENT", tip: feedback.tip };
}

// ---------- the line under the word ----------

/** The arrow keys as the prompt card prints them. */
const ARROWS: Readonly<Record<string, string>> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };

/** On the keyboard the reminder is the key: "Press J" for a strike, "Hold Space" or "Hold →" for a defend. */
export function keyReminder(moveId: string, defend: boolean): string | null {
  const key = MOVES.get(moveId)?.key;
  if (!key) return null;
  const name = key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : ARROWS[key] ?? key;
  return `${defend ? "Hold" : "Press"} ${name}`;
}

/** How to make a strike, in a glance: the move's first tip, else its hint when that is short enough. */
export function howTo(moveId: string): string | null {
  const first = tipsFor(moveId)[0];
  if (first) return first;
  const hint = MOVES.get(moveId)?.hint ?? "";
  return hint && hint.length <= TIP_MAX ? hint : null;
}

/** A strike prompt went by with no strike: MISS and what to do, read from the body over the prompt when it can be. */
export function missedStrike(moveId: string, history: PoseHistory | null, sinceMs: number): FlashFeedback {
  if (history === null) return { word: "MISS", tip: keyReminder(moveId, false) ?? howTo(moveId) };
  const frames = history.frames.filter((frame) => frame.t >= sinceMs);
  const tip = frames.length > 0 ? strikeFeedback(moveId, frames).tip : null;
  return { word: "MISS", tip: tip ?? howTo(moveId) };
}

/** No move at all in the warning, or nothing better to say. */
export const REACT_TIP = "React sooner";

/**
 * Stand-in for defendMissFeedback (branch defend-timing-tips: same arguments, same answer): what went wrong with a
 * defend that failed, read from the body over the warning. Until that lands it always says "React sooner". To swap
 * it in, change the one call in failedDefend below to `defendMissFeedback(...)`, imported from "./defendMissFeedback".
 */
export function defendMissStandIn(_defendId: string, _history: PoseHistory, _startMs: number, _endMs: number): StrikeFeedback {
  return { grade: "NEEDS IMPROVEMENT", points: 0, tip: REACT_TIP };
}

/** A defend that failed: NEEDS IMPROVEMENT and what went wrong; on the keyboard, the key to hold. */
export function failedDefend(defendId: string, history: PoseHistory | null, startMs: number, endMs: number): FlashFeedback {
  if (history === null) return { word: "NEEDS IMPROVEMENT", tip: keyReminder(defendId, true) ?? REACT_TIP };
  return { word: "NEEDS IMPROVEMENT", tip: defendMissStandIn(defendId, history, startMs, endMs).tip ?? REACT_TIP };
}

// ---------- which moments get a flash ----------

/** A move made on a key this short a time ago was a key press, not a body move: the body is not read for it. */
export const KEY_WINDOW_MS = 500;

/** The move a phase asks for, and whether it is a defend. */
function asked(phase: CombatPhase): { move: string | null; defend: boolean } {
  if (phase.kind === "strike" || phase.kind === "finisher") return { move: phase.move, defend: false };
  if (phase.kind === "defend") return { move: phase.attack.counter, defend: true };
  return { move: null, defend: false };
}

/**
 * Call once per frame of the fight, after the engine's step. Returns what to flash now, or null.
 *   from, to   the phase before and after the step
 *   keys       what the keyboard gave this frame (not the camera's part of the input)
 *   events     the step's events
 *   history    the pose history the detectors read; null when the camera is not playing (keyboard)
 *   missed     the MISS watch fired this frame (a wrong or fizzled try)
 */
export type FeedbackWatch = (
  from: CombatPhase, to: CombatPhase, keys: CombatInput, events: readonly CombatEvent[], history: PoseHistory | null, nowMs: number, missed: boolean,
) => FlashFeedback | null;

export function createFeedbackWatch(): FeedbackWatch {
  const keyAt = new Map<string, number>();
  let prompt = "";
  let promptAt = 0;
  return (from, to, keys, events, history, nowMs, missed) => {
    for (const strike of keys.struck) keyAt.set(strike.move, nowMs);
    for (const move of keys.held) keyAt.set(move, nowMs);
    const body = (move: string): PoseHistory | null => (nowMs - (keyAt.get(move) ?? -Infinity) <= KEY_WINDOW_MS ? null : history);
    const ask = asked(from);
    const key = ask.move === null ? "" : `${from.kind}:${ask.move}`;
    if (key !== prompt) { prompt = key; promptAt = nowMs; }
    // The last strike of the frame wins: with two players both may land at once, and there is one flash.
    let hit: Extract<CombatEvent, { type: "enemyHit" }> | null = null;
    for (const event of events) if (event.type === "enemyHit") hit = event;
    if (hit) return landedStrike(strikeFeedback(hit.move, body(hit.move), hit.quality));
    for (const event of events) {
      if (event.type === "playerHit") return to.kind === "lost" ? null : failedDefend(event.attack.counter, body(event.attack.counter), promptAt, nowMs);
    }
    if (ask.move !== null && !ask.defend && (missed || events.some((event) => event.type === "whiffed"))) {
      // A wrong key, or no key at all, on the keyboard: the key reminder.
      return missedStrike(ask.move, keys.struck.length > 0 ? null : history, promptAt);
    }
    return null;
  };
}

// ---------- how long it stays, and one at a time ----------

/** A plain MISS (the Dojo's, or a wrong defend, with no line under it) stays this long, as it always has. */
export const MISS_MS = 700;
/** A flash with a line pops in over this long, ... */
export const POP_IN_MS = 160;
/** ...stands still this long, enough to read a word and a five-word tip, ... */
export const POP_HOLD_MS = 1400;
/** ...and fades over this long. */
export const POP_OUT_MS = 340;
export const POP_TOTAL_MS = POP_IN_MS + POP_HOLD_MS + POP_OUT_MS;

/** The one flash on screen: a plain MISS (`feedback` null) or a word with its line. */
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
