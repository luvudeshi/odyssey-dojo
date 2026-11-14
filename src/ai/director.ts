// Adaptive difficulty: watches the fight's events and hands the engine a gently re-tuned copy of the enemy.
// The engine reads warnings and weights only when an attack begins, so one already winding up never changes.
import type { CombatEvent, EnemyAttack, EnemySpec } from "../core/types";

export type DirectorResult = "defended" | "hit" | "landed" | "whiffed";

export interface DefenceTally {
  readonly defended: number;
  readonly hit: number;
  /** Share stopped, 0..1, leaning on the latest attempts. */
  readonly form: number;
}

export interface DirectorStats {
  /** By defend move id: attacks needing it that were stopped, and that got through. */
  readonly defences: Readonly<Record<string, DefenceTally>>;
  /** Strikes that landed, and openings that were missed. */
  readonly landed: number;
  readonly whiffed: number;
  /** The last few results, oldest first. */
  readonly recent: readonly DirectorResult[];
}

export const EMPTY_STATS: DirectorStats = { defences: {}, landed: 0, whiffed: 0, recent: [] };

const WINDOW = 12;
/** Each older result counts this much of the one after it. */
const DECAY = 0.85;
/** A strike result counts this much of a defence result. */
const STRIKE_SHARE = 0.5;
/** Share of prompts a player must get right for the fight to be even. */
const EVEN_RATE = 0.7;
/** Resolved attacks before anything changes, and before the tuning is at full strength. */
const MIN_RESOLVED = 4;
const FULL_TRUST = 7;
/** Resolved attacks needing one defence before it can be called the best or the weakest. */
const MIN_SAMPLES = 2;
/** Each new attempt at a defence moves its form this far towards the result. */
const FORM_STEP = 0.3;
/** Gap between the best and the weakest defence that earns the whole weight boost. */
const FULL_GAP = 0.5;
/** Shortest warning a body can answer; the content tests hold every enemy to the same second. */
const FLOOR_MS = 1000;
const FASTER = 0.2;
const SLOWER = 0.3;
const WIDER = 0.25;

function remembered(recent: readonly DirectorResult[], result: DirectorResult): readonly DirectorResult[] {
  return [...recent.slice(1 - WINDOW), result];
}

function resolved(stats: DirectorStats, counter: string, stopped: boolean): DirectorStats {
  // Own keys only: a counter called "constructor" must not read Object.prototype.
  const before = Object.hasOwn(stats.defences, counter) ? stats.defences[counter] : undefined;
  const result = stopped ? 1 : 0;
  const next: DefenceTally = before
    ? {
        defended: before.defended + result,
        hit: before.hit + 1 - result,
        form: before.form + FORM_STEP * (result - before.form),
      }
    : { defended: result, hit: 1 - result, form: result };
  return {
    ...stats,
    defences: { ...stats.defences, [counter]: next },
    recent: remembered(stats.recent, stopped ? "defended" : "hit"),
  };
}

/** Folds one frame's events into the stats. Returns the same object when nothing in them counts. */
export function observe(stats: DirectorStats, events: readonly CombatEvent[]): DirectorStats {
  let next = stats;
  for (const event of events) {
    switch (event.type) {
      case "defended":
        next = resolved(next, event.attack.counter, true);
        break;
      case "playerHit":
        next = resolved(next, event.attack.counter, false);
        break;
      case "enemyHit":
        next = { ...next, landed: next.landed + 1, recent: remembered(next.recent, "landed") };
        break;
      case "whiffed":
        next = { ...next, whiffed: next.whiffed + 1, recent: remembered(next.recent, "whiffed") };
        break;
      default:
        break;
    }
  }
  return next;
}

/** -1 (struggling) .. 0 (unknown or even) .. 1 (cruising), leaning on the latest results. */
export function skill(stats: DirectorStats): number {
  let good = 0;
  let total = 0;
  let weight = 1;
  for (let i = stats.recent.length - 1; i >= 0; i--) {
    const result = stats.recent[i];
    const share = result === "defended" || result === "hit" ? weight : weight * STRIKE_SHARE;
    total += share;
    if (result === "defended" || result === "landed") good += share;
    weight *= DECAY;
  }
  if (total === 0) return 0;
  const rate = good / total;
  return rate >= EVEN_RATE ? (rate - EVEN_RATE) / (1 - EVEN_RATE) : (rate - EVEN_RATE) / EVEN_RATE;
}

