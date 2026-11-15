// Turns move detector confidences into combat input.
import { clamp01, latest } from "../pose/signals";
import type { CombatInput, MoveDef, PoseHistory, Strike } from "../core/types";

/** A strike is thrown when its confidence crosses ON, and can be thrown again once it has fallen under OFF. */
const ON = 0.7;
const OFF = 0.4;
/** A strike this sure but short of ON was a real try that did not count: it feeds the MISS flash, nothing else. */
const TRIED = 0.45;
/**
 * A defend comes on at DEFEND_ON and stays on down to DEFEND_OFF. Lower than a strike's: a defend only counts when
 * it is the move the attack asks for, so reading one a little eagerly costs nothing, and missing one costs a hit.
 */
export const DEFEND_ON = 0.5;
export const DEFEND_OFF = 0.3;
/**
 * A defend let go this recently still counts as held. The attack lands on one frame, so a dodge made a moment
 * early, or one flickering on a noisy camera, still saves the player.
 */
export const RELEASE_MS = 350;

/**
 * A strike prompt opens the instant a defend is met, while the arms are still coming back from the block or dodge.
 * The loose reading of the asked move only looks at frames from this long after the prompt appeared.
 */
export const ASK_GRACE_MS = 250;
/** The loose reading needs at least this many frames to compare. */
const ASKED_MIN_FRAMES = 3;

/** Returns a reader. `ask` is the strike the prompt asks for (null for none): that move may read looser (`detectAsked`). Defenses count while held, and for RELEASE_MS after; a strike counts once each time it crosses ON. */
export function createPoseInput(
  moves: ReadonlyMap<string, MoveDef>,
): (history: PoseHistory, ask?: string | null) => CombatInput {
  let asked: string | null = null;
  let askedAt = 0;
  const active = new Set<string>();
  const lastHeld = new Map<string, number>();
  return (history, ask = null) => {
    const held = new Set<string>();
    const struck: Strike[] = [];
    const tried = new Set<string>();
    const now = latest(history)?.t ?? 0;
    if (ask !== asked) {
      asked = ask;
      askedAt = now;
    }
    for (const move of moves.values()) {
      let confidence = move.detect(history);
      if (move.id === ask && move.detectAsked) {
        const frames = history.frames.filter((frame) => frame.t - askedAt >= ASK_GRACE_MS);
        if (frames.length >= ASKED_MIN_FRAMES) confidence = Math.max(confidence, move.detectAsked({ ...history, frames }));
      }
      if (move.kind === "defend") {
        const on = confidence >= DEFEND_ON || (active.has(move.id) && confidence >= DEFEND_OFF);
        if (on) {
          active.add(move.id);
          lastHeld.set(move.id, now);
        } else {
          active.delete(move.id);
        }
        const last = lastHeld.get(move.id);
        if (on || (last !== undefined && now - last >= 0 && now - last <= RELEASE_MS)) held.add(move.id);
      } else if (confidence >= ON && !active.has(move.id)) {
        active.add(move.id);
        struck.push({ move: move.id, quality: clamp01(move.quality?.(history) ?? 0.7), player: 0 });
      } else if (confidence < OFF) {
        active.delete(move.id);
      } else if (confidence >= TRIED && confidence < ON && !active.has(move.id)) {
        tried.add(move.id);
      }
    }
    return { held, struck, tried };
  };
}

export function mergeInputs(a: CombatInput, b: CombatInput): CombatInput {
  return { held: new Set([...a.held, ...b.held]), struck: [...a.struck, ...b.struck], tried: new Set([...(a.tried ?? []), ...(b.tried ?? [])]) };
}
