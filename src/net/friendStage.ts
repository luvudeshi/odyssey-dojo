// The friend in an online room, as the stage draws them: whether they are in the fight and what they last did.
// A plain object read inside useFrame (like battle.ts), written by the two room screens, never React state.
import type { CombatEvent, Strike } from "../core/types";

const NO_MOVES: ReadonlySet<string> = new Set();

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
  for (let i = struck.length - 1; i >= 0; i -= 1) {
    const strike = struck[i];
    if (strike?.player !== 1) continue;
    friendStage.struckMove = strike.move;
    friendStage.struckAt = now;
    return;
  }
}

/** Guest side: the host's engine marks the hits the host's own strike landed (`byHost`); a miss is not shown. */
export function feedFromHost(events: readonly CombatEvent[], now: number): void {
  friendStage.here = true;
  for (const event of events) {
    if (event.type !== "enemyHit" || event.byHost !== true) continue;
    friendStage.struckMove = event.move;
    friendStage.struckAt = now;
  }
}

export function clearFriend(): void {
  friendStage.here = false;
  friendStage.held = NO_MOVES;
  friendStage.struckMove = "";
  friendStage.struckAt = -Infinity;
}
