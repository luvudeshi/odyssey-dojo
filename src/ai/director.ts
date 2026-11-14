// Adaptive difficulty: watches the fight's events and hands the engine a gently re-tuned copy of the enemy.
// The engine reads warnings and weights only when an attack begins, so one already winding up never changes.
import type { CombatEvent, EnemyAttack, EnemySpec } from "../core/types";

export type DirectorResult = "defended" | "hit" | "landed" | "whiffed";

export interface DefenceTally {
  readonly defended: number;
  readonly hit: number;
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
const FLOOR_MS = 800;
const FASTER = 0.2;
const SLOWER = 0.3;
const WIDER = 0.25;

function remembered(recent: readonly DirectorResult[], result: DirectorResult): readonly DirectorResult[] {
  return [...recent.slice(1 - WINDOW), result];
}

function resolved(stats: DirectorStats, counter: string, stopped: boolean): DirectorStats {
  const tally = stats.defences[counter] ?? { defended: 0, hit: 0 };
  const next = stopped ? { ...tally, defended: tally.defended + 1 } : { ...tally, hit: tally.hit + 1 };
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

/** Share of the attacks needing this defence that the player stopped; null until there are enough to say. */
function successRate(stats: DirectorStats, counter: string): number | null {
  const tally = stats.defences[counter];
  if (!tally || tally.defended + tally.hit < MIN_SAMPLES) return null;
  return tally.defended / (tally.defended + tally.hit);
}

/** The success rate of the defence to lean on: the weakest when pressing, the best when easing. Null: none stands out. */
function favouredRate(enemy: EnemySpec, stats: DirectorStats, pressing: boolean): number | null {
  let lowest = Infinity;
  let highest = -Infinity;
  for (const attack of enemy.attacks) {
    const rate = successRate(stats, attack.counter);
    if (rate === null) continue;
    lowest = Math.min(lowest, rate);
    highest = Math.max(highest, rate);
  }
  if (lowest >= highest) return null;
  return pressing ? lowest : highest;
}

/** The warning after scaling. Shortening stops where the fastest phase using this attack would drop under the floor. */
function warning(enemy: EnemySpec, attack: EnemyAttack, factor: number): number {
  const scaled = Math.round(attack.telegraphMs * factor);
  if (factor >= 1) return scaled;
  let fastest = Infinity;
  for (const phase of enemy.phases ?? []) {
    if (phase.attackIds.includes(attack.id) && phase.telegraphScale < fastest) fastest = phase.telegraphScale;
  }
  if (fastest === Infinity) fastest = 1;
  const floor = fastest > 0 ? Math.ceil(FLOOR_MS / fastest) : Infinity;
  return Math.max(scaled, Math.min(attack.telegraphMs, floor));
}

function retune(enemy: EnemySpec, stats: DirectorStats): EnemySpec {
  const strength = skill(stats) * trust(stats);
  if (strength === 0) return enemy;
  const pressing = strength > 0;
  const factor = pressing ? 1 - FASTER * strength : 1 - SLOWER * strength;
  const favoured = favouredRate(enemy, stats, pressing);
  const boost = 1 + Math.abs(strength);

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

let last: { readonly enemy: EnemySpec; readonly stats: DirectorStats; readonly tuned: EnemySpec } | null = null;

/** The enemy to hand the engine this frame. Returns `enemy` itself when nothing should change. */
export function tune(enemy: EnemySpec, stats: DirectorStats): EnemySpec {
  if (last?.enemy === enemy && last.stats === stats) return last.tuned;
  const tuned = retune(enemy, stats);
  last = { enemy, stats, tuned };
  return tuned;
}
