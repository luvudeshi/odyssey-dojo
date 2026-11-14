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
const FINISHER_MS = 6000;
/** Divine power: each defend fills a fifth of the meter, a GREAT or better strike a twentieth. */
const POWER_PER_DEFEND = 0.2;
const POWER_PER_GREAT = 0.05;
const GREAT_QUALITY = 0.8;
/** Spending a full meter hits as hard as three plain strikes. */
export const POWER_DAMAGE = STRIKE_DAMAGE * 3;
/** The god gesture moves (src/moves/defs). A strike with one of these ids spends a full meter. */
export const POWER_MOVES: ReadonlySet<string> = new Set([
  "thunderbolt",
  "trident_sweep",
  "aegis_push",
  "swift_dash",
  "moon_arrow",
  "sun_burst",
]);

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

/** How big the prompt card is. Mastery shrinks it but never hides the word, the key or the timer: "full" adds the diagram and hint, "word" adds the target line, "mini" is word, key and timer only. */
export function promptLevel(successes: number): "full" | "word" | "mini" {
  if (successes < 2) return "full";
  return successes < 5 ? "word" : "mini";
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

/** Index of the last phase whose belowHp the enemy's health has dropped to. */
export function phaseIndexFor(enemy: EnemySpec, enemyHp: number): number {
  const share = enemyHp / enemy.hp;
  let index = 0;
  enemy.phases?.forEach((phase, i) => {
    if (share <= phase.belowHp) index = i;
  });
  return index;
}

function beginDefend(state: CombatState, enemy: EnemySpec): StepResult {
  const phase = enemy.phases?.[state.phaseIndex];
  const allowed = phase ? enemy.attacks.filter((a) => phase.attackIds.includes(a.id)) : enemy.attacks;
  const pool = allowed.length > 0 ? allowed : enemy.attacks;
  const weights = pool.map((a) => Math.max(0, a.weight ?? 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const rolled = roll(state.seed);
  let target = rolled.value * total;
  let attack = pool[pool.length - 1] ?? enemy.attacks[0];
  for (const [i, candidate] of pool.entries()) {
    target -= weights[i] ?? 0;
    if (target < 0) {
      attack = candidate;
      break;
    }
  }
  const seed = rolled.seed;
  const ms = Math.round(attack.telegraphMs * (phase?.telegraphScale ?? 1));
  return {
    state: {
      ...state,
      seed,
      phase: { kind: "defend", attack, msLeft: ms, totalMs: ms },
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

function fill(state: CombatState, amount: number): CombatState {
  return { ...state, power: Math.min(1, state.power + amount) };
}

/** Spend a full meter on the enemy. Health stops at zero so a finisher still follows. */
function unleash(state: CombatState, enemy: EnemySpec): StepResult {
  const enemyHp = Math.max(0, state.enemyHp - POWER_DAMAGE);
  const damage = state.enemyHp - enemyHp;
  const phaseIndex = phaseIndexFor(enemy, enemyHp);
  const next = { ...state, power: 0, enemyHp, phaseIndex, score: state.score + damage * 10 };
  const events: CombatEvent[] = [{ type: "powerUnleashed", damage }];
  const changed = enemy.phases?.[phaseIndex];
  if (phaseIndex !== state.phaseIndex && changed) {
    events.push({ type: "phaseChanged", index: phaseIndex, name: changed.name });
  }
  if (enemyHp > 0) return { state: next, events };
  if (enemy.finisher) {
    const finisher = { kind: "finisher", move: enemy.finisher, msLeft: FINISHER_MS, totalMs: FINISHER_MS } as const;
    return { state: { ...next, phase: finisher }, events };
  }
  return { state: { ...next, phase: { kind: "won" } }, events: [...events, { type: "won" }] };
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
  const open = state.phase.kind === "defend" || state.phase.kind === "strike";
  if (open && state.power >= 1 && input.struck.some((thrown) => POWER_MOVES.has(thrown.move))) {
    const spent = unleash(state, enemy);
    if (spent.state.phase.kind !== "defend" && spent.state.phase.kind !== "strike") return spent;
    const rest = step(spent.state, enemy, style, input, dtMs);
    return { state: rest.state, events: [...spent.events, ...rest.events] };
  }
  const phase = state.phase;
  switch (phase.kind) {
    case "won":
    case "lost":
      return { state, events: [] };
    case "finisher": {
      const strike = input.struck.find((thrown) => thrown.move === phase.move);
      if (strike) {
        return {
          state: { ...learned(state, phase.move), phase: { kind: "won" } },
          events: [{ type: "finished", move: phase.move }, { type: "won" }],
        };
      }
      const msLeft = phase.msLeft - dtMs;
      if (msLeft > 0) return { state: { ...state, phase: { ...phase, msLeft } }, events: [] };
      // The monster is down and the player cannot lose here: offer the finishing move again.
      return { state: { ...state, phase: { ...phase, msLeft: phase.totalMs } }, events: [{ type: "whiffed" }] };
    }
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
        const blocked = fill({ ...learned(state, attack.counter), score: state.score + 50 }, POWER_PER_DEFEND);
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
        const landedBy = input.struck.filter((thrown) => thrown.move === phase.move);
        const quality = Math.min(1, Math.max(0, ...landedBy.map((thrown) => thrown.quality)));
        const together =
          state.players === 2 && landedBy.some((t) => t.player === 0) && landedBy.some((t) => t.player === 1);
        const damage = Math.round(
          STRIKE_DAMAGE * (1 + Math.min(state.combo, 5) * 0.1) * (0.5 + quality) * (together ? 2 : 1),
        );
        const enemyHp = Math.max(0, state.enemyHp - damage);
        const landed: CombatEvent = { type: "enemyHit", move: phase.move, damage, quality };
        const phaseIndex = phaseIndexFor(enemy, enemyHp);
        const next = {
          ...fill(learned(state, phase.move), quality >= GREAT_QUALITY ? POWER_PER_GREAT : 0),
          enemyHp,
          phaseIndex,
          combo: state.combo + 1,
          score: state.score + damage * 10,
        };
        const events: CombatEvent[] = [landed];
        const changed = enemy.phases?.[phaseIndex];
        if (phaseIndex !== state.phaseIndex && changed) {
          events.push({ type: "phaseChanged", index: phaseIndex, name: changed.name });
        }
        if (enemyHp === 0) {
          if (enemy.finisher) {
            const finisher = { kind: "finisher", move: enemy.finisher, msLeft: FINISHER_MS, totalMs: FINISHER_MS } as const;
            return { state: { ...next, phase: finisher }, events };
          }
          return { state: { ...next, phase: { kind: "won" } }, events: [...events, { type: "won" }] };
        }
        return { state: { ...next, phase: RECOVER }, events };
      }
      const msLeft = phase.msLeft - dtMs;
      if (msLeft > 0) return { state: { ...state, phase: { ...phase, msLeft } }, events: [] };
      return { state: { ...state, combo: 0, phase: RECOVER }, events: [{ type: "whiffed" }] };
    }
  }
}
