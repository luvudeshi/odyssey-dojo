// What the scene shares between the camera, the hero and the monster: when each fight event last happened,
// where the hero stands, and the camera shake. It is filled from combat state and only read by the scene,
// so no fight rule depends on it. Times are in seconds on the performance.now() clock.
// One fight is on screen at a time, so this is a module-level store like effects/pulse.ts.
import type { CombatInput, CombatState } from "../core/types";

export interface Battle {
  state: CombatState | null;
  enemyHitAt: number;
  playerHitAt: number;
  phaseAt: number;
  wonAt: number;
  lostAt: number;
  /** Where the hero has stepped to, relative to the mark. Written by the hero, read by the camera. */
  heroX: number;
  heroZ: number;
  /** Camera shake added on top of the rig's own position. Written by HitEffects, read by the camera rig. */
  shakeX: number;
  shakeY: number;
  /** What the player is doing right now: held defends and the last strike. Fed from FightScreen's input. */
  held: ReadonlySet<string>;
  struckMove: string;
  struckAt: number;
}

export const battle: Battle = {
  state: null, enemyHitAt: -Infinity, playerHitAt: -Infinity, phaseAt: -Infinity, wonAt: -Infinity,
  lostAt: -Infinity, heroX: 0, heroZ: 0, shakeX: 0, shakeY: 0, held: new Set(), struckMove: "", struckAt: -Infinity,
};

export function resetBattle(target: Battle = battle): void {
  Object.assign(target, {
    state: null, enemyHitAt: -Infinity, playerHitAt: -Infinity, phaseAt: -Infinity, wonAt: -Infinity,
    lostAt: -Infinity, heroX: 0, heroZ: 0, shakeX: 0, shakeY: 0, held: new Set<string>(), struckMove: "", struckAt: -Infinity,
  });
}

export function nowSeconds(): number {
  return performance.now() / 1000;
}

/** 1 right at the event, fading to 0 over `seconds`. */
export function decay(now: number, at: number, seconds: number): number {
  return Math.min(1, Math.max(0, 1 - (now - at) / seconds));
}

let calm: MediaQueryList | null = null;

export function calmMotion(): boolean {
  calm ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return calm.matches;
}

/** Records what changed between the last state and this one. */
export function syncBattle(target: Battle, next: CombatState, now: number): void {
  const prev = target.state;
  target.state = next;
  if (!prev || prev === next) return;
  if (next.enemyHp < prev.enemyHp) target.enemyHitAt = now;
  if (next.playerHp < prev.playerHp) target.playerHitAt = now;
  if (next.phaseIndex !== prev.phaseIndex) target.phaseAt = now;
  if (next.phase.kind === "won" && prev.phase.kind !== "won") target.wonAt = now;
  if (next.phase.kind === "lost" && prev.phase.kind !== "lost") target.lostAt = now;
}

/** Called from FightScreen every tick with the merged keyboard and webcam input. */
export function noteInput(input: CombatInput, now: number, target: Battle = battle): void {
  target.held = input.held;
  const last = input.struck.at(-1);
  if (last) {
    target.struckMove = last.move;
    target.struckAt = now;
  }
}
