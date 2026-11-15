// The pause menu as plain functions: which view Esc leads to, and how the fight's clock stays still while paused.
import type { Battle } from "../render/battle";

export type PauseView = "off" | "menu" | "settings";

/** What Esc does: opens the menu in a fight, goes back from settings, resumes from the menu. Does nothing once the fight is over. */
export function pressEscape(view: PauseView, fightOver: boolean): PauseView {
  if (fightOver) return "off";
  if (view === "off") return "menu";
  return view === "settings" ? "menu" : "off";
}

/** The scene's effects are timed on the wall clock; after a pause of `ms` they are pushed on by as much so none ran out meanwhile. */
export function shiftBattleTimes(battle: Battle, ms: number): void {
  const s = ms / 1000;
  battle.enemyHitAt += s;
  battle.playerHitAt += s;
  battle.phaseAt += s;
  battle.wonAt += s;
  battle.lostAt += s;
  battle.struckAt += s;
  battle.reachAt += s;
  battle.powerAt += s;
}
