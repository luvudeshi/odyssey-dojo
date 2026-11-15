// What one fight adds to the profile beyond its score, counted from the engine's events while the fight runs.
import type { CombatEvent } from "../core/types";

export interface FightTally {
  powers: number;
  blocks: number;
  dodges: number;
  hitsTaken: number;
  bestCombo: number;
  /** True once a second player was in the fight: a room with a guest in it. */
  room: boolean;
}

export const newTally = (): FightTally => ({ powers: 0, blocks: 0, dodges: 0, hitsTaken: 0, bestCombo: 0, room: false });

/** Counts one frame: its events, the combo after it, and whether a guest is in the fight. */
export function tallyFrame(tally: FightTally, events: readonly CombatEvent[], combo: number, guest: boolean): void {
  for (const event of events) {
    if (event.type === "powerUnleashed") tally.powers += 1;
    else if (event.type === "playerHit") tally.hitsTaken += 1;
    else if (event.type === "defended" && event.attack.counter === "block") tally.blocks += 1;
    else if (event.type === "defended" && event.attack.counter.startsWith("dodge")) tally.dodges += 1;
  }
  tally.bestCombo = Math.max(tally.bestCombo, combo);
  if (guest) tally.room = true;
}
