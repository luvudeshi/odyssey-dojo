// Reads the fight store into the plain numbers the hero's clip and gear rules take. Writes into `out`: no allocation per frame.
import { battle } from "../battle";
import type { HeroInput } from "./heroClips";

export type MutableInput = { -readonly [K in keyof HeroInput]: HeroInput[K] };

export function newInput(): MutableInput {
  return { held: new Set(), struckMove: "", sinceStrike: Infinity, sinceHurt: Infinity, won: false, lost: false, finisherMove: null };
}

export function readInput(out: MutableInput, now: number): HeroInput {
  const phase = battle.state?.phase;
  out.held = battle.held;
  out.struckMove = battle.struckMove;
  out.sinceStrike = now - battle.struckAt;
  out.sinceHurt = now - battle.playerHitAt;
  out.won = phase?.kind === "won";
  out.lost = phase?.kind === "lost";
  out.finisherMove = phase?.kind === "finisher" ? phase.move : null;
  return out;
}
