// Turns move detector confidences into combat input.
import { clamp01 } from "../pose/signals";
import type { CombatInput, MoveDef, PoseHistory, Strike } from "../core/types";

const ON = 0.7;
const OFF = 0.4;

/** Returns a reader. Defenses count while held; a strike counts once each time it crosses ON. */
export function createPoseInput(
  moves: ReadonlyMap<string, MoveDef>,
): (history: PoseHistory) => CombatInput {
  const active = new Set<string>();
  return (history) => {
    const held = new Set<string>();
    const struck: Strike[] = [];
    for (const move of moves.values()) {
      const confidence = move.detect(history);
      if (move.kind === "defend") {
        if (confidence >= ON) held.add(move.id);
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
