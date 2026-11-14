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

/** The voice for a character, or null when this key has no voices at all. */
export function pickVoice(character: Character, voices: readonly Voice[], forced: string | undefined): Voice | null {
  const byId = voices.find((voice) => voice.id === forced);
  if (byId) return byId;
  for (const name of PREFERRED[character]) {
    const match = voices.find((voice) => voice.name.toLowerCase().startsWith(name.toLowerCase()));
    if (match) return match;
  }
  return voices[0] ?? null;
}

export function forcedVoice(character: Character): string | undefined {
  return process.env[`${character.toUpperCase()}_VOICE_ID`];
}
