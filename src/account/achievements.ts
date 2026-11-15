// The achievements on the Account screen, worked out from the saved profile. Nothing here is stored.
import type { EnemySpec } from "../core/types";
import type { Profile } from "./store";

export interface Achievement {
  readonly id: string;
  readonly name: string;
  readonly how: string;
  readonly done: boolean;
  /** For the ones that count something: how far along, capped at the goal. Null for a plain yes or no. */
  readonly progress: { readonly have: number; readonly goal: number; readonly unit: string } | null;
}

export const SCORE_GOAL = 2000;
export const MOVES_GOAL = 5;

export function achievements(profile: Profile, enemies: readonly EnemySpec[]): readonly Achievement[] {
  const landed = Object.values(profile.moves);
  const different = landed.filter((times) => times > 0).length;
  const stops = enemies.filter((enemy) => profile.cleared.includes(enemy.id)).length;
  const bar = (have: number, goal: number, unit: string): Achievement["progress"] => ({ have: Math.min(have, goal), goal, unit });
  return [
    { id: "first_win", name: "First blood", how: "Win a fight.", done: profile.wins > 0, progress: null },
    ...enemies.map((enemy) => ({ id: `beat_${enemy.id}`, name: `Beat ${enemy.name}`, how: enemy.place ?? "A stop on the road home.", done: profile.cleared.includes(enemy.id), progress: null })),
    { id: "home", name: "Home to Ithaca", how: "Beat every stop on the road home.", done: enemies.length > 0 && stops === enemies.length, progress: enemies.length > 0 ? bar(stops, enemies.length, "stops") : null },
    { id: "student", name: "Student of Athena", how: `Land ${String(MOVES_GOAL)} different moves.`, done: different >= MOVES_GOAL, progress: bar(different, MOVES_GOAL, "moves") },
    { id: "second_nature", name: "Second nature", how: `Land one move ${String(MOVES_GOAL)} times.`, done: landed.some((times) => times >= MOVES_GOAL), progress: bar(Math.max(0, ...landed), MOVES_GOAL, "lands") },
    { id: "song", name: "Worth a song", how: `Score ${String(SCORE_GOAL)} in one fight.`, done: profile.bestScore >= SCORE_GOAL, progress: bar(profile.bestScore, SCORE_GOAL, "points") },
  ];
}
