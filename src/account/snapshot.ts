// The save, made from this browser's three stores (profile, settings, character), and put back into them.
// Putting back goes through each store's own checks, so a bad save can never leave a store in a bad state.
import { isCharacterId } from "../characters/characters";
import type { CharacterId } from "../characters/characters";
import { parseSettings } from "../settings/store";
import type { Settings } from "../settings/store";
import { SaveSchema } from "./contracts";
import type { Save } from "./contracts";
import { EMPTY_PROFILE, parseProfile } from "./store";
import type { Profile } from "./store";

/** The parts of the three stores the account uses. The real ones are wired in ./sync; tests pass their own. */
export interface LocalStores {
  readonly profile: { get(): Profile; replace(profile: unknown): void; subscribe(listener: () => void): () => void };
  readonly settings: { get(): Settings; set(patch: Partial<Settings>): void; subscribe(listener: () => void): () => void };
  readonly character: { get(): CharacterId; set(id: string): void; subscribe(listener: () => void): () => void };
  /** Ids of the achievements done so far. They are worked out from the profile, so they are sent but never read back. */
  readonly earned: () => readonly string[];
}

/**
 * The settings that go with the player to another browser: how loud, and whether the key hints show.
 * The rest belong to the machine and stay on it: camera or keyboard, graphics quality, the mirror. A laptop with
 * a webcam must not start in keyboard mode, or in low quality, because another browser of the same player does.
 */
export const SYNCED_SETTINGS = ["musicVolume", "sfxVolume", "voiceVolume", "keyHints"] as const satisfies readonly (keyof Settings)[];
type SyncedSettings = Pick<Settings, (typeof SYNCED_SETTINGS)[number]>;

/** A copy that shares nothing with the store it came from. */
const copy = (value: object): Record<string, unknown> => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

function syncedOf(settings: Settings): SyncedSettings {
  return { musicVolume: settings.musicVolume, sfxVolume: settings.sfxVolume, voiceVolume: settings.voiceVolume, keyHints: settings.keyHints };
}

/** The whole profile, as it is: every field it has today and any it gets later. */
export function snapshot(stores: LocalStores): Save {
  const earned = stores.earned();
  return {
    version: 1,
    profile: copy(stores.profile.get()),
    settings: { ...syncedOf(stores.settings.get()) },
    character: stores.character.get(),
    ...(earned.length > 0 ? { achievements: [...earned] } : {}),
  };
}

/** What a browser nobody has played in counts as, with this browser's own settings and character: the start of another player's account. */
export function emptySnapshot(stores: LocalStores): Save {
  return { version: 1, profile: copy(EMPTY_PROFILE), settings: { ...syncedOf(stores.settings.get()) }, character: stores.character.get() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The synced settings in a save that are of the right kind. A wrong or missing one is left out, so the browser
 * keeps its own, and a setting that belongs to the machine is never taken from a save at all.
 */
export function settingsPatch(raw: unknown): Partial<Settings> {
  if (!isRecord(raw)) return {};
  const checked = parseSettings(JSON.stringify(raw));
  const right = (key: (typeof SYNCED_SETTINGS)[number]): boolean => {
    const value = raw[key];
    return key === "keyHints" ? typeof value === "boolean" : typeof value === "number" && Number.isFinite(value);
  };
  return Object.fromEntries(SYNCED_SETTINGS.filter(right).map((key) => [key, checked[key]])) as Partial<Settings>;
}

/** The character id in a save: the id itself, or the `id` of an object. Null when it names no character we know. */
export function characterIn(raw: unknown): CharacterId | null {
  const id = isRecord(raw) ? raw.id : raw;
  return isCharacterId(id) ? id : null;
}

/**
 * Puts a save into the three stores. Every part is checked by its own store; a part that is wrong changes nothing,
 * and nothing throws. A profile field the save does not hold stays as it is in this browser (see `replace` in ./store).
 */
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
 * "unreadable": not a save this version knows, or one past the bounds of a save, so it must not be merged with or
 * written over. The profile comes back through parseProfile and the settings through parseSettings.
 */
export function readSave(raw: unknown): Save | null | "unreadable" {
  if (raw === null || raw === undefined) return null;
  const checked = SaveSchema.safeParse(raw);
  if (!checked.success) return "unreadable";
  const character = checked.data.character;
  const achievements = checked.data.achievements ?? [];
  return {
    version: 1,
    profile: copy(parseProfile(JSON.stringify(checked.data.profile))),
    settings: settingsPatch(checked.data.settings),
    character: typeof character === "string" ? character : characterIn(character),
    ...(achievements.length > 0 ? { achievements } : {}),
  };
}

/** Keys in order, and lists in order too: a list of ids (cleared stops, styles, achievements) holds the same things in any order. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
}

/** True when two saves hold the same things, whatever order their keys and lists are in. */
export function sameSave(a: Save, b: Save): boolean {
  const flat = (save: Save): string => JSON.stringify(sorted({ ...save, achievements: save.achievements ?? [] }));
  return flat(a) === flat(b);
}
