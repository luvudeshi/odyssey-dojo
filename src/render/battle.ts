// What the scene shares between the camera, the hero and the monster: when each fight event last happened,
// where the hero stands, and the camera shake. It is filled from combat state and only read by the scene,
// so no fight rule depends on it. Times are in seconds on the performance.now() clock.
// One fight is on screen at a time, so this is a module-level store like effects/pulse.ts.
import type { CombatInput, CombatState } from "../core/types";
import { MONSTER_CHEST } from "./effects/events";
import type { Vec3 } from "./effects/events";
import { defendCounted, defendSeen } from "../hud/DefendFlash";
import { REACH } from "./strikeReach";

export interface Battle {
  state: CombatState | null;
  /** When the monster is seen to be struck. For a counted strike that is the hero's arrival, REACH.out after it counted. */
  enemyHitAt: number;
  playerHitAt: number;
  phaseAt: number;
  wonAt: number;
  lostAt: number;
  /** Where the hero has stepped to, relative to the mark. Written by the hero, read by the camera. */
  heroX: number;
  heroZ: number;
  /** When the last counted strike (or finishing blow) set the hero off toward `hitSpot`, in the monster rig's space. */
  reachAt: number;
  hitSpot: Vec3 | null;
  /** How far the reach has carried the hero off his mark right now. Written by the hero, read by the camera and the bronze figure. */
  reachX: number;
  reachY: number;
  reachZ: number;
  /** Camera shake added on top of the rig's own position. Written by HitEffects, read by the camera rig. */
  shakeX: number;
  shakeY: number;
  /** What the player is doing right now: held defends and the last strike. Fed from FightScreen's input. */
  held: ReadonlySet<string>;
  struckMove: string;
  struckAt: number;
  /** Counts strikes. Unlike struckAt it is not a time, so pausing (shiftBattleTimes) cannot change it. */
  strikes: number;
  /** When the last defend counted and which one ("block", "duck", "dodge_left"...), for the shield and the burst. */
  defendedAt: number;
  defendedMove: string;
  /** The fighting style in play, set by FightScreen. resetBattle leaves it: the style outlives one fight. */
  styleId: string;
}

export const battle: Battle = {
  state: null, enemyHitAt: -Infinity, playerHitAt: -Infinity, phaseAt: -Infinity, wonAt: -Infinity,
  lostAt: -Infinity, heroX: 0, heroZ: 0, reachAt: -Infinity, hitSpot: null, reachX: 0, reachY: 0, reachZ: 0,
  shakeX: 0, shakeY: 0, held: new Set(), struckMove: "", struckAt: -Infinity, strikes: 0, styleId: "",
  defendedAt: -Infinity, defendedMove: "",
};

export function resetBattle(target: Battle = battle): void {
  Object.assign(target, {
    state: null, enemyHitAt: -Infinity, playerHitAt: -Infinity, phaseAt: -Infinity, wonAt: -Infinity,
    lostAt: -Infinity, heroX: 0, heroZ: 0, reachAt: -Infinity, hitSpot: null, reachX: 0, reachY: 0, reachZ: 0,
    shakeX: 0, shakeY: 0, held: new Set<string>(), struckMove: "", struckAt: -Infinity, strikes: 0,
    defendedAt: -Infinity, defendedMove: "",
  });
}

export function nowSeconds(): number {
  return performance.now() / 1000;
}

/** 1 right at the event, fading to 0 over `seconds`; 0 before it (a strike's hit is stamped at the hero's arrival). */
export function decay(now: number, at: number, seconds: number): number {
  return now < at ? 0 : Math.min(1, Math.max(0, 1 - (now - at) / seconds));
}

let calm: MediaQueryList | null = null;

export function calmMotion(): boolean {
  calm ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return calm.matches;
}

/** Records what changed between the last state and this one. `finishAt` is where the finishing blow lands (rig space). */
export function syncBattle(target: Battle, next: CombatState, now: number, finishAt: Vec3 = MONSTER_CHEST): void {
  const prev = target.state;
  target.state = next;
  if (!prev || prev === next) return;
  const struck = next.enemyHp < prev.enemyHp && prev.phase.kind === "strike";
  const finished = prev.phase.kind === "finisher" && next.phase.kind === "won";
  if (struck || finished) {
    target.reachAt = now;
    target.hitSpot = prev.phase.kind === "strike" ? prev.phase.weakSpot.position : finishAt;
  }
  // A power's damage has no reach, so it shows at once.
  if (next.enemyHp < prev.enemyHp) target.enemyHitAt = struck ? now + REACH.out : now;
  if (next.playerHp < prev.playerHp) target.playerHitAt = now;
  const counted = defendCounted(defendSeen(prev.phase), defendSeen(next.phase));
  if (counted !== null) { target.defendedAt = now; target.defendedMove = counted; }
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
    target.strikes += 1;
  }
}
