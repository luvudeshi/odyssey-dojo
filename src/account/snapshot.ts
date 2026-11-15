// The save, made from this browser's three stores (profile, settings, character), and put back into them.
// Putting back goes through each store's own checks, so a bad save can never leave a store in a bad state.
import { isCharacterId } from "../characters/characters";
import type { CharacterId } from "../characters/characters";
import { DEFAULT_SETTINGS, parseSettings } from "../settings/store";
import type { Settings } from "../settings/store";
import type { Save } from "./contracts";
import { parseProfile } from "./store";
import type { Profile } from "./store";

/** The parts of the three stores the account uses. The real ones are wired in ./sync; tests pass their own. */
export interface LocalStores {
  readonly profile: { get(): Profile; replace(profile: unknown): void; subscribe(listener: () => void): () => void };
  readonly settings: { get(): Settings; set(patch: Partial<Settings>): void; subscribe(listener: () => void): () => void };
  readonly character: { get(): CharacterId; set(id: string): void; subscribe(listener: () => void): () => void };
  /** Ids of the achievements done so far. They are worked out from the profile, so they are sent but never read back. */
  readonly earned: () => readonly string[];
}

export function snapshot(stores: LocalStores): Save {
  const profile = stores.profile.get();
  const earned = stores.earned();
  return {
    version: 1,
    profile: { name: profile.name, cleared: [...profile.cleared], moves: { ...profile.moves }, bestScore: profile.bestScore, fights: profile.fights, wins: profile.wins },
    settings: { ...stores.settings.get() },
    character: stores.character.get(),
    ...(earned.length > 0 ? { achievements: [...earned] } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The settings in a save that are of the right kind. A wrong or missing one is left out, so the browser keeps its own. */
export function settingsPatch(raw: unknown): Partial<Settings> {
  if (!isRecord(raw)) return {};
  const checked = parseSettings(JSON.stringify(raw));
  const keys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];
  const good = keys.filter((key) => typeof raw[key] === typeof DEFAULT_SETTINGS[key] && (key !== "quality" || raw[key] === checked.quality));
  return Object.fromEntries(good.map((key) => [key, checked[key]])) as Partial<Settings>;
}

/** The character id in a save: the id itself, or the `id` of an object. Null when it names no character we know. */
export function characterIn(raw: unknown): CharacterId | null {
  const id = isRecord(raw) ? raw.id : raw;
  return isCharacterId(id) ? id : null;
}

/** Puts a save into the three stores. Every part is checked by its own store; a part that is wrong changes nothing, and nothing throws. */
export function applySave(stores: LocalStores, save: Save): void {
  // Looked at as unknown: the type says what a save should be, not what arrived.
  const raw: unknown = save;
  if (!isRecord(raw) || raw.version !== 1) return;
  if (isRecord(raw.profile)) stores.profile.replace(raw.profile);
  const patch = settingsPatch(raw.settings);
  if (Object.keys(patch).length > 0) stores.settings.set(patch);
  const character = characterIn(raw.character);
  if (character && character !== stores.character.get()) stores.character.set(character);
}

/**
 * What the server gave back as the account's save, in the shape of a Save. Null: the account has no save yet.
 * "unreadable": not a save this version knows, so it must not be merged with or written over.
 */
export function readSave(raw: unknown): Save | null | "unreadable" {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.profile)) return "unreadable";
  const profile = parseProfile(JSON.stringify(raw.profile));
  const character = raw.character;
  const achievements = Array.isArray(raw.achievements) ? raw.achievements.filter((id): id is string => typeof id === "string") : [];
  return {
    version: 1,
    profile: { name: profile.name, cleared: [...profile.cleared], moves: { ...profile.moves }, bestScore: profile.bestScore, fights: profile.fights, wins: profile.wins },
    settings: settingsPatch(raw.settings),
    character: typeof character === "string" ? character : characterIn(character),
    ...(achievements.length > 0 ? { achievements } : {}),
  };
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
}

/** True when two saves hold the same things, whatever order their keys and lists are in. */
export function sameSave(a: Save, b: Save): boolean {
  const flat = (save: Save): string => JSON.stringify(sorted({ ...save, profile: { ...save.profile, cleared: [...save.profile.cleared].sort() }, achievements: [...(save.achievements ?? [])].sort() }));
  return flat(a) === flat(b);
}
