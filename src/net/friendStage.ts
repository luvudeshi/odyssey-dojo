// The friend in an online room, as the stage draws them: whether they are in the fight and what they last did.
// A plain object read inside useFrame (like battle.ts), written by the two room screens, never React state.
import type { CombatEvent, Strike } from "../core/types";

const NO_MOVES: ReadonlySet<string> = new Set();
/** A hit of the guest's own within this long of an enemyHit is the guest's, not the host's (seconds). */
const OWN_WINDOW = 1;

export const friendStage: { here: boolean; held: ReadonlySet<string>; struckMove: string; struckAt: number } = {
  here: false,
  held: NO_MOVES,
  struckMove: "",
  struckAt: -Infinity,
};

/** When the friend's figure was last moved in the scene, on the performance.now() clock. Read only by test scripts. */
export const friendDrawn = { at: -Infinity };

/** Host side: the guest's strikes (player 1) out of the input the engine is about to get. */
export function feedFromGuest(struck: readonly Strike[], now: number): void {
  friendStage.here = true;
  const last = struck.filter((strike) => strike.player === 1).at(-1);
  if (last) { friendStage.struckMove = last.move; friendStage.struckAt = now; }
}

/** Guest side: a hit that is not the guest's own was the host's. `ownAt` is when the guest last struck `ownMove`. */
export function feedFromHost(events: readonly CombatEvent[], ownMove: string, ownAt: number, now: number): void {
  friendStage.here = true;
  for (const event of events) {
    if (event.type !== "enemyHit") continue;
    const mine = event.move === ownMove && now - ownAt < OWN_WINDOW;
    if (event.together === true || !mine) { friendStage.struckMove = event.move; friendStage.struckAt = now; }
  }
}

export function clearFriend(): void {
  friendStage.here = false;
  friendStage.held = NO_MOVES;
  friendStage.struckMove = "";
  friendStage.struckAt = -Infinity;
}
