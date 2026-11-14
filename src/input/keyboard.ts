// Keyboard fallback: every move has a key, so the game is playable (and demo-safe) with no camera.
import type { CombatInput, MoveDef, Strike } from "../core/types";

/** A key press can't be thrown well or badly, so it counts as a decent strike. */
const KEY_QUALITY = 0.7;

export interface Keyboard {
  /** Held defenses plus strikes pressed since the last read. */
  read(): CombatInput;
  dispose(): void;
}

export function createKeyboard(moves: ReadonlyMap<string, MoveDef>): Keyboard {
  const byKey = new Map([...moves.values()].map((move) => [move.key, move]));
  const held = new Set<string>();
  let struck: Strike[] = [];

  const down = (event: KeyboardEvent): void => {
    const move = byKey.get(event.key);
    if (!move) return;
    event.preventDefault();
    if (move.kind === "defend") held.add(move.id);
    else if (!event.repeat) struck.push({ move: move.id, quality: KEY_QUALITY, player: 0 });
  };
  const up = (event: KeyboardEvent): void => {
    const move = byKey.get(event.key);
    if (move) held.delete(move.id);
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);

  return {
    read() {
      const result = { held: new Set(held), struck };
      struck = [];
      return result;
    },
    dispose() {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    },
  };
}
