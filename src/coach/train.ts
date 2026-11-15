// Leans a monster's attacks toward the defenses the player needs to practice. Only `weight` changes.
import type { EnemyAttack, EnemySpec } from "../core/types";
import type { DefenseId, Habit } from "./habits";

/** The most a habit can multiply an attack's weight by, at severity 1. */
export const MAX_LEAN = 2.5;
/** A stand-in attack gets this share of the extra weight. */
const STAND_IN_SHARE = 0.5;
/**
 * Some phases have no attack for the trained defense (Polyphemus stops grabbing once blinded).
 * So the habit still counts there, the nearest defense stands in: the other head defense, or the other side step.
 */
const STAND_IN: Record<DefenseId, DefenseId> = {
  block: "duck",
  duck: "block",
  dodge_left: "dodge_right",
  dodge_right: "dodge_left",
};

/**
 * The same enemy with attack weights leaned toward what the habits train. Attack ids, order, damage,
 * warning times, phases, weak spots and health are untouched, and the input is not changed.
 * Strike habits change nothing here: the engine picks strikes without weights.
 */
export function trainOn(enemy: EnemySpec, habits: readonly Pick<Habit, "trains" | "severity">[]): EnemySpec {
  const pools = enemy.phases
    ? enemy.phases.map((phase) => enemy.attacks.filter((attack) => phase.attackIds.includes(attack.id)))
    : [enemy.attacks];
  const lean = new Map<string, number>();
  const raise = (counter: string, by: number): void => {
    lean.set(counter, Math.max(lean.get(counter) ?? 1, by));
  };
  for (const habit of habits) {
    const extra = (MAX_LEAN - 1) * (Number.isFinite(habit.severity) ? Math.min(1, Math.max(0, habit.severity)) : 0);
    if (habit.trains === "strike" || extra === 0) continue;
    const defense = habit.trains;
    raise(defense, 1 + extra);
    if (pools.some((pool) => !pool.some((attack) => attack.counter === defense))) {
      raise(STAND_IN[defense], 1 + extra * STAND_IN_SHARE);
    }
  }
  const weighted = (attack: EnemyAttack): EnemyAttack => {
    const by = lean.get(attack.counter) ?? 1;
    return by === 1 ? attack : { ...attack, weight: (attack.weight ?? 1) * by };
  };
  const [first, ...rest] = enemy.attacks;
  return { ...enemy, attacks: [weighted(first), ...rest.map(weighted)] };
}
