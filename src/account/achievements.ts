// The achievements on the Account screen, worked out from the saved profile. Nothing here is stored.
import type { EnemySpec } from "../core/types";
import type { Profile } from "./store";

export interface Achievement {
  readonly id: string;
  readonly name: string;
  readonly how: string;
  readonly done: boolean;
}

export const SCORE_GOAL = 2000;
export const MOVES_GOAL = 5;

export function achievements(profile: Profile, enemies: readonly EnemySpec[]): readonly Achievement[] {
  const landed = Object.values(profile.moves);
  return [
    { id: "first_win", name: "First blood", how: "Win a fight.", done: profile.wins > 0 },
    ...enemies.map((enemy) => ({ id: `beat_${enemy.id}`, name: `Beat ${enemy.name}`, how: enemy.place ?? "A stop on the road home.", done: profile.cleared.includes(enemy.id) })),
    { id: "home", name: "Home to Ithaca", how: "Beat every stop on the road home.", done: enemies.length > 0 && enemies.every((enemy) => profile.cleared.includes(enemy.id)) },
    { id: "student", name: "Student of Athena", how: `Land ${String(MOVES_GOAL)} different moves.`, done: landed.filter((times) => times > 0).length >= MOVES_GOAL },
    { id: "second_nature", name: "Second nature", how: `Land one move ${String(MOVES_GOAL)} times.`, done: landed.some((times) => times >= MOVES_GOAL) },
    { id: "song", name: "Worth a song", how: `Score ${String(SCORE_GOAL)} in one fight.`, done: profile.bestScore >= SCORE_GOAL },
  ];
}
