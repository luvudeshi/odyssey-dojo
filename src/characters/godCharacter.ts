// The god scan picks the player's character: each god the scan can name stands for one of the five.
// A choice the player made by hand in the picker wins over the scan, now and in later sessions.
// Pure data and localStorage only, no three.js and no React.
import { GODS, GOD_IDS } from "../ai/gods/gods";
import type { GodId } from "../ai/gods/gods";
import { DEFAULT_CHARACTER, characterById, loadCharacter, saveCharacter } from "./characters";
import type { CharacterId, CharacterStorage } from "./characters";

/** One character for every god in GOD_IDS. Three gods are characters themselves; the other three lend theirs. */
export const GOD_CHARACTER: Readonly<Record<GodId, CharacterId>> = {
  zeus: "zeus", // He is one of the five.
  poseidon: "poseidon", // He is one of the five.
  athena: "athena", // She is one of the five.
  hermes: "odysseus", // The god of wit and travellers, who hands Odysseus the herb moly on Circe's island.
  apollo: "odysseus", // The archer god: Odysseus strings the great bow on Apollo's feast day and prays to him for the shot.
  artemis: "achilles", // The swift huntress who never yields, for the swift-footed fighter who never does either.
};

function isGodId(value: unknown): value is GodId {
  return typeof value === "string" && (GOD_IDS as readonly string[]).includes(value);
}

/** The character that god stands for. No god (a skipped scan) or an id we do not know gives the default, Odysseus. */
export function characterForGod(godId: string | null | undefined): CharacterId {
  return isGodId(godId) ? GOD_CHARACTER[godId] : DEFAULT_CHARACTER;
}

/**
 * The line under the reveal, e.g. "Zeus chose you. You fight as Zeus."
 * `kept` is the character the player picked by hand, if any (see handPicked): the scan does not change it, so the
 * line says so. No god or an unknown id gives "".
 */
export function characterLineForGod(godId: string | null | undefined, kept: CharacterId | null = null): string {
  if (!isGodId(godId)) return "";
  const god = GODS[godId].name;
  const given = characterForGod(godId);
  if (kept !== null && kept !== given) return `${god} chose you. You still fight as ${characterById(kept).name}, your own pick.`;
  return `${god} chose you. You fight as ${characterById(given).name}.`;
}

/** Holds "hand" once the player has chosen a character in the picker. Absent, or anything else: the scan may choose. */
export const CHARACTER_SOURCE_KEY = "odyssey-dojo.character.source";

function browserStorage(): CharacterStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The character the player picked by hand, or null when they never did (or storage is missing or throws). */
export function handPicked(storage: CharacterStorage | null = browserStorage()): CharacterId | null {
  try {
    return storage?.getItem(CHARACTER_SOURCE_KEY) === "hand" ? loadCharacter(storage) : null;
  } catch {
    return null;
  }
}

/** The player chose this character themselves: store it and remember that the scan must not change it. */
export function pickCharacter(id: string, storage: CharacterStorage | null = browserStorage()): CharacterId {
  const saved = saveCharacter(id, storage);
  try {
    storage?.setItem(CHARACTER_SOURCE_KEY, "hand");
  } catch {
    // A full or blocked storage only means the next scan may choose again.
  }
  return saved;
}

/**
 * The picker's "Fight as ..." button. Confirming the character already stored (the scan's, or the default) is not
 * a pick by hand, so the next scan may still choose; confirming any other one is.
 */
export function confirmCharacter(id: string, storage: CharacterStorage | null = browserStorage()): CharacterId {
  const wanted = characterById(id).id;
  return wanted === loadCharacter(storage) ? wanted : pickCharacter(wanted, storage);
}
