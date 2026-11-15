// One short tip for a strike prompt that ran out with no strike counted: what the body did instead. The body
// tips are strikeFeedback's own checks; this adds "nothing moved" and "the other hand / another strike".
// docs/move-feedback.md ("A strike that never came") has the table.
// Nothing here is spoken or played: the words are for a pop-up on the screen.
import type { PoseFrame, PoseHistory } from "../../core/types";
import { legsVisible } from "../../moves/legSignals";
import { MOVES } from "../../moves/registry";
import { STILL, moved, usable } from "./defendMissFeedback";
import { FEEDBACK_RULES, TIP_MAX, strikeFeedback, tipsFor } from "./strikeFeedback";

/** Said when the body did not move while the prompt was up. */
export const STILL_TIP = "Strike when it flashes";
/** A strike counts in the fight from this reading (ON in src/input/poseInput.ts). */
const STRIKE_ON = 0.7;
/** The fight's pose history holds a second; the detectors are read over the same. */
const HISTORY_MS = 1000;
/** The same strike thrown with the other hand. */
const OTHER_HAND: Readonly<Record<string, string>> = {
  jab: "cross", cross: "jab", hammer_fist: "overhead_strike", overhead_strike: "hammer_fist", uppercut: "rising_palm", rising_palm: "uppercut",
};
const LEG_MOVES: ReadonlySet<string> = new Set(["front_kick", "knee"]);

const fits = (tip: string | null | undefined): string | null => (tip && tip.length <= TIP_MAX ? tip : null);
const word = (moveId: string): string => (MOVES.get(moveId)?.prompt ?? moveId).toLowerCase();
const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** The strike, other than `moveId`, the detectors read highest over the frames, if one reached the fight's level. */
function otherStrike(moveId: string, history: PoseHistory): string | null {
  const strikes = [...MOVES.values()].filter((move) => move.kind === "strike" && move.id !== moveId);
  let best: { id: string; level: number } | null = null;
  history.frames.forEach((frame, index) => {
    if (!usable(frame)) return;
    const frames = history.frames.slice(0, index + 1).filter((old) => frame.t - old.t <= HISTORY_MS);
    for (const move of strikes) {
      const level = move.detect({ frames, baseline: history.baseline });
      if (Number.isFinite(level) && level >= STRIKE_ON && (!best || level > best.level)) best = { id: move.id, level };
    }
  });
  return (best as { id: string } | null)?.id ?? null;
}

/**
 * A tip for the strike `moveId` when its prompt ran out with nothing counted. `history` is the fight's pose
 * history as the prompt ends (the last second). First that applies: the body never moved, "Strike when it
 * flashes"; the same strike came with the other hand, "Other hand: left jab"; another strike came, "Jab, not
 * hook"; else strikeFeedback's tip for that strike, or its first tip ("Extend your arm fully"). Null with no
 * body to read (keyboard, shoulders not seen, a move with no checks, a kick with the legs out of view).
 * At most 24 characters. Never throws.
 */
export function strikeMissTip(moveId: string, history: PoseHistory | null | undefined): string | null {
  try {
    if (!history || !(moveId in FEEDBACK_RULES)) return null;
    const frames: readonly PoseFrame[] = history.frames.filter(usable);
    if (frames.length === 0) return null;
    if (LEG_MOVES.has(moveId) && frames.filter(legsVisible).length * 2 <= frames.length) return null;
    if (moved(frames) < STILL) return STILL_TIP;
    const other = otherStrike(moveId, history);
    if (other !== null && OTHER_HAND[moveId] === other) {
      const side = FEEDBACK_RULES[moveId]?.sides[0] ?? "left";
      return fits(`Other hand: ${side} ${word(moveId)}`) ?? `Use your ${side} hand`;
    }
    const instead = other === null ? null : fits(`${capital(word(moveId))}, not ${word(other)}`);
    if (instead !== null) return instead;
    return fits(strikeFeedback(moveId, history).tip) ?? fits(tipsFor(moveId)[0]);
  } catch {
    return null;
  }
}
