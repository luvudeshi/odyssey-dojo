// "What you practised" for the result panel, from the moves the fight taught (mastery counts).
// Follow-up: src/lessons/lessons.ts `lessonsFrom(events)` gives a fuller list (defences held, longest clean run),
// but FightScreen's renderEnd passes no combat events, so this panel can only use the mastery counts.
import { MOVES } from "../moves/registry";

export interface Practised {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  /** What the move is for in real self-defense; empty if the move has no teaches line. */
  readonly teaches: string;
}

/** Moves with a count above zero, most used first (ties keep the order given). */
export function practisedFrom(mastery: Readonly<Record<string, number>>): Practised[] {
  return Object.entries(mastery)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, name: MOVES.get(id)?.name ?? id, count, teaches: MOVES.get(id)?.teaches ?? "" }))
    .sort((a, b) => b.count - a.count);
}

/** The first `max` moves with a distinct, non-empty teaches line, from the moves used most. */
export function practisedLines(list: readonly Practised[], max = 3): Practised[] {
  const seen = new Set<string>();
  const out: Practised[] = [];
  for (const move of list) {
    if (move.teaches === "" || seen.has(move.teaches)) continue;
    seen.add(move.teaches);
    out.push(move);
    if (out.length === max) break;
  }
  return out;
}
