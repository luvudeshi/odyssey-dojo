// What to tell the player when the divine power meter is full, and when to say it aloud. Pure: no DOM, no clock.
// The engine (src/combat/engine.ts) spends a full meter on a strike with any god gesture move, in a defend or strike
// beat. Until now nothing on screen said so: the bar only glowed, so nobody used the power.
import { GODS } from "../gods/gods";
import type { GodId } from "../gods/gods";
import { MOVES } from "../../moves/registry";

/** The god whose power a player with no god of their own is lent: Athena, who coaches every fight. */
export const LENDER: GodId = "athena";

export interface PowerPrompt {
  /** Whose power it is: the player's god, or Athena when they have none. */
  readonly god: GodId;
  /** The god's colour, for the banner. */
  readonly accent: string;
  /** For example "POSEIDON'S POWER IS READY". */
  readonly title: string;
  /** The id of the god gesture move, for example "trident_sweep". */
  readonly moveId: string;
  /** The move's name as the prompt card and the power effect shout it, for example "TRIDENT SWEEP". */
  readonly move: string;
  /** How to do it in a few words: the gesture for camera play, "Press 2" for keyboard play. */
  readonly how: string;
  /** The key that throws the move, as shown on a key cap ("2", "Space"). Null if the move is not registered. */
  readonly key: string | null;
  /** Athena's clip that calls this move. */
  readonly callId: string;
}

/** A KeyboardEvent.key value as it is printed on a key cap. */
function keyCap(key: string): string {
  return key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key;
}

/** The banner's words. `god` is null for keyboard play or a skipped scan; `keyboard` is true when no camera is in use. */
export function powerPrompt(god: GodId | null, keyboard: boolean): PowerPrompt {
  const owner = GODS[god ?? LENDER];
  const { moveId, name, blurb } = owner.power;
  const def = MOVES.get(moveId);
  const key = def ? keyCap(def.key) : null;
  // The god's own line (gods.ts) is the shortest that names every part of the gesture the detector needs; the move's
  // hint on the prompt card says the same at twice the length, which does not fit beside the hero.
  return {
    god: owner.id,
    accent: owner.accent,
    title: god === null ? "ATHENA LENDS YOU HER AEGIS" : `${owner.name.toUpperCase()}'S POWER IS READY`,
    moveId,
    move: name,
    how: keyboard && key !== null ? `Press ${key}` : blurb,
    key,
    callId: `call_${moveId}`,
  };
}

/** The fight phases in which a full meter is of no use: the finishing move, and after the result. */
const SPENT_PHASES: ReadonlySet<string> = new Set(["finisher", "won", "lost"]);

/** Whether to show the banner. `phase` is CombatState.phase.kind; left out, only the meter decides. */
export function powerUsable(power: number, phase?: string): boolean {
  return Number.isFinite(power) && power >= 1 && !(phase !== undefined && SPENT_PHASES.has(phase));
}

/** How long a full, unspent meter waits before Athena says it once more. */
export const REMIND_MS = 10_000;
/** How soon to try again when the voice was held by a more urgent line. Longer than the longest phase line (2.9 s). */
export const RETRY_MS = 3_000;
/** Athena speaks at most this many times for one full meter. */
export const MAX_ANNOUNCEMENTS = 2;

export interface ReadyTrack {
  /** When the meter was first seen full, in ms; null while it is not full. */
  readonly fullSince: number | null;
  /** How many times this full meter has been announced. */
  readonly said: number;
  /** The next time an announcement is due, in ms. */
  readonly nextAt: number;
}

export const READY_START: ReadyTrack = { fullSince: null, said: 0, nextAt: 0 };

/**
 * Follows the meter. `announce` is true the moment the power reaches 1 and once more if it is still unspent REMIND_MS
 * later; never more than twice for one full meter. Anything below 1 resets it, so the next full meter is announced.
 */
export function trackReady(prev: ReadyTrack, power: number, nowMs: number): { track: ReadyTrack; announce: boolean } {
  if (!(power >= 1)) return { track: READY_START, announce: false };
  if (prev.fullSince === null) return { track: { fullSince: nowMs, said: 1, nextAt: nowMs + REMIND_MS }, announce: true };
  if (prev.said >= MAX_ANNOUNCEMENTS || nowMs < prev.nextAt) return { track: prev, announce: false };
  return { track: { ...prev, said: prev.said + 1, nextAt: nowMs + REMIND_MS }, announce: true };
}

/** The announcement just asked for was not heard (a phase line held the voice): give that turn back and try again soon. */
export function missed(track: ReadyTrack, nowMs: number): ReadyTrack {
  if (track.fullSince === null || track.said === 0) return track;
  return { ...track, said: track.said - 1, nextAt: nowMs + RETRY_MS };
}

/** Ms until the tracker should be asked again, or null when it has nothing more to say for this meter. */
export function nextCheckIn(track: ReadyTrack, nowMs: number): number | null {
  if (track.fullSince === null || track.said >= MAX_ANNOUNCEMENTS) return null;
  return Math.max(0, track.nextAt - nowMs);
}
