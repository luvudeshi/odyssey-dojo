// What practice says about each extra move: one tip per move, in the shape of PRACTICE_TIPS in ../practice.ts
// (a part name of at most 20 characters and one line of at most 90). `judgeRep` has no table for these moves, so
// on its own it gives them the one tip for their kind; `judgeExtraRep` puts the move's own tip in its place.
import type { Baseline, MoveDef, PoseFrame } from "../../core/types";
import { legsVisible } from "../../moves/legSignals";
import { PRACTICE_TIPS, judgeRep } from "../practice";
import type { PracticeTip, RepResult } from "../practice";

const tip = (part: string, line: string): PracticeTip => ({ part, tip: line });

/** The one tip for each extra move, by move id. */
export const EXTRA_TIPS: Readonly<Record<string, PracticeTip>> = {
  roundhouse_kick: tip("knee out first", "Lift your knee out to the side first, then swing your foot round and snap it back."),
  side_kick: tip("push sideways", "Lift your knee, then push your foot straight out to the side until the leg is straight."),
  low_kick: tip("low and straight", "Keep it low and quick: a straight leg to shin height, then your foot straight back."),
  elbow_strike: tip("tight fold", "Fold your arm tight, lift the elbow to shoulder height and swing it across your chest."),
  palm_heel: tip("face height", "Push the heel of your open hand straight out to face height, then bring it back."),
  high_block: tip("forearm level", "Lift one forearm level above your forehead, elbow out to the side, and hold it a beat."),
  low_block: tip("sweep", "Start with the hand at your other shoulder, then sweep it down and out past your hip."),
  wrist_release: tip("fold the elbow", "Hold your arm out, then fold the elbow forward so your hand comes to your shoulder."),
};

/** The extra moves the camera can only read with the legs in view, like KICK_IDS in src/moves/legSignals.ts. */
export const EXTRA_NEEDS_LEGS: readonly string[] = ["roundhouse_kick", "side_kick", "low_kick"];

/**
 * `judgeRep` for an extra move. The same result, except: a kick that did not count with the legs never in view
 * gets the "feet in view" tip, and the tip for the move's kind ("whole move") is swapped for the move's own.
 * A move with no entry in EXTRA_TIPS comes back exactly as `judgeRep` judged it.
 */
export function judgeExtraRep(move: MoveDef, frames: readonly PoseFrame[], baseline: Baseline | null = null): RepResult {
  const result = judgeRep(move, frames, baseline);
  const own = EXTRA_TIPS[move.id];
  if (!own) return result;
  if (!result.counted && EXTRA_NEEDS_LEGS.includes(move.id) && !frames.some(legsVisible)) {
    return { ...result, tip: PRACTICE_TIPS.feet.tip, part: PRACTICE_TIPS.feet.part };
  }
  return result.part === PRACTICE_TIPS[move.kind].part ? { ...result, tip: own.tip, part: own.part } : result;
}