/** 0 until enough attacks have resolved to judge the player, then rising to 1. */
function trust(stats: DirectorStats): number {
  let count = 0;
  for (const tally of Object.values(stats.defences)) count += tally.defended + tally.hit;
  return Math.min(1, Math.max(0, (count - MIN_RESOLVED + 1) / (FULL_TRUST - MIN_RESOLVED + 1)));
}

/** How well the player is stopping attacks that need this defence lately; null until there are enough to say. */
function successRate(stats: DirectorStats, counter: string): number | null {
  const tally = Object.hasOwn(stats.defences, counter) ? stats.defences[counter] : undefined;
  if (!tally || tally.defended + tally.hit < MIN_SAMPLES) return null;
  return tally.form;
}

/** The weakest and the best success rate among the defences this enemy asks for. Null: none stands out. */
function extremes(
  enemy: EnemySpec,
  stats: DirectorStats,
): { readonly lowest: number; readonly highest: number } | null {
  let lowest = Infinity;
  let highest = -Infinity;
  for (const attack of enemy.attacks) {
    const rate = successRate(stats, attack.counter);
    if (rate === null) continue;
    lowest = Math.min(lowest, rate);
    highest = Math.max(highest, rate);
  }
  return lowest < highest ? { lowest, highest } : null;
}

/** The warning after scaling. Shortening stops where the fastest phase using this attack would drop under the floor. */
function warning(enemy: EnemySpec, attack: EnemyAttack, factor: number): number {
  const scaled = Math.round(attack.telegraphMs * factor);
  if (factor >= 1) return scaled;
  let fastest = Infinity;
  for (const phase of enemy.phases ?? []) {
    // The engine plays every attack in a phase that names none of them.
    const uses = phase.attackIds.includes(attack.id) || !enemy.attacks.some((a) => phase.attackIds.includes(a.id));
    if (uses && phase.telegraphScale < fastest) fastest = phase.telegraphScale;
  }
  if (fastest === Infinity) fastest = 1;
  const floor = fastest > 0 ? Math.ceil(FLOOR_MS / fastest) : Infinity;
  return Math.max(scaled, Math.min(attack.telegraphMs, floor));
}

/** The enemy to hand the engine. Returns `enemy` itself when nothing should change. */
export function tune(enemy: EnemySpec, stats: DirectorStats): EnemySpec {
  const strength = skill(stats) * trust(stats);
  if (!Number.isFinite(strength) || strength === 0) return enemy;
  const pressing = strength > 0;
  const factor = pressing ? 1 - FASTER * strength : 1 - SLOWER * strength;
  // Lean on the weakest defence when pressing and the best when easing, more the further it stands out.
  const rates = extremes(enemy, stats);
  const favoured = rates === null ? null : pressing ? rates.lowest : rates.highest;
  const boost = rates === null ? 1 : 1 + Math.abs(strength) * Math.min(1, (rates.highest - rates.lowest) / FULL_GAP);

  const tuned = (attack: EnemyAttack): EnemyAttack => {
    const telegraphMs = warning(enemy, attack, factor);
    const base = attack.weight ?? 1;
    const leanOn = favoured !== null && base > 0 && successRate(stats, attack.counter) === favoured;
    if (leanOn) return { ...attack, telegraphMs, weight: base * boost };
    return telegraphMs === attack.telegraphMs ? attack : { ...attack, telegraphMs };
  };
  const [first, ...rest] = enemy.attacks;
  const attacks: readonly [EnemyAttack, ...EnemyAttack[]] = [tuned(first), ...rest.map(tuned)];
  const strikeWindowMs = pressing ? enemy.strikeWindowMs : Math.round(enemy.strikeWindowMs * (1 - WIDER * strength));

  const same = attacks.every((attack, index) => attack === enemy.attacks[index]);
  if (same && strikeWindowMs === enemy.strikeWindowMs) return enemy;
  return { ...enemy, strikeWindowMs, attacks };
}
