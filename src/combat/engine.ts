// The fight rules. Pure: no camera, no graphics, no clock. Feed it input and elapsed time.
import type {
  CombatEvent,
  CombatInput,
  CombatState,
  EnemySpec,
  FightingStyle,
} from "../core/types";

export const PLAYER_HP = 100;
const INTRO_MS = 1500;
const RECOVER_MS = 700;
const STRIKE_DAMAGE = 12;

export interface StepResult {
  readonly state: CombatState;
  readonly events: readonly CombatEvent[];
}

function roll(seed: number): { value: number; seed: number } {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return { value: next / 4294967296, seed: next };
}

function pick<T>(items: readonly [T, ...T[]], seed: number): { item: T; seed: number } {
  const rolled = roll(seed);
  return { item: items[Math.floor(rolled.value * items.length)] ?? items[0], seed: rolled.seed };
}

function learned(state: CombatState, move: string): CombatState {
  return { ...state, mastery: { ...state.mastery, [move]: (state.mastery[move] ?? 0) + 1 } };
}

/** How much help the prompt gives: the full card, just the word, or just the glow. */
export function promptLevel(successes: number): "full" | "word" | "glow" {
  if (successes < 2) return "full";
  return successes < 5 ? "word" : "glow";
}

export function startFight(enemy: EnemySpec, seed: number): CombatState {
  return {
    playerHp: PLAYER_HP,
    enemyHp: enemy.hp,
    phase: { kind: "intro", msLeft: INTRO_MS },
    combo: 0,
    score: 0,
    mastery: {},
    seed,
    phaseIndex: 0,
    power: 0,
    players: 1,
  };
}

function beginDefend(state: CombatState, enemy: EnemySpec): StepResult {
  const { item: attack, seed } = pick(enemy.attacks, state.seed);
  return {
    state: {
      ...state,
      seed,
      phase: { kind: "defend", attack, msLeft: attack.telegraphMs, totalMs: attack.telegraphMs },
    },
    events: [{ type: "telegraph", attack }],
  };
}

function beginStrike(
  state: CombatState,
  enemy: EnemySpec,
  style: FightingStyle,
  before: readonly CombatEvent[],
): StepResult {
  const spot = pick(enemy.weakSpots, state.seed);
  const fitting = spot.item.moves.filter((move) => style.strikes.includes(move));
  const rolled = roll(spot.seed);
  const pool = fitting.length > 0 ? fitting : style.strikes;
  const move = pool[Math.floor(rolled.value * pool.length)] ?? style.strikes[0];
  return {
    state: {
      ...state,
      seed: rolled.seed,
      phase: {
        kind: "strike",
        weakSpot: spot.item,
        move,
        msLeft: enemy.strikeWindowMs,
        totalMs: enemy.strikeWindowMs,
      },
    },
    events: [...before, { type: "opening", weakSpot: spot.item, move }],
  };
}

const RECOVER = { kind: "recover", msLeft: RECOVER_MS } as const;

/** Advance the fight by dtMs. A defense counts if it is held at the moment the attack lands. */
export function step(
  state: CombatState,
  enemy: EnemySpec,
  style: FightingStyle,
  input: CombatInput,
  dtMs: number,
): StepResult {
  const phase = state.phase;
  switch (phase.kind) {
    case "won":
    case "lost":
    case "finisher": // nothing enters this phase until the finishing move lands (issue 6)
      return { state, events: [] };
    case "intro":
    case "recover": {
      const msLeft = phase.msLeft - dtMs;
      if (msLeft > 0) return { state: { ...state, phase: { ...phase, msLeft } }, events: [] };
      return beginDefend(state, enemy);
    }
    case "defend": {
      const msLeft = phase.msLeft - dtMs;
      if (msLeft > 0) return { state: { ...state, phase: { ...phase, msLeft } }, events: [] };
      const attack = phase.attack;
      if (input.held.has(attack.counter)) {
        const blocked = { ...learned(state, attack.counter), score: state.score + 50 };
        return beginStrike(blocked, enemy, style, [{ type: "defended", attack }]);
      }
      const playerHp = Math.max(0, state.playerHp - attack.damage);
      const hit: CombatEvent = { type: "playerHit", attack, damage: attack.damage };
      if (playerHp === 0) {
        return {
          state: { ...state, playerHp, combo: 0, phase: { kind: "lost" } },
          events: [hit, { type: "lost" }],
        };
      }
      return { state: { ...state, playerHp, combo: 0, phase: RECOVER }, events: [hit] };
    }
    case "strike": {
      const strike = input.struck.find((thrown) => thrown.move === phase.move);
      if (strike) {
        const damage = Math.round(STRIKE_DAMAGE * (1 + Math.min(state.combo, 5) * 0.1));
        const enemyHp = Math.max(0, state.enemyHp - damage);
        const landed: CombatEvent = { type: "enemyHit", move: phase.move, damage, quality: strike.quality };
        const next = {
          ...learned(state, phase.move),
          enemyHp,
          combo: state.combo + 1,
          score: state.score + damage * 10,
        };
        if (enemyHp === 0) {
          return { state: { ...next, phase: { kind: "won" } }, events: [landed, { type: "won" }] };
        }
        return { state: { ...next, phase: RECOVER }, events: [landed] };
      }
      const msLeft = phase.msLeft - dtMs;
      if (msLeft > 0) return { state: { ...state, phase: { ...phase, msLeft } }, events: [] };
      return { state: { ...state, combo: 0, phase: RECOVER }, events: [{ type: "whiffed" }] };
    }
  }
}
