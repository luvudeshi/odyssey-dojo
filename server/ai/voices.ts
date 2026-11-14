// Which ElevenLabs voice plays each character. Accounts differ in which voices they hold, so names are tried in order.
import type { Voice } from "./types";

export const CHARACTERS = ["athena", "homer", "monster"] as const;
export type Character = (typeof CHARACTERS)[number];

/** Voice names to try, best first. Set <CHARACTER>_VOICE_ID in .env (e.g. HOMER_VOICE_ID) to force one. */
const PREFERRED: Readonly<Record<Character, readonly string[]>> = {
  // A clear, commanding woman.
  athena: ["Sarah", "Matilda", "Alice", "Charlotte", "Lily", "Rachel", "Jessica", "Laura"],
  // An older, warm storyteller.
  homer: ["George", "Bill", "Eldrin", "Wyatt", "Daniel", "Brian"],
  // Deep and menacing.
  monster: ["Callum", "Harry", "Brian", "Sawyer", "Clyde", "Adam"],
};

/**
 * Voice names for each monster's recorded taunts, best first, so every stop of the quest sounds like someone else.
 * Polyphemus is not here: he speaks with the "monster" voice above. Set <ENEMY>_VOICE_ID (e.g. CIRCE_VOICE_ID) to force one.
 */
const MONSTERS: Readonly<Record<string, readonly string[]>> = {
  // A woman, smooth and sure of herself.
  circe: ["Lily", "Matilda", "Alice"],
  // A woman, bright and inviting.
  sirens: ["Jessica", "Bella", "Laura"],
  // Low and rough.
  scylla: ["Harry", "Charlie", "Adam"],
  // Low and slow.
  charybdis: ["Brian", "Adam", "Charlie"],
  // A young man.
  suitors: ["Liam", "Will", "Chris", "Eric"],
};

function byName(names: readonly string[], voices: readonly Voice[], forced: string | undefined): Voice | null {
  const byId = voices.find((voice) => voice.id === forced);
  if (byId) return byId;
  for (const name of names) {
    const match = voices.find((voice) => voice.name.toLowerCase().startsWith(name.toLowerCase()));
    if (match) return match;
  }
  return voices[0] ?? null;
}

/** The voice for a character, or null when this key has no voices at all. */
export function pickVoice(character: Character, voices: readonly Voice[], forced: string | undefined): Voice | null {
  return byName(PREFERRED[character], voices, forced);
}

/** The names tried for one monster. A monster with no list of its own speaks with the "monster" voice. */
function monsterNames(enemyId: string): readonly string[] | undefined {
  return Object.hasOwn(MONSTERS, enemyId) ? MONSTERS[enemyId] : undefined;
}

/** The voice for one monster's taunts, or null when this key has no voices at all. */
export function pickMonsterVoice(enemyId: string, voices: readonly Voice[], forced: string | undefined): Voice | null {
  return byName(monsterNames(enemyId) ?? PREFERRED.monster, voices, forced);
}

/** `character` is one of CHARACTERS or an enemy id: "circe" reads CIRCE_VOICE_ID. */
export function forcedVoice(character: string): string | undefined {
  return process.env[`${character.toUpperCase()}_VOICE_ID`];
}

/** The forced voice for one monster's taunts. Polyphemus and unlisted monsters read MONSTER_VOICE_ID. */
export function forcedMonsterVoice(enemyId: string): string | undefined {
  return forcedVoice(monsterNames(enemyId) === undefined ? "monster" : enemyId);
}
