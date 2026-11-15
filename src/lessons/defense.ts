// Defence progress over many fights: what the player defended, by kind of defence, and what to practise next.
// Pure: fight records in, numbers and plain lines out. `recordFight` turns one fight's events into one small
// record; src/lessons/defenseStore.ts keeps the list in this browser. Rules are written up in docs/defense-progress.md.
//
// The combat events carry no clock, so there is no reaction time here: a record holds only what the events say.
import type { CombatEvent } from "../core/types";
import { MOVES } from "../moves/registry";

/** How one kind of defence did: times an attack asked for it, and times it stopped the attack. */
export interface KindCount {
  readonly seen: number;
  readonly defended: number;
}

/** One fight, as far as defence goes. Only fights with at least one attack that ran its course are kept. */
export interface FightDefense {
  /** When the fight ended, in milliseconds since 1970. */
  readonly at: number;
  readonly enemyId: string;
  /** Attacks that ran their course: defended plus landed. */
  readonly seen: number;
  readonly defended: number;
  /** Attacks that landed. Always `seen - defended`. */
  readonly hits: number;
  /** Most attacks in a row defended with none landing in between. */
  readonly longestRun: number;
  /** By the id of the defend move the attack asked for: block, duck, dodge_left, dodge_right, jump. */
  readonly kinds: Readonly<Record<string, KindCount>>;
}

export interface KindProgress extends KindCount {
  readonly moveId: string;
  readonly name: string;
  /** Share defended, 0 to 1; 0 when the kind has not come up. */
  readonly rate: number;
}

export interface TrendPoint {
  readonly at: number;
  readonly enemyId: string;
  readonly seen: number;
  readonly defended: number;
  readonly rate: number;
}

export type LevelId = "novice" | "guarded" | "steady" | "unshakeable";

export interface Level {
  readonly id: LevelId;
  readonly name: string;
  /** The rule in plain words. */
  readonly rule: string;
  /** Lowest overall defence rate, 0 to 1. */
  readonly minRate: number;
  readonly minFights: number;
  readonly minSeen: number;
}

export interface PractiseNext {
  /** The move to open in the Training Dojo; null when no kind stands out as weak. */
  readonly moveId: string | null;
  readonly line: string;
}

export interface DefenseProgress {
  readonly fights: number;
  readonly seen: number;
  readonly defended: number;
  readonly hits: number;
  /** Share of all attacks defended, 0 to 1; 0 with no history. */
  readonly rate: number;
  /** The four core defences always, in a fixed order, then any other kind that came up. */
  readonly kinds: readonly KindProgress[];
  /** The last five fights, oldest first. */
  readonly trend: readonly TrendPoint[];
  /** The newest fight against the ones before it in the trend; null with fewer than two fights. */
  readonly direction: "up" | "down" | "steady" | null;
  /** The longest run without being hit in any one saved fight. */
  readonly bestStreak: number;
  readonly weakest: KindProgress | null;
  readonly practiseNext: PractiseNext;
  readonly level: Level;
  /** The level after this one, or null at the top. */
  readonly nextLevel: Level | null;
}

/** The most fights kept; older ones drop off the front. */
export const HISTORY_MAX = 50;
export const TREND_FIGHTS = 5;
/** A kind must have come up this often before it can be called the weakest. */
export const WEAK_MIN_SEEN = 3;
/** The newest fight must differ from the ones before it by this much (5 points) to count as up or down. */
export const TREND_STEP = 0.05;
/** The order the kinds are listed in. */
export const CORE_KINDS: readonly string[] = ["block", "duck", "dodge_left", "dodge_right"];

/** Lowest first. A player holds the highest level whose three lines are all met. */
export const LEVELS: readonly Level[] = [
  { id: "novice", name: "Novice", rule: "Where everyone starts.", minRate: 0, minFights: 0, minSeen: 0 },
  { id: "guarded", name: "Guarded", rule: "Defend at least half of 10 or more attacks.", minRate: 0.5, minFights: 1, minSeen: 10 },
  { id: "steady", name: "Steady", rule: "Defend at least 7 in 10 attacks over 3 or more fights.", minRate: 0.7, minFights: 3, minSeen: 10 },
  { id: "unshakeable", name: "Unshakeable", rule: "Defend at least 17 in 20 attacks over 5 or more fights.", minRate: 0.85, minFights: 5, minSeen: 10 },
];

const share = (defended: number, seen: number): number => (seen > 0 ? defended / seen : 0);

