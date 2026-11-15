// Works out what just happened in the fight by comparing two combat states.
// The scene is only handed the state, so this is how the effects learn about a hit without touching fight rules.
import type { CombatState } from "../../core/types";

export type Vec3 = readonly [number, number, number];

export type Fx =
  | { readonly type: "playerHit" }
  /** `at` is in the monster model's own space, like `WeakSpot.position`. `delay` is seconds until the blow arrives. */
  | { readonly type: "enemyHit"; readonly at: Vec3; readonly delay: number }
  | { readonly type: "finished"; readonly at: Vec3; readonly delay: number };

/** Where a hit lands when the state no longer says which weak spot was open. */
export const MONSTER_CHEST: Vec3 = [0, 2.6, 0.9];

/**
 * `finishAt` is where a finishing blow lands. A strike or finisher waits `reachDelay` for the hero to arrive
 * (strikeReach.ts); a power's damage has no reach and shows at once.
 */
export function fxBetween(prev: CombatState | null, next: CombatState, finishAt: Vec3 = MONSTER_CHEST, reachDelay = 0): Fx[] {
  if (!prev || prev === next) return [];
  const out: Fx[] = [];
  const phase = prev.phase;
  const at = phase.kind === "strike" ? phase.weakSpot.position : phase.kind === "finisher" ? finishAt : MONSTER_CHEST;
  const delay = phase.kind === "strike" || phase.kind === "finisher" ? reachDelay : 0;
  if (next.playerHp < prev.playerHp) out.push({ type: "playerHit" });
  if (next.enemyHp < prev.enemyHp) out.push({ type: "enemyHit", at, delay });
  if (next.phase.kind === "won" && prev.phase.kind !== "won") out.push({ type: "finished", at, delay });
  return out;
}
