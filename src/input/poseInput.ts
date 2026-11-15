// Turns move detector confidences into combat input.
import { clamp01, latest } from "../pose/signals";
import type { CombatInput, MoveDef, PoseHistory, Strike } from "../core/types";

/** A strike is thrown when its confidence crosses ON, and can be thrown again once it has fallen under OFF. */
const ON = 0.7;
const OFF = 0.4;
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

/** Returns a reader. Defenses count while held, and for RELEASE_MS after; a strike counts once each time it crosses ON. */
export function createPoseInput(
  moves: ReadonlyMap<string, MoveDef>,
): (history: PoseHistory) => CombatInput {
  const active = new Set<string>();
  const lastHeld = new Map<string, number>();
  return (history) => {
    const held = new Set<string>();
    const struck: Strike[] = [];
    const now = latest(history)?.t ?? 0;
    for (const move of moves.values()) {
      const confidence = move.detect(history);
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
      }
    }
    return { held, struck };
  };
}

export function mergeInputs(a: CombatInput, b: CombatInput): CombatInput {
  return { held: new Set([...a.held, ...b.held]), struck: [...a.struck, ...b.struck] };
}
