// A made-up player who fights every stop, for measuring how long the fights take and who wins them.
// Pure: it only calls `startFight` and `step`. Same method as `play` in tests/pacingStops.test.ts, except that
// the chance of defending and the chance of landing a strike are set apart, so a player can be bad at one only.
import { startFight, step } from "../../src/combat/engine";
import type { EnemySpec, FightingStyle, Strike } from "../../src/core/types";

export interface Player {
  readonly id: string;
  /** Who this stands for, for the table. */
  readonly label: string;
  /** Share of the monster's attacks the player defends. */
  readonly defend: number;
  /** Share of openings (and finishing-move offers) the player lands the asked strike in. */
  readonly land: number;
  /** How long after the opening appears the strike arrives. */
  readonly reactMs: number;
  /** How well each strike is thrown, 0 to 1. Damage follows it. */
  readonly quality: number;
}

/** The three players issue #115 asks for. */
export const PLAYERS: readonly Player[] = [
  { id: "beginner", label: "defends 1 in 2, strikes late and rough", defend: 0.5, land: 0.9, reactMs: 1500, quality: 0.55 },
  { id: "average", label: "defends 3 in 4, strikes cleanly", defend: 0.75, land: 0.9, reactMs: 800, quality: 0.7 },
  { id: "good", label: "defends nearly all, strikes fast and well", defend: 0.95, land: 0.97, reactMs: 600, quality: 0.9 },
];

export interface Fight {
  readonly seconds: number;
  readonly won: boolean;
  /** Health the player has left at the end, out of 100. */
  readonly hpLeft: number;
}

const STEP_MS = 20;
const CAP_MS = 600_000;

/** Plays one whole fight. The same enemy, style, player and seed always give the same fight. */
export function playFight(enemy: EnemySpec, style: FightingStyle, player: Player, seed: number): Fight {
  let chance = seed;
  const lucky = (share: number): boolean => {
    chance = (Math.imul(chance, 1103515245) + 12345) >>> 0;
    return chance / 4294967296 < share;
  };
  let state = startFight(enemy, seed);
  let ms = 0;
  let seen = { kind: "", seed: 0, playerHp: 0, enemyHp: 0, tries: 0 };
  let good = false;
  let strikeAt = 0;
  // The finishing move is offered again each time its window runs out, and each offer is a new try.
  let finisherTries = 0;
  let finisherLeft = 0;
  while (state.phase.kind !== "won" && state.phase.kind !== "lost" && ms < CAP_MS) {
    const phase = state.phase;
    if (phase.kind === "finisher") {
      if (phase.msLeft > finisherLeft) finisherTries += 1;
      finisherLeft = phase.msLeft;
    }
    // A new prompt (a new attack, opening or finishing-move offer) is a new roll of the dice.
    const fresh =
      phase.kind !== seen.kind ||
      state.seed !== seen.seed ||
      state.playerHp !== seen.playerHp ||
      state.enemyHp !== seen.enemyHp ||
      finisherTries !== seen.tries;
    if (fresh) {
      seen = { kind: phase.kind, seed: state.seed, playerHp: state.playerHp, enemyHp: state.enemyHp, tries: finisherTries };
      good = lucky(phase.kind === "defend" ? player.defend : player.land);
      strikeAt = ms + player.reactMs;
    }
    const held = new Set<string>();
    const struck: Strike[] = [];
    if (phase.kind === "defend" && good) held.add(phase.attack.counter);
    if ((phase.kind === "strike" || phase.kind === "finisher") && good && ms >= strikeAt) {
      struck.push({ move: phase.move, quality: player.quality, player: 0 });
    }
    state = step(state, enemy, style, { held, struck }, STEP_MS).state;
    ms += STEP_MS;
  }
  return { seconds: ms / 1000, won: state.phase.kind === "won", hpLeft: Math.max(0, state.playerHp) };
}

export interface Row {
  readonly stop: string;
  readonly player: string;
  /** Fights won, out of `fights`. */
  readonly wins: number;
  readonly fights: number;
  /** Mean length of all the fights, won or lost. */
  readonly seconds: number;
  /** Mean length of the fights that were won; 0 if none were. */
  readonly winSeconds: number;
  readonly longest: number;
  /** Mean health left at the end, out of 100. */
  readonly hpLeft: number;
}

export const FIGHTS = 200;
export const SEED = 115;

/** One player's `fights` fights at one stop. Fight n uses the same seed for every stop and player. */
export function measure(enemy: EnemySpec, style: FightingStyle, player: Player, fights = FIGHTS, seed = SEED): Row {
  const played = Array.from({ length: fights }, (_, index) => playFight(enemy, style, player, seed + index * 7919));
  const mean = (list: readonly Fight[], pick: (fight: Fight) => number): number =>
    list.length === 0 ? 0 : list.reduce((sum, fight) => sum + pick(fight), 0) / list.length;
  const won = played.filter((fight) => fight.won);
  return {
    stop: enemy.id,
    player: player.id,
    wins: won.length,
    fights,
    seconds: mean(played, (fight) => fight.seconds),
    winSeconds: mean(won, (fight) => fight.seconds),
    longest: Math.max(...played.map((fight) => fight.seconds)),
    hpLeft: mean(played, (fight) => fight.hpLeft),
  };
}

/** Every stop for every player, in route order. */
export function measureRoute(enemies: readonly EnemySpec[], style: FightingStyle, players: readonly Player[] = PLAYERS): Row[] {
  return enemies.flatMap((enemy) => players.map((player) => measure(enemy, style, player)));
}

/** The table in docs/balance.md, one line per stop. Each cell: fights won / mean length of all fights / mean length of the won ones. */
export function table(enemies: readonly EnemySpec[], rows: readonly Row[], players: readonly Player[] = PLAYERS): string {
  const cell = (row: Row | undefined): string => {
    if (!row) return "";
    const won = row.wins === 0 ? "none won" : `${row.winSeconds.toFixed(0)} s when won`;
    return `${String(Math.round((100 * row.wins) / row.fights))}% / ${row.seconds.toFixed(0)} s / ${won}`;
  };
  const head = `| Stop | ${players.map((player) => player.id).join(" | ")} |`;
  const rule = `| --- | ${players.map(() => "---").join(" | ")} |`;
  const lines = enemies.map((enemy) => {
    const cells = players.map((player) => cell(rows.find((row) => row.stop === enemy.id && row.player === player.id)));
    return `| ${enemy.name} | ${cells.join(" | ")} |`;
  });
  return [head, rule, ...lines].join("\n");
}
