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

/**
 * When each tally counted its first frame and its latest. Kept beside the tally and not in it: the tally is what the
 * profile adds up, and how long a fight took is only for the hall of heroes (./heroes).
 */
const clocks = new WeakMap<object, { readonly first: number; last: number }>();

/** Counts one frame: its events, the combo after it, and whether a guest is in the fight. `now` is the clock, for tests. */
export function tallyFrame(tally: FightTally, events: readonly CombatEvent[], combo: number, guest: boolean, now: number = Date.now()): void {
  const clock = clocks.get(tally);
  if (clock === undefined) clocks.set(tally, { first: now, last: now });
  else clock.last = now;
  for (const event of events) {
    if (event.type === "powerUnleashed") tally.powers += 1;
    else if (event.type === "playerHit") tally.hitsTaken += 1;
    else if (event.type === "defended" && event.attack.counter === "block") tally.blocks += 1;
    else if (event.type === "defended" && event.attack.counter.startsWith("dodge")) tally.dodges += 1;
  }
  tally.bestCombo = Math.max(tally.bestCombo, combo);
  if (guest) tally.room = true;
}

/** Seconds from the first frame counted into this tally to the last, pauses included. Null for a tally no frame was counted into. */
export function fightSeconds(tally: Readonly<FightTally>): number | null {
  const clock = clocks.get(tally);
  return clock === undefined ? null : Math.max(0, clock.last - clock.first) / 1000;
}
