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
export const EPIC_SCORE_GOAL = 4000;
export const COMBO_GOAL = 10;
export const BLOCKS_GOAL = 25;
export const DODGES_GOAL = 25;
export const POWERS_GOAL = 10;
export const FIGHTS_GOAL = 10;
/** The number of fighting styles in the game (tests/account.test.ts holds it to the style registry). */
export const STYLES_GOAL = 5;

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
    { id: "ages", name: "Song for the ages", how: `Score ${String(EPIC_SCORE_GOAL)} in one fight.`, done: profile.bestScore >= EPIC_SCORE_GOAL, progress: bar(profile.bestScore, EPIC_SCORE_GOAL, "points") },
    { id: "favoured", name: "Favoured by the gods", how: "Use a god power in a fight.", done: profile.powers > 0, progress: null },
    { id: "olympus", name: "Hand of Olympus", how: `Use god powers ${String(POWERS_GOAL)} times.`, done: profile.powers >= POWERS_GOAL, progress: bar(profile.powers, POWERS_GOAL, "powers") },
    { id: "unbroken", name: "Unbroken", how: "Win a fight without being hit.", done: profile.unhit > 0, progress: null },
    { id: "chain", name: "Chain of blows", how: `Reach a ${String(COMBO_GOAL)} combo.`, done: profile.bestCombo >= COMBO_GOAL, progress: bar(profile.bestCombo, COMBO_GOAL, "combo") },
    { id: "shield_wall", name: "Shield wall", how: `Block ${String(BLOCKS_GOAL)} blows.`, done: profile.blocks >= BLOCKS_GOAL, progress: bar(profile.blocks, BLOCKS_GOAL, "blocks") },
    { id: "light_footed", name: "Light-footed", how: `Dodge ${String(DODGES_GOAL)} blows.`, done: profile.dodges >= DODGES_GOAL, progress: bar(profile.dodges, DODGES_GOAL, "dodges") },
    { id: "many_ways", name: "Man of many ways", how: "Win a fight with each fighting style.", done: profile.styles.length >= STYLES_GOAL, progress: bar(profile.styles.length, STYLES_GOAL, "styles") },
    { id: "veteran", name: "Veteran of Troy", how: `Fight ${String(FIGHTS_GOAL)} fights.`, done: profile.fights >= FIGHTS_GOAL, progress: bar(profile.fights, FIGHTS_GOAL, "fights") },
    { id: "pupil", name: "Dojo pupil", how: "Finish a Training Dojo session.", done: profile.dojo > 0, progress: null },
    { id: "pride", name: "Athena's pride", how: "Get Excellent on every try of one move in the Training Dojo.", done: profile.dojoPerfect > 0, progress: null },
    { id: "shoulder", name: "Shoulder to shoulder", how: "Play a fight in a Multiplayer room.", done: profile.rooms > 0, progress: null },
  ];
}
