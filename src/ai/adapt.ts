// Turns a generated level into a fight the engine can run: a registered enemy re-dressed with the level's attacks, phases and pacing.
import type { EnemyAttack, EnemyPhase, EnemySpec, MoveDef } from "../core/types";
import { LIMITS } from "./contracts";
import type { LevelAttack, LevelSpec } from "./contracts";
import { clamp } from "./repair";

type Range = readonly [number, number];
type NonEmpty<T> = readonly [T, ...T[]];
type Base = LevelSpec["monster"]["base"];
type Moves = ReadonlyMap<string, MoveDef>;

/** The registered enemy whose 3D model plays each generated monster. */
const STAND_INS: Readonly<Record<Base, string>> = {
  cyclops: "polyphemus",
  laestrygonian: "polyphemus",
  scylla: "scylla",
  charybdis: "scylla",
  sirens: "scylla",
  suitor_horde: "polyphemus",
};

/** The defence that answers an attack from each side. Low attacks are jumped when the game has a jump, else ducked. */
const COUNTERS: Readonly<Record<Exclude<LevelAttack["direction"], "low">, string>> = {
  left: "dodge_right",
  right: "dodge_left",
  high: "duck",
  center: "block",
};

const SIDE_NAMES: Readonly<Record<LevelAttack["direction"], string>> = {
  left: "Left",
  right: "Right",
  high: "High",
  center: "Straight",
  low: "Low",
};

// Feints never reach these tables: the engine has no "do nothing" defence, so they are dropped first.
const TYPE_NAMES: Readonly<Record<LevelAttack["type"], string>> = {
  strike: "strike",
  sweep: "sweep",
  slam: "slam",
  projectile: "throw",
  grab: "grab",
  feint: "feint",
};
const TYPE_DAMAGE: Readonly<Record<LevelAttack["type"], number>> = {
  strike: 0.9,
  sweep: 1,
  slam: 1.1,
  projectile: 1,
  grab: 1.1,
  feint: 1,
};

// Players read a prompt card and then move their whole body, so the level's warnings are stretched onto this range.
const PLAYABLE_WARNING_MS: Range = [900, 2200];
const WARNING_MS: Range = [800, 2400];
const DAMAGE: Range = [6, 30];
const STRIKE_WINDOW_MS: Range = [1600, 3200];
const HP: Range = [60, 600];
const MIN_WEIGHT = 0.05;

// Mirrors of the engine's private timings and damage (src/combat/engine.ts), used only to pace the fight.
const INTRO_MS = 1500;
const RECOVER_MS = 700;
const STRIKE_DAMAGE = 12;
// The player the fight is paced for: the same one tests/content.test.ts paces Polyphemus for.
const SKILL = 0.85;
const REACT_MS = 800;

/** Where `value` sits in `range`, 0..1. */
function unit(value: number, [low, high]: Range): number {
  return clamp((value - low) / (high - low), [0, 1]);
}

function nonEmpty<T>(items: readonly T[]): NonEmpty<T> | null {
  const [first, ...rest] = items;
  return first === undefined ? null : [first, ...rest];
}

function hundredths(value: number): number {
  return Math.round(value * 100) / 100;
}

function weightOf(attack: EnemyAttack): number {
  return Math.max(attack.weight ?? 1, MIN_WEIGHT);
}

function defends(moves: Moves, id: string): boolean {
  return moves.get(id)?.kind === "defend";
}

/** Only used when no enemy is registered at all, so the function still returns something playable. */
function bareEnemy(base: Base, moves: Moves): EnemySpec {
  const strikes = [...moves.values()].filter((move) => move.kind === "strike").map((move) => move.id);
  return {
    id: base,
    name: base,
    title: "",
    order: 0,
    hp: 200,
    strikeWindowMs: 2400,
    attacks: [{ id: "gen_block", name: "Straight strike", telegraphMs: 1600, damage: 10, counter: "block" }],
    weakSpots: [{ id: "body", label: "its body", position: [0, 2, 1], moves: strikes }],
    taunts: [],
  };
}

