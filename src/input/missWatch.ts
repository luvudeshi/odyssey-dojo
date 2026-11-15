// Decides when the player clearly tried the wrong thing during a prompt, so the HUD can flash MISS.
// It only watches: it never feeds the engine, so score and combat are untouched. A wrong or weak try never ends
// the prompt; the player keeps trying and each failed try flashes MISS, at most once every MISS_GAP_MS.
import { POWER_MOVES } from "../combat/engine";
import type { CombatEvent, CombatInput, CombatPhase } from "../core/types";

/** The least time between two MISS flashes, so a run of tries cannot flicker. */
export const MISS_GAP_MS = 800;

/** Call once per frame with the move asked for (null when nothing is), whether it is a defend, the input and whether the window just ran out. True means flash MISS now. */
export type MissWatch = (ask: string | null, defend: boolean, input: CombatInput, whiffed: boolean, nowMs: number) => boolean;

export function createMissWatch(): MissWatch {
  let prompt = "";
  let before = new Set<string>();
  let triedBefore = false;
  let nearMiss = false;
  let lastAt = -Infinity;
  return (ask, defend, input, whiffed, nowMs) => {
    const heldBefore = before;
    before = new Set(input.held);
    const key = ask === null ? "" : `${String(defend)}:${ask}`;
    if (key !== prompt) {
      prompt = key;
      triedBefore = false;
      nearMiss = false;
    }
    if (ask === null) return false;
    // Keyboard wrong key and webcam wrong move both arrive as a strike with another id; a frame with a power move is the god gesture.
    const power = input.struck.some((s) => POWER_MOVES.has(s.move));
    const right = input.struck.some((s) => s.move === ask);
    const wrongStrike = !defend && !power && !right && input.struck.length > 0;
    // A defend counts as a try when it newly appears; one held down, or held before the prompt, does not flash again.
    const wrongDefend = defend && !input.held.has(ask) && [...input.held].some((id) => !heldBefore.has(id));
    const triedNow = !defend && input.tried?.has(ask) === true;
    // A near miss that fades without becoming the strike is a failed try.
    const fizzled = triedBefore && !triedNow && !right;
    const whiff = (nearMiss || triedNow) && whiffed;
    triedBefore = triedNow;
    nearMiss = triedNow || (nearMiss && !fizzled);
    if (!(wrongStrike || wrongDefend || fizzled || whiff) || nowMs - lastAt < MISS_GAP_MS) return false;
    lastAt = nowMs;
    return true;
  };
}

/** The fight's phase as the watch wants it. */
export function watchPhase(watch: MissWatch, phase: CombatPhase, input: CombatInput, events: readonly CombatEvent[], nowMs: number): boolean {
  const defend = phase.kind === "defend";
  const ask = phase.kind === "strike" || phase.kind === "finisher" ? phase.move : defend ? phase.attack.counter : null;
  return watch(ask, defend, input, events.some((e) => e.type === "whiffed"), nowMs);
}
