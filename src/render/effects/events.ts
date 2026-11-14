// Works out what just happened in the fight by comparing two combat states.
// The scene is only handed the state, so this is how the effects learn about a hit without touching fight rules.
import type { CombatState } from "../../core/types";

export type Vec3 = readonly [number, number, number];

export type Fx =
  | { readonly type: "playerHit" }
  /** `at` is in the monster model's own space, like `WeakSpot.position`. */
  | { readonly type: "enemyHit"; readonly at: Vec3 }
  | { readonly type: "finished"; readonly at: Vec3 };

/** Where a hit lands when the state no longer says which weak spot was open. */
export const MONSTER_CHEST: Vec3 = [0, 2.6, 0.9];

export function fxBetween(prev: CombatState | null, next: CombatState): Fx[] {
  if (!prev || prev === next) return [];
  const out: Fx[] = [];
  const at = prev.phase.kind === "strike" ? prev.phase.weakSpot.position : MONSTER_CHEST;
  if (next.playerHp < prev.playerHp) out.push({ type: "playerHit" });
  if (next.enemyHp < prev.enemyHp) out.push({ type: "enemyHit", at });
  if (next.phase.kind === "won" && prev.phase.kind !== "won") out.push({ type: "finished", at });
  return out;
}