function standIn(base: Base, enemies: readonly EnemySpec[], moves: Moves): EnemySpec {
  return (
    enemies.find((enemy) => enemy.id === base) ??
    enemies.find((enemy) => enemy.id === STAND_INS[base]) ??
    enemies[0] ??
    bareEnemy(base, moves)
  );
}

/** Level attacks that share a defence, added up. */
interface Merged {
  readonly counter: string;
  /** The heaviest attack in the group: it gives the group its name and its kind of blow. */
  readonly lead: LevelAttack;
  readonly weight: number;
  readonly weightedMs: number;
  readonly plainMs: number;
  readonly count: number;
}

function mergeByCounter(level: LevelSpec, moves: Moves): Merged[] {
  const groups = new Map<string, Merged>();
  for (const attack of level.attack_pool) {
    if (attack.type === "feint") continue;
    const counter = attack.direction === "low" ? (defends(moves, "jump") ? "jump" : "duck") : COUNTERS[attack.direction];
    if (!defends(moves, counter)) continue;
    const group = groups.get(counter);
    groups.set(counter, {
      counter,
      lead: group && group.lead.weight >= attack.weight ? group.lead : attack,
      weight: (group?.weight ?? 0) + attack.weight,
      weightedMs: (group?.weightedMs ?? 0) + attack.weight * attack.telegraph_ms,
      plainMs: (group?.plainMs ?? 0) + attack.telegraph_ms,
      count: (group?.count ?? 0) + 1,
    });
  }
  return [...groups.values()];
}

function toAttack(group: Merged, level: LevelSpec, stand: EnemySpec): EnemyAttack {
  // Reusing the stand-in's own attack id keeps its model's wind-up animation.
  const own = stand.attacks.find((attack) => attack.counter === group.counter);
  const levelMs = group.weight > 0 ? group.weightedMs / group.weight : group.plainMs / group.count;
  const [short, long] = PLAYABLE_WARNING_MS;
  // The fastest monsters warn 10 percent shorter, the slowest 10 percent longer.
  const quickness = 1.1 - 0.2 * unit(level.monster.speed, LIMITS.speed);
  const baseDamage = own?.damage ?? stand.attacks.reduce((sum, attack) => sum + attack.damage, 0) / stand.attacks.length;
  const fury = 1 + 0.2 * unit(level.monster.aggression, LIMITS.aggression);
  return {
    id: own?.id ?? `gen_${group.counter}`,
    name: `${SIDE_NAMES[group.lead.direction]} ${TYPE_NAMES[group.lead.type]}`,
    telegraphMs: Math.round(clamp((short + (long - short) * unit(levelMs, LIMITS.telegraphMs)) * quickness, WARNING_MS)),
    damage: clamp(Math.round(baseDamage * fury * TYPE_DAMAGE[group.lead.type]), DAMAGE),
    counter: group.counter,
    weight: Math.max(MIN_WEIGHT, hundredths(group.weight)),
  };
}

function toPhases(level: LevelSpec, attacks: NonEmpty<EnemyAttack>): NonEmpty<EnemyPhase> {
  const everything = nonEmpty(attacks.map((attack) => attack.id)) ?? [attacks[0].id];
  // The opening phase teaches with the slower-warning half of the attacks.
  const slowFirst = [...attacks].sort((a, b) => b.telegraphMs - a.telegraphMs);
  const slow = slowFirst.slice(0, Math.max(Math.ceil(attacks.length / 2), Math.min(2, attacks.length)));
  const openers = nonEmpty(everything.filter((id) => slow.some((attack) => attack.id === id))) ?? everything;

  const totalS = level.phases.reduce((sum, phase) => sum + phase.duration_s, 0);
  const phases: EnemyPhase[] = [];
  let elapsedS = 0;
  for (const phase of level.phases) {
    const before = phases.at(-1);
    // A phase starts once the share of health matching the fight time before it is gone.
    const belowHp = before ? hundredths(Math.min(1 - elapsedS / Math.max(totalS, 1), before.belowHp - 0.01)) : 1;
    if (belowHp < 0.01) break;
    elapsedS += phase.duration_s;
    const attackIds = before ? everything : openers;
    const fastest = Math.min(...attacks.filter((attack) => attackIds.includes(attack.id)).map((attack) => attack.telegraphMs));
    // 1.15 when calm down to 0.75 at full intensity, but never so fast that a warning drops below the playable floor.
    const scale = Math.max(1.15 - 0.4 * unit(phase.intensity, LIMITS.intensity), Math.min(1, WARNING_MS[0] / fastest));
    phases.push({ name: phase.name, belowHp, attackIds, telegraphScale: Math.ceil(scale * 100 - 1e-9) / 100 });
  }
  return nonEmpty(phases) ?? [{ name: level.monster.name, belowHp: 1, attackIds: everything, telegraphScale: 1 }];
}

