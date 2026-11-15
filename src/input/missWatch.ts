// Decides when the player clearly tried the wrong thing during a prompt, so the HUD can flash MISS.
// It only watches: it never feeds the engine, so score and combat are untouched.
import { POWER_MOVES } from "../combat/engine";
import type { CombatEvent, CombatInput, CombatPhase } from "../core/types";

/** Call once per frame with the phase the input was read against and the events it produced. True means flash MISS now. */
export type MissWatch = (phase: CombatPhase, input: CombatInput, events: readonly CombatEvent[]) => boolean;

export function createMissWatch(): MissWatch {
  let prompt = "";
  let atStart = new Set<string>();
  let shown = false;
  let nearMiss = false;
  return (phase, input, events) => {
    const ask = phase.kind === "strike" || phase.kind === "finisher" ? phase.move : phase.kind === "defend" ? phase.attack.counter : null;
    const key = ask === null ? "" : `${phase.kind}:${ask}`;
    if (key !== prompt) {
      prompt = key;
      atStart = new Set(input.held);
      shown = false;
      nearMiss = false;
    }
    if (ask === null || shown) return false;
    // Keyboard wrong key and webcam wrong move both arrive as a strike with another id; a frame with a power move is the god gesture.
    const power = input.struck.some((s) => POWER_MOVES.has(s.move));
    const wrongStrike = phase.kind !== "defend" && !power && input.struck.some((s) => s.move !== ask) && !input.struck.some((s) => s.move === ask);
    const wrongDefend = phase.kind === "defend" && !input.held.has(ask) && [...input.held].some((id) => !atStart.has(id));
    if (phase.kind !== "defend" && input.tried?.has(ask)) nearMiss = true;
    const whiffed = nearMiss && events.some((e) => e.type === "whiffed");
    shown = wrongStrike || wrongDefend || whiffed;
    return shown;
  };
}
