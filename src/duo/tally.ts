// Two players on one camera: what each player did in the fight, so both can see that both are counted.
// The fight itself keeps one score. This splits it by who earned it, without changing a rule: the two numbers
// always add up to the fight's score.
//   - A landed strike's points go to whoever threw it. Thrown by both ("Together!"), each gets half.
//   - A defend's points are shared when both had to make it; with one player they are player one's.
//   - The god's power goes to whoever made its gesture: player two alone, both (half each), or else player one.
// Pure, apart from the small store at the foot that the link writes and the HUD's line reads.
import { POWER_MOVES } from "../combat/engine";
import type { CombatEvent, Strike } from "../core/types";

export interface PlayerTally {
  /** Strikes of this player that landed on the monster, the doubled ones included. */
  readonly hits: number;
  /** This player's share of the fight's score. */
  readonly points: number;
}

export interface DuoTally {
  /** Player one (the hero, left of the picture) and player two (the blue hero, right). */
  readonly players: readonly [PlayerTally, PlayerTally];
  /** Hits the two landed together, each of them doubled. */
  readonly together: number;
}

export const NO_TALLY: DuoTally = { players: [{ hits: 0, points: 0 }, { hits: 0, points: 0 }], together: 0 };

/** One frame of the fight, as the link sees it. */
export interface TallyFrame {
  readonly events: readonly CombatEvent[];
  /** How much the fight's score rose on this frame. */
  readonly gained: number;
  /** The strikes handed to the fight on this frame, each with its player; null when player one fought alone. */
  readonly struck: readonly Strike[] | null;
  /** True when a defend on this frame had to be made by both players. */
  readonly bothDefend: boolean;
}

/** The tally after one more frame. Gives back the same object when the frame changed nothing. */
export function tallyAfter(tally: DuoTally, frame: TallyFrame): DuoTally {
  const hit = frame.events.find((event) => event.type === "enemyHit");
  const gained = Math.max(0, frame.gained);
  if (!hit && gained === 0) return tally;
  const threw = (player: 0 | 1): boolean => (frame.struck ?? []).some((strike) => strike.move === hit?.move && strike.player === player);
  // A hit with no strike of player two's in it is player one's: so is every hit of a fight player two is not in.
  const second = hit !== undefined && threw(1);
  const first = hit !== undefined && (threw(0) || !second);
  // The god's power lands with no enemyHit: it is whoever's strikes held the power's gesture on this frame.
  const power = !hit && frame.events.some((event) => event.type === "powerUnleashed");
  const gestured = (player: 0 | 1): boolean => (frame.struck ?? []).some((strike) => POWER_MOVES.has(strike.move) && strike.player === player);
  const powerSecond = power && gestured(1);
  const powerFirst = power && (gestured(0) || !powerSecond);
  const shared = hit ? first && second : power ? powerFirst && powerSecond : frame.bothDefend && frame.events.some((event) => event.type === "defended");
  const toFirst = shared ? Math.ceil(gained / 2) : second || (powerSecond && !powerFirst) ? 0 : gained;
  const [one, two] = tally.players;
  return {
    players: [
      { hits: one.hits + (first ? 1 : 0), points: one.points + toFirst },
      { hits: two.hits + (second ? 1 : 0), points: two.points + gained - toFirst },
    ],
    together: tally.together + (first && second ? 1 : 0),
  };
}

/** Whether player two is in the fight, standing in the picture but not in yet, or not in the picture. */
export type SecondState = "in" | "joining" | "out";

const part = (name: string, player: PlayerTally): string => `${name} ${String(player.hits)} ${player.hits === 1 ? "hit" : "hits"} ${String(player.points)}`;

/**
 * Player two's half of the HUD's line. Their numbers while they are in, and for the rest of the fight once they have
 * any. Before that it says what the camera makes of them, so two people who see no second player know why.
 */
export function secondPart(tally: DuoTally, second: SecondState): string {
  const two = tally.players[1];
  if (second === "in") return part("P2", two);
  if (two.hits > 0 || two.points > 0) return `${part("P2", two)}, not seen`;
  return second === "joining" ? "P2 joining" : "P2 not seen: step apart";
}

/** Player one's half of the line. */
export function firstPart(tally: DuoTally): string {
  return part("P1", tally.players[0]);
}

/** The one line both players read during the fight, for example "P1 3 hits 420 · P2 2 hits 310". */
export function tallyLine(tally: DuoTally, second: SecondState): string {
  return `${firstPart(tally)} · ${secondPart(tally, second)}`;
}

export interface TallyStore {
  get(): DuoTally;
  set(next: DuoTally): void;
  /** Calls `listener` after every change; returns the way to stop. */
  subscribe(listener: () => void): () => void;
}

export function createTallyStore(): TallyStore {
  let tally = NO_TALLY;
  const listeners = new Set<() => void>();
  return {
    get: () => tally,
    set(next) {
      if (next === tally) return;
      tally = next;
      listeners.forEach((listen) => { listen(); });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** The page's one tally, as it has one camera: started again by every duo fight, and kept after the fight ends. */
export const duoTally = createTallyStore();