/** The average warning over the whole fight: each phase's weighted mix, scaled, for the share of health it covers. */
function meanWarningMs(attacks: NonEmpty<EnemyAttack>, phases: NonEmpty<EnemyPhase>): number {
  return phases.reduce((sum, phase, index) => {
    const pool = attacks.filter((attack) => phase.attackIds.includes(attack.id));
    const weight = pool.reduce((total, attack) => total + weightOf(attack), 0);
    const warning = pool.reduce((total, attack) => total + weightOf(attack) * attack.telegraphMs, 0) / weight;
    return sum + (phase.belowHp - (phases[index + 1]?.belowHp ?? 0)) * warning * phase.telegraphScale;
  }, 0);
}

/**
 * Health that makes the fight last about `fightMs` for a player who gets SKILL of the prompts right.
 * One exchange is the warning, then (if defended) the strike beat, then the engine's 700 ms recovery.
 * The strike beat costs REACT_MS when the strike is thrown and the whole strike window when it is missed, so
 *   exchangeMs = warning + 700 + SKILL * (SKILL * REACT_MS + (1 - SKILL) * strikeWindowMs).
 * A strike lands in SKILL * SKILL of exchanges and does 12 * (1 + 0.1 * combo), the combo capped at 5 and reset by
 * any miss, so the combo averages landed + landed^2 + ... + landed^5 (about 2.1, so about 14.5 a hit and 10.5 an exchange).
 *   hp = (fightMs - intro) / exchangeMs * damage per exchange.
 * Check against Polyphemus: 1825 ms warnings and a 2600 ms window give 3.4 s exchanges, so 400 hp is about 130 s.
 */
function pacedHp(fightMs: number, warningMs: number, strikeWindowMs: number): number {
  const landed = SKILL * SKILL;
  const exchangeMs = warningMs + RECOVER_MS + SKILL * (SKILL * REACT_MS + (1 - SKILL) * strikeWindowMs);
  const combo = [1, 2, 3, 4, 5].reduce((sum, hits) => sum + landed ** hits, 0);
  const damagePerExchange = landed * STRIKE_DAMAGE * (1 + 0.1 * combo);
  return Math.round(clamp(((fightMs - INTRO_MS) / exchangeMs) * damagePerExchange, HP));
}

/** The generated level as an enemy: the stand-in's id, model, weak spots and finisher, with the level's attacks and pacing. */
export function fightFromLevel(level: LevelSpec, enemies: readonly EnemySpec[], moves: Moves): EnemySpec {
  const stand = standIn(level.monster.base, enemies, moves);
  const generated = mergeByCounter(level, moves).map((group) => toAttack(group, level, stand));
  const attacks = nonEmpty(generated) ?? stand.attacks;
  const phases = toPhases(level, attacks);

  // Quick, aggressive monsters close their openings sooner: 15 percent longer than the stand-in's down to 15 percent shorter.
  const haste = 1.15 - 0.2 * unit(level.monster.speed, LIMITS.speed) - 0.1 * unit(level.monster.aggression, LIMITS.aggression);
  const strikeWindowMs = Math.round(clamp(stand.strikeWindowMs * haste, STRIKE_WINDOW_MS));
  const fightS = clamp(level.phases.reduce((sum, phase) => sum + phase.duration_s, 0), LIMITS.fightSeconds);

  return {
    ...stand,
    name: level.monster.name,
    title: level.title,
    taunts: level.taunts,
    hp: pacedHp(fightS * 1000, meanWarningMs(attacks, phases), strikeWindowMs),
    strikeWindowMs,
    attacks,
    phases,
  };
}
