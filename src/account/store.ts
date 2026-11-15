// The player's profile: a hero name and what they have done so far, kept in this browser's localStorage.
// There is no server and no password: "signing in" is typing a name. Every field read back is checked.
import { useSyncExternalStore } from "react";
import { log } from "../core/log";
import { browserStorage } from "../settings/store";
import type { SettingsStorage } from "../settings/store";

export interface Profile {
  readonly name: string;
  /** Ids of the stops beaten at least once. */
  readonly cleared: readonly string[];
  /** How many times each move has counted, over every fight. */
  readonly moves: Readonly<Record<string, number>>;
  readonly bestScore: number;
  readonly fights: number;
  readonly wins: number;
}

export interface FightResult {
  readonly enemyId: string;
  readonly won: boolean;
  readonly score: number;
  readonly mastery: Readonly<Record<string, number>>;
}

export const PROFILE_KEY = "odyssey-fighter.profile";
export const NAME_MAX = 20;
export const EMPTY_PROFILE: Profile = { name: "", cleared: [], moves: {}, bestScore: 0, fights: 0, wins: 0 };

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/** A typed name with control characters dropped, cut to NAME_MAX. Spaces are kept so a name can be typed word by word. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return [...raw].filter((ch) => ch >= " " && ch !== "\u007f").join("").slice(0, NAME_MAX);
}

/** Reads stored JSON of any shape: every field that is missing or wrong falls back to empty. */
export function parseProfile(raw: unknown): Profile {
  let data: Readonly<Record<string, unknown>> = {};
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : null;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch (error) {
    log("warn", "profile.corrupt", error);
  }
  const moves = typeof data.moves === "object" && data.moves !== null && !Array.isArray(data.moves) ? Object.entries(data.moves) : [];
  return {
    name: cleanName(data.name),
    cleared: Array.isArray(data.cleared) ? [...new Set(data.cleared.filter((id): id is string => typeof id === "string"))] : [],
    moves: Object.fromEntries(moves.map(([move, times]) => [move, count(times)] as const).filter(([, times]) => times > 0)),
    bestScore: count(data.bestScore),
    fights: count(data.fights),
    wins: count(data.wins),
  };
}

/** The profile after one more fight. */
export function withFight(profile: Profile, fight: FightResult): Profile {
  const moves: Record<string, number> = { ...profile.moves };
  for (const [move, times] of Object.entries(fight.mastery)) moves[move] = (moves[move] ?? 0) + count(times);
  return {
    ...profile,
    moves,
    cleared: fight.won && !profile.cleared.includes(fight.enemyId) ? [...profile.cleared, fight.enemyId] : profile.cleared,
    bestScore: Math.max(profile.bestScore, count(fight.score)),
    fights: profile.fights + 1,
    wins: profile.wins + (fight.won ? 1 : 0),
  };
}

export interface ProfileStore {
  readonly get: () => Profile;
  readonly rename: (name: string) => void;
  readonly record: (fight: FightResult) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createProfileStore(storage: SettingsStorage | null): ProfileStore {
  let current = EMPTY_PROFILE;
  try {
    current = parseProfile(storage?.getItem(PROFILE_KEY) ?? null);
  } catch (error) {
    log("warn", "profile.read", error);
  }
  const listeners = new Set<() => void>();
  const save = (next: Profile): void => {
    current = next;
    try {
      storage?.setItem(PROFILE_KEY, JSON.stringify(current));
    } catch (error) {
      log("warn", "profile.save", error);
    }
    listeners.forEach((listener) => { listener(); });
  };
  return {
    get: () => current,
    rename: (name) => { save({ ...current, name: cleanName(name) }); },
    record: (fight) => { save(withFight(current, fight)); },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

const shared = createProfileStore(browserStorage());

export const getProfile = shared.get;
export const renameProfile = shared.rename;
export const recordFight = shared.record;

export function useProfile(): Profile {
  return useSyncExternalStore(shared.subscribe, shared.get, shared.get);
}
