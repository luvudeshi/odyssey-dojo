// The pause menu as plain functions: which view Esc leads to, and how the fight's clock stays still while paused.
import { nowSeconds } from "../render/battle";
import type { Battle } from "../render/battle";
import { BURST_S } from "../render/effects/defendTiming";

export type PauseView = "off" | "menu" | "settings";

/** What Esc does: opens the menu in a fight, goes back from settings, resumes from the menu. Does nothing once the fight is over. */
export function pressEscape(view: PauseView, fightOver: boolean): PauseView {
  if (fightOver) return "off";
  if (view === "off") return "menu";
  return view === "settings" ? "menu" : "off";
}

/**
 * The scene's effects are timed on the wall clock; after a pause of `ms` they are pushed on by as much so none ran out
 * meanwhile. `now` is the moment of resuming, in seconds on the same clock.
 */
export function shiftBattleTimes(battle: Battle, ms: number, now: number = nowSeconds()): void {
  const s = ms / 1000;
  battle.enemyHitAt += s;
  battle.playerHitAt += s;
  battle.phaseAt += s;
  battle.wonAt += s;
  battle.lostAt += s;
  battle.struckAt += s;
  battle.reachAt += s;
  // The burst and the shield take a changed defendedAt for a new defend and throw their dust again, so it moves
  // only when the pause began inside the burst. A burst that was already over stays over either way.
  const pausedAt = now - s;
  if (pausedAt - battle.defendedAt < BURST_S) battle.defendedAt += s;
}
