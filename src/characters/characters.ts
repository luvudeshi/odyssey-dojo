// The five characters a player can look like. A character is a look (gear and colours on the one rigged body);
// a fighting style is a move set (src/styles). Any character can fight in any style. Pure data, no three.js.

export type CharacterId = "odysseus" | "poseidon" | "zeus" | "athena" | "achilles";

/** Every code-built piece a character can wear. Each has an entry in gear/registry.tsx (tests/characters.test.ts checks). */
export type GearId =
  | "corinthian_helmet" | "bronze_cuirass" | "crimson_cape" | "chiton" | "greaves" | "back_shield"
  | "hair" | "short_beard" | "long_beard" | "trident_crown" | "laurel_wreath"
  | "athena_helmet" | "achilles_helmet"
  | "plain_cuirass" | "dark_cuirass" | "scale_cuirass" | "tunic" | "aegis" | "himation" | "short_cloak"
  | "kilt" | "long_kilt" | "plain_greaves"
  | "slung_trident" | "thunderbolt" | "owl_shield" | "round_shield" | "sword";

/** Colours as #rrggbb. */
export interface Palette {
  /** Armour and anything forged. */
  readonly metal: string;
  /** Trim, rims and the darker plates. */
  readonly metalDark: string;
  /** Cloak, kilt and crest. */
  readonly cloth: string;
  /** The one colour that marks the character: crown, bolt, gorgon, crest. */
  readonly accent: string;
  /** Hair and beard, for the bare-headed. */
  readonly hair?: string;
}

export interface Character {
  readonly id: CharacterId;
  readonly name: string;
  /** Who they are, in at most 70 characters. */
  readonly line: string;
  readonly palette: Palette;
  readonly gear: readonly GearId[];
}

export const DEFAULT_CHARACTER: CharacterId = "odysseus";

export const CHARACTERS: readonly Character[] = [
  {
    id: "odysseus",
    name: "Odysseus",
    line: "King of Ithaca, ten years sailing home from Troy.",
    palette: { metal: "#b98a3e", metalDark: "#7d5a26", cloth: "#a5252f", accent: "#4a2f1d" },
    gear: ["corinthian_helmet", "bronze_cuirass", "crimson_cape", "chiton", "greaves", "back_shield"],
  },
  {
    id: "poseidon",
    name: "Poseidon",
    line: "Earth-shaker, lord of the grey sea, with his trident.",
    palette: { metal: "#2f9a9a", metalDark: "#1b5d73", cloth: "#1f5fa8", accent: "#3fd0e0", hair: "#dcefe9" },
    gear: ["hair", "short_beard", "trident_crown", "scale_cuirass", "kilt", "slung_trident"],
  },
  {
    id: "zeus",
    name: "Zeus",
    line: "Lord of the sky, who delights in the thunderbolt.",
    palette: { metal: "#e3a72a", metalDark: "#a8842c", cloth: "#f3efe4", accent: "#ffe45c", hair: "#f4f4ef" },
    gear: ["hair", "long_beard", "laurel_wreath", "tunic", "himation", "long_kilt", "thunderbolt"],
  },
  {
    id: "athena",
    name: "Athena",
    line: "Grey-eyed goddess of war and craft, the hero's guide.",
    palette: { metal: "#b9c1c9", metalDark: "#77818b", cloth: "#7d8a45", accent: "#e2b84a" },
    gear: ["athena_helmet", "plain_cuirass", "aegis", "long_kilt", "plain_greaves", "owl_shield"],
  },
  {
    id: "achilles",
    name: "Achilles",
    line: "Best of the Greeks at Troy, swift-footed and proud.",
    palette: { metal: "#dba640", metalDark: "#1c1a1d", cloth: "#b3202a", accent: "#121114" },
    gear: ["achilles_helmet", "dark_cuirass", "short_cloak", "kilt", "plain_greaves", "round_shield", "sword"],
  },
];

const BY_ID: ReadonlyMap<string, Character> = new Map(CHARACTERS.map((c) => [c.id, c]));

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && BY_ID.has(value);
}

/** The character with that id; anything unknown gives the default (Odysseus). */
export function characterById(id: string | null | undefined): Character {
  const found = (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_CHARACTER);
  if (!found) throw new Error("the default character is missing from CHARACTERS");
  return found;
}

export const CHARACTER_KEY = "odyssey-dojo.character";

/** The part of localStorage used, so a test can pass a stand-in (the same shape src/settings/store.ts uses). */
export interface CharacterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): CharacterStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The stored choice. No storage, a private window that throws, or an id we do not know: the default. */
export function loadCharacter(storage: CharacterStorage | null = browserStorage()): CharacterId {
  try {
    const raw = storage?.getItem(CHARACTER_KEY);
    return isCharacterId(raw) ? raw : DEFAULT_CHARACTER;
  } catch {
    return DEFAULT_CHARACTER;
  }
}

/** Stores the choice and returns what was stored. An unknown id stores the default. A storage that throws is ignored. */
export function saveCharacter(id: string, storage: CharacterStorage | null = browserStorage()): CharacterId {
  const safe = characterById(id).id;
  try {
    storage?.setItem(CHARACTER_KEY, safe);
  } catch {
    // A full or blocked storage only means the choice is not remembered next time.
  }
  return safe;
}
