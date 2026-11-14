// Turns a generated level into a fight the engine can run: a registered enemy re-dressed with the level's attacks, phases and pacing.
import { PLAYER_HP } from "../combat/engine";
import type { EnemyAttack, EnemyPhase, EnemySpec, MoveDef } from "../core/types";
import { LIMITS } from "./contracts";
import type { LevelAttack, LevelSpec } from "./contracts";
import { clamp } from "./repair";

type Range = readonly [number, number];
type NonEmpty<T> = readonly [T, ...T[]];
type Base = LevelSpec["monster"]["base"];
type Side = LevelAttack["direction"];
type Moves = ReadonlyMap<string, MoveDef>;

/**
 * The registered enemy that plays each generated monster when none is registered under the monster's own id.
 * Charybdis and the Sirens are registered under theirs, so this table only decides for them when they are missing.
 */
const STAND_INS: Readonly<Record<Base, string>> = {
  cyclops: "polyphemus",
  laestrygonian: "polyphemus",
  scylla: "scylla",
  charybdis: "scylla",
  sirens: "scylla",
  suitor_horde: "suitors",
};

/** The defence that answers an attack from each side. */
const COUNTERS: Readonly<Record<Side, string>> = {
  left: "dodge_right",
  right: "dodge_left",
  high: "duck",
  center: "block",
  low: "jump",
};