/** The record of one fight from its events, or null when no attack ran its course. */
export function fightDefense(events: readonly CombatEvent[], about: { readonly enemyId: string; readonly at: number }): FightDefense | null {
  const kinds: Record<string, { seen: number; defended: number }> = {};
  let seen = 0;
  let defended = 0;
  let run = 0;
  let longestRun = 0;
  for (const event of events) {
    if (event.type !== "defended" && event.type !== "playerHit") continue;
    const kind = (kinds[event.attack.counter] ??= { seen: 0, defended: 0 });
    kind.seen += 1;
    seen += 1;
    if (event.type === "defended") {
      kind.defended += 1;
      defended += 1;
      run += 1;
      longestRun = Math.max(longestRun, run);
    } else {
      run = 0;
    }
  }
  if (seen === 0) return null;
  return { at: about.at, enemyId: about.enemyId, seen, defended, hits: seen - defended, longestRun, kinds };
}

/** The history with one more fight at the end, cut to the newest HISTORY_MAX. A fight with no attacks adds nothing. */
export function recordFight(
  history: readonly FightDefense[],
  events: readonly CombatEvent[],
  about: { readonly enemyId: string; readonly at: number },
): readonly FightDefense[] {
  const fight = fightDefense(events, about);
  return fight ? [...history, fight].slice(-HISTORY_MAX) : history;
}

export function levelFor(rate: number, fights: number, seen: number): Level {
  let level = LEVELS[0] as Level;
  for (const next of LEVELS) if (rate >= next.minRate && fights >= next.minFights && seen >= next.minSeen) level = next;
  return level;
}

function practiseLine(weakest: KindProgress | null, seen: number, defended: number): PractiseNext {
  if (seen === 0) return { moveId: null, line: "Play a fight, then come back to see what to practise." };
  if (weakest) {
    const held = `it held ${String(weakest.defended)} of ${String(weakest.seen)}`;
    return { moveId: weakest.moveId, line: `Practise ${weakest.name.toLowerCase()} in the Training Dojo: ${held}.` };
  }
  if (defended === seen) return { moveId: null, line: "Nothing got through. Keep it sharp in the Training Dojo." };
  return { moveId: null, line: "No one defence stands out yet. Play a few more fights." };
}

/** Everything the defence panel shows, from the saved fights (oldest first). */
export function defenseProgress(history: readonly FightDefense[]): DefenseProgress {
  const totals = new Map<string, { seen: number; defended: number }>(CORE_KINDS.map((id) => [id, { seen: 0, defended: 0 }]));
  let seen = 0;
  let defended = 0;
  let bestStreak = 0;
  for (const fight of history) {
    seen += fight.seen;
    defended += fight.defended;
    bestStreak = Math.max(bestStreak, fight.longestRun);
    for (const [id, count] of Object.entries(fight.kinds)) {
      const total = totals.get(id) ?? { seen: 0, defended: 0 };
      totals.set(id, { seen: total.seen + count.seen, defended: total.defended + count.defended });
    }
  }
  const kinds: KindProgress[] = [...totals]
    .filter(([id, count]) => CORE_KINDS.includes(id) || count.seen > 0)
    .map(([moveId, count]) => ({ moveId, name: MOVES.get(moveId)?.name ?? moveId, ...count, rate: share(count.defended, count.seen) }));

  // The lowest rate of the kinds met often enough that let something through; a tie goes to the kind met more, then to the one listed first.
  let weakest: KindProgress | null = null;
  for (const kind of kinds) {
    if (kind.seen < WEAK_MIN_SEEN || kind.defended === kind.seen) continue;
    if (!weakest || kind.rate < weakest.rate || (kind.rate === weakest.rate && kind.seen > weakest.seen)) weakest = kind;
  }

  const trend: TrendPoint[] = history.slice(-TREND_FIGHTS).map((fight) => ({
    at: fight.at, enemyId: fight.enemyId, seen: fight.seen, defended: fight.defended, rate: share(fight.defended, fight.seen),
  }));
  const newest = trend.at(-1);
  const before = trend.slice(0, -1);
  let direction: DefenseProgress["direction"] = null;
  if (newest && before.length > 0) {
    const change = newest.rate - before.reduce((sum, point) => sum + point.rate, 0) / before.length;
    direction = change >= TREND_STEP ? "up" : change <= -TREND_STEP ? "down" : "steady";
  }

  const rate = share(defended, seen);
  const level = levelFor(rate, history.length, seen);
  return {
    fights: history.length, seen, defended, hits: seen - defended, rate, kinds, trend, direction, bestStreak, weakest,
    practiseNext: practiseLine(weakest, seen, defended),
    level,
    nextLevel: LEVELS[LEVELS.indexOf(level) + 1] ?? null,
  };
}
