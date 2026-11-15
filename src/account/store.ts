// The player's profile: a hero name and what they have done so far, kept in this browser's localStorage.
// The game plays from this store whether or not anyone is signed in; an account (./sync) only copies it to and fro.
// Every field read back is checked.
import { useSyncExternalStore } from "react";
import { log } from "../core/log";
import { browserStorage } from "../settings/store";
import type { SettingsStorage } from "../settings/store";
import type { FightTally } from "./tally";

export interface Profile {
  readonly name: string;
  /** Ids of the stops beaten at least once. */
  readonly cleared: readonly string[];
  /** How many times each move has counted, over every fight. */
  readonly moves: Readonly<Record<string, number>>;
  readonly bestScore: number;
  readonly fights: number;
  readonly wins: number;
  /** Totals over every fight: god powers used, blows blocked, blows dodged. */
  readonly powers: number;
  readonly blocks: number;
  readonly dodges: number;
  readonly bestCombo: number;
  /** Fights won without being hit. */
  readonly unhit: number;
  /** Ids of the fighting styles a fight was won with. */
  readonly styles: readonly string[];
  /** Training Dojo sessions finished, and how many of them had a move with every try Excellent. */
  readonly dojo: number;
  readonly dojoPerfect: number;
  /** Fights played in a Multiplayer room, as host with a guest in it or as the guest. */
  readonly rooms: number;
}

export interface FightResult {
  readonly enemyId: string;
  readonly won: boolean;
  readonly score: number;
  readonly mastery: Readonly<Record<string, number>>;
  readonly styleId: string;
  readonly tally: Readonly<FightTally>;
}

export const PROFILE_KEY = "odyssey-dojo.profile";
export const NAME_MAX = 20;
export const EMPTY_PROFILE: Profile = {
  name: "", cleared: [], moves: {}, bestScore: 0, fights: 0, wins: 0,
  powers: 0, blocks: 0, dodges: 0, bestCombo: 0, unhit: 0, styles: [], dojo: 0, dojoPerfect: 0, rooms: 0,
};

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
  const ids = (value: unknown): readonly string[] => (Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))] : []);
  const moves = typeof data.moves === "object" && data.moves !== null && !Array.isArray(data.moves) ? Object.entries(data.moves) : [];
  return {
    name: cleanName(data.name),
    cleared: ids(data.cleared),
    moves: Object.fromEntries(moves.map(([move, times]) => [move, count(times)] as const).filter(([, times]) => times > 0)),
    bestScore: count(data.bestScore),
    fights: count(data.fights),
    wins: count(data.wins),
    powers: count(data.powers),
    blocks: count(data.blocks),
    dodges: count(data.dodges),
    bestCombo: count(data.bestCombo),
    unhit: count(data.unhit),
    styles: ids(data.styles),
    dojo: count(data.dojo),
    dojoPerfect: count(data.dojoPerfect),
    rooms: count(data.rooms),
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
    powers: profile.powers + count(fight.tally.powers),
    blocks: profile.blocks + count(fight.tally.blocks),
    dodges: profile.dodges + count(fight.tally.dodges),
    bestCombo: Math.max(profile.bestCombo, count(fight.tally.bestCombo)),
    unhit: profile.unhit + (fight.won && fight.tally.hitsTaken === 0 ? 1 : 0),
    styles: fight.won && !profile.styles.includes(fight.styleId) ? [...profile.styles, fight.styleId] : profile.styles,
    rooms: profile.rooms + (fight.tally.room ? 1 : 0),
  };
}

export interface ProfileStore {
  readonly get: () => Profile;
  readonly rename: (name: string) => void;
  readonly record: (fight: FightResult) => void;
  /** One Training Dojo session finished; `perfect` when a move in it had every try Excellent. */
  readonly recordDojo: (perfect: boolean) => void;
  /** One fight played as the guest of a room. The host's fights come through `record`. */
  readonly recordRoom: () => void;
  /**
   * Takes the fields of a profile that came back from the account, each checked like stored JSON.
   * A field it does not hold stays as it is here, so a save from before a field existed can never zero it.
   */
  readonly replace: (profile: unknown) => void;
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
    recordDojo: (perfect) => { save({ ...current, dojo: current.dojo + 1, dojoPerfect: current.dojoPerfect + (perfect ? 1 : 0) }); },
    recordRoom: () => { save({ ...current, rooms: current.rooms + 1 }); },
    replace: (profile) => {
      const given = typeof profile === "object" && profile !== null && !Array.isArray(profile) ? profile : {};
      save(parseProfile(JSON.stringify({ ...current, ...given })));
    },
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
export const recordDojo = shared.recordDojo;
export const recordRoom = shared.recordRoom;
export const replaceProfile = shared.replace;
export const subscribeProfile = shared.subscribe;

export function useProfile(): Profile {
  return useSyncExternalStore(shared.subscribe, shared.get, shared.get);
}