const SIDE_NAMES: Readonly<Record<Side, string>> = {
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
// The floor is lowered for a stand-in whose own blows are lighter: see damageRange.
const DAMAGE: Range = [6, 30];
const STRIKE_WINDOW_MS: Range = [1600, 3200];
const HP: Range = [60, 600];
const MIN_WEIGHT = 0.05;
// A fight has to make the player read its prompts: below this many different defences the stand-in's own attacks fill in.
const MIN_COUNTERS = 3;
// How often each filled-in attack comes up, as a share of the level's own attacks together.
const TOP_UP_SHARE = 0.15;

// Mirrors of the engine's private timings and damage (src/combat/engine.ts), used only to pace the fight.
const INTRO_MS = 1500;
const RECOVER_MS = 700;
const STRIKE_DAMAGE = 12;
// The player the fight is paced for: 85 percent of prompts right and 800 ms to throw a strike.
// tests/content.test.ts plays Polyphemus with the same two numbers.
const SKILL = 0.85;
const REACT_MS = 800;
// A strike lands when the defence and then the strike are both right. Each one does 12 * (1 + 0.1 * combo), the combo
// capped at 5 and reset by any miss, so it averages landed + landed^2 + ... + landed^5: about 2.1, so 14.5 a hit and 10.5 an exchange.
const LANDED = SKILL * SKILL;
const MEAN_COMBO = [1, 2, 3, 4, 5].reduce((sum, hits) => sum + LANDED ** hits, 0);
const DAMAGE_PER_EXCHANGE = LANDED * STRIKE_DAMAGE * (1 + 0.1 * MEAN_COMBO);
// The most health that player should expect to lose over the whole fight, whichever stand-in plays the level.
const DAMAGE_BUDGET = 0.4 * PLAYER_HP;

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

/** `value` held to the range the schema allows, or the middle of that range when it is not a number. */
function held(value: number, range: Range): number {
  return Number.isFinite(value) ? clamp(value, range) : (range[0] + range[1]) / 2;
}

/**
 * The level with every number the adapter reads held to the schema's range (LIMITS). A level that passed
 * LevelSpecSchema comes back with the same numbers. One that skipped it could carry NaN, Infinity or 1e308, which used
 * to give a fight with NaN health that never ended. Attacks of a type or direction the adapter does not know are
 * dropped, as feints are.
 */
function trusted(level: LevelSpec): LevelSpec {
  return {
    ...level,
    monster: {
      ...level.monster,
      speed: held(level.monster.speed, LIMITS.speed),
      aggression: held(level.monster.aggression, LIMITS.aggression),
    },
    attack_pool: level.attack_pool
      .filter((attack) => Object.hasOwn(TYPE_DAMAGE, attack.type) && Object.hasOwn(COUNTERS, attack.direction))
      .map((attack) => ({
        ...attack,
        telegraph_ms: held(attack.telegraph_ms, LIMITS.telegraphMs),
        weight: held(attack.weight, LIMITS.weight),
      })),
    phases: level.phases.map((phase) => ({
      ...phase,
      duration_s: held(phase.duration_s, LIMITS.phaseSeconds),
      intensity: held(phase.intensity, LIMITS.intensity),
    })),
  };
}

/**
 * The damage a blow may do on this stand-in. The floor is 6, or the stand-in's own lightest blow when that is lower:
 * an enemy tuned to hit softly (the first fight is) must not have its blows lifted above its own tuning.
 */
function damageRange(stand: EnemySpec): Range {
  const lightest = Math.min(...stand.attacks.map((attack) => attack.damage));
  return [Math.max(1, Math.min(DAMAGE[0], lightest)), DAMAGE[1]];
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
  /** Where the player is told the blow comes from: always the side its defence answers. */
  readonly side: Side;
  /** The heaviest attack in the group: it gives the group its kind of blow. */
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
    // A low blow is jumped. In a game with no jump move it is ducked, so it is merged, named and animated as a high one.
    const side = attack.direction === "low" && !defends(moves, COUNTERS.low) ? "high" : attack.direction;
    const counter = COUNTERS[side];
    if (!defends(moves, counter)) continue;
    const group = groups.get(counter);
    groups.set(counter, {
      counter,
      side,
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
  // Reusing the stand-in's own attack id keeps its model's wind-up animation. A defence the stand-in has no attack for
  // (today that is jump, for every registered enemy) gets a gen_ id no model animates: the prompt card is its only warning.
  const own = stand.attacks.find((attack) => attack.counter === group.counter);
  const levelMs = group.weight > 0 ? group.weightedMs / group.weight : group.plainMs / group.count;
  const [short, long] = PLAYABLE_WARNING_MS;
  // The fastest monsters warn 10 percent shorter, the slowest 10 percent longer.
  const quickness = 1.1 - 0.2 * unit(level.monster.speed, LIMITS.speed);
  const baseDamage = own?.damage ?? stand.attacks.reduce((sum, attack) => sum + attack.damage, 0) / stand.attacks.length;
  const fury = 1 + 0.2 * unit(level.monster.aggression, LIMITS.aggression);
  return {
    id: own?.id ?? `gen_${group.counter}`,
    name: `${SIDE_NAMES[group.side]} ${TYPE_NAMES[group.lead.type]}`,
    telegraphMs: Math.round(clamp((short + (long - short) * unit(levelMs, LIMITS.telegraphMs)) * quickness, WARNING_MS)),
    damage: clamp(Math.round(baseDamage * fury * TYPE_DAMAGE[group.lead.type]), damageRange(stand)),
    counter: group.counter,
    weight: Math.max(MIN_WEIGHT, hundredths(group.weight)),
  };
}

/**
 * A level that attacks from one or two sides only would be won by holding a single pose, so the stand-in's own
 * attacks (with their ids, names and warnings) fill in the missing defences at a low weight.
 */
function toppedUp(generated: NonEmpty<EnemyAttack>, stand: EnemySpec, moves: Moves): NonEmpty<EnemyAttack> {
  const levelWeight = generated.reduce((sum, attack) => sum + weightOf(attack), 0);
  const weight = Math.max(MIN_WEIGHT, hundredths(TOP_UP_SHARE * levelWeight));
  const attacks: [EnemyAttack, ...EnemyAttack[]] = [...generated];
  for (const own of stand.attacks) {
    // Generated attacks have one defence each, so the length is the number of different defences.
    if (attacks.length >= MIN_COUNTERS) break;
    if (!defends(moves, own.counter)) continue;
    if (attacks.some((attack) => attack.counter === own.counter || attack.id === own.id)) continue;
    attacks.push({ ...own, weight });
  }
  return attacks;
}

/** `fromLevel` are the attacks the level itself asked for, as opposed to any the stand-in filled in. */
function toPhases(level: LevelSpec, attacks: NonEmpty<EnemyAttack>, fromLevel: readonly EnemyAttack[]): NonEmpty<EnemyPhase> {
  const everything = nonEmpty(attacks.map((attack) => attack.id)) ?? [attacks[0].id];
  // The opening phase teaches with the slower-warning half of the attacks, the level's own before any filled in.
  const slowFirst = [...attacks].sort(
    (a, b) => Number(fromLevel.includes(b)) - Number(fromLevel.includes(a)) || b.telegraphMs - a.telegraphMs,
  );
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

/** The average of `value` over the whole fight: each phase's weighted mix of attacks, for the share of health it covers. */
function fightMean(
  attacks: NonEmpty<EnemyAttack>,
  phases: NonEmpty<EnemyPhase>,
  value: (attack: EnemyAttack, phase: EnemyPhase) => number,
): number {
  return phases.reduce((sum, phase, index) => {
    const pool = attacks.filter((attack) => phase.attackIds.includes(attack.id));
    const weight = pool.reduce((total, attack) => total + weightOf(attack), 0);
    const mean = pool.reduce((total, attack) => total + weightOf(attack) * value(attack, phase), 0) / weight;
    return sum + (phase.belowHp - (phases[index + 1]?.belowHp ?? 0)) * mean;
  }, 0);
}

/**
 * Health that makes the fight last about `fightMs` for a player who gets SKILL of the prompts right.
 * One exchange is the warning, then (if defended) the strike beat, then the engine's 700 ms recovery.
 * The strike beat costs REACT_MS when the strike is thrown and the whole strike window when it is missed, so
 *   exchangeMs = warning + 700 + SKILL * (SKILL * REACT_MS + (1 - SKILL) * strikeWindowMs)
 *   hp = (fightMs - intro) / exchangeMs * DAMAGE_PER_EXCHANGE.
 * Worked once: 1825 ms warnings and a 2600 ms window give 3.4 s exchanges, so a 130 s fight needs about 400 hp.
 *
 * `warningMs` is the warning the engine gives: it honours weights, phase attackIds and telegraphScale.
 * The engine also multiplies strike damage by (0.5 + quality), which this arithmetic leaves out, so the played length
 * moves with how well the strikes are thrown. Measured on the five fallback levels over the six registered enemies, for the
 * paced player: 0.91 to 0.96 of the plan at the default quality of 0.7, 1.02 to 1.06 at 0.55 and 0.73 to 0.78 at 1.
 * tests/ai/adapt.test.ts holds the default to 0.8..1.25 of the plan. Divine power is not counted either: a player who
 * spends a full meter takes off three plain strikes' worth of health and finishes sooner.
 */
function pacedHp(fightMs: number, warningMs: number, strikeWindowMs: number): number {
  const exchangeMs = warningMs + RECOVER_MS + SKILL * (SKILL * REACT_MS + (1 - SKILL) * strikeWindowMs);
  return Math.round(clamp(((fightMs - INTRO_MS) / exchangeMs) * DAMAGE_PER_EXCHANGE, HP));
}

/**
 * The attacks, softened until the paced player expects to lose no more than DAMAGE_BUDGET over the whole fight:
 *   expected = exchanges * share of warnings missed * average damage = hp / DAMAGE_PER_EXCHANGE * (1 - SKILL) * damage.
 * A stand-in's blows were tuned for its own fight, and the stops differ a lot: the first one hits lightly, the last
 * one about twice as hard. Left alone, the same level would be far deadlier on one stand-in than on another.
 * Softening only ever lowers a blow, and never below the stand-in's floor (damageRange).
 */
function softened(
  attacks: NonEmpty<EnemyAttack>,
  phases: NonEmpty<EnemyPhase>,
  hp: number,
  range: Range,
): NonEmpty<EnemyAttack> {
  const expected = (hp / DAMAGE_PER_EXCHANGE) * (1 - SKILL) * fightMean(attacks, phases, (attack) => attack.damage);
  if (expected <= DAMAGE_BUDGET) return attacks;
  const scale = DAMAGE_BUDGET / expected;
  const lower = (attack: EnemyAttack): EnemyAttack => ({
    ...attack,
    damage: Math.min(attack.damage, clamp(Math.round(attack.damage * scale), range)),
  });
  return nonEmpty(attacks.map(lower)) ?? attacks;
}

/**
 * The generated level as an enemy: the stand-in's id, model, weak spots and finisher, with the level's attacks and pacing.
 * The level should have passed LevelSpecSchema (generateLevel's always has). One that did not is still turned into a
 * fight that ends: see `trusted`.
 */
export function fightFromLevel(unchecked: LevelSpec, enemies: readonly EnemySpec[], moves: Moves): EnemySpec {
  const level = trusted(unchecked);
  const stand = standIn(level.monster.base, enemies, moves);
  const generated = nonEmpty(mergeByCounter(level, moves).map((group) => toAttack(group, level, stand)));
  const attacks = generated ? toppedUp(generated, stand, moves) : stand.attacks;
  const phases = toPhases(level, attacks, generated ?? attacks);

  // Quick, aggressive monsters close their openings sooner: 15 percent longer than the stand-in's down to 15 percent shorter.
  const haste = 1.15 - 0.2 * unit(level.monster.speed, LIMITS.speed) - 0.1 * unit(level.monster.aggression, LIMITS.aggression);
  const strikeWindowMs = Math.round(clamp(stand.strikeWindowMs * haste, STRIKE_WINDOW_MS));
  const fightS = clamp(level.phases.reduce((sum, phase) => sum + phase.duration_s, 0), LIMITS.fightSeconds);
  const warningMs = fightMean(attacks, phases, (attack, phase) => attack.telegraphMs * phase.telegraphScale);
  const hp = pacedHp(fightS * 1000, warningMs, strikeWindowMs);

  return {
    ...stand,
    name: level.monster.name,
    title: level.title,
    taunts: level.taunts,
    hp,
    strikeWindowMs,
    attacks: softened(attacks, phases, hp, damageRange(stand)),
    phases,
  };
}
