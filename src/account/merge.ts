// How this browser's progress and the account's progress become one save. Nothing is ever lost by signing in:
// lists (cleared stops, styles, achievements) are joined and counts take the larger of the two.
// The profile is joined field by field by what kind of value each holds, never by a list of names, so a field
// the game adds later is joined the same way without a change here.
import type { Save } from "./contracts";

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Both lists joined, each entry once, the first list's order kept. */
function union<T>(first: readonly T[], second: readonly T[]): T[] {
  const seen = new Set<string>();
  return [...first, ...second].filter((entry) => {
    const mark = JSON.stringify(entry);
    if (seen.has(mark)) return false;
    seen.add(mark);
    return true;
  });
}

/**
 * Two values of one field as one. Two lists: both, each entry once. Two numbers: the larger. Two objects: field by
 * field (the move counts). Anything else (a text, a switch, kinds that differ): `theirs`, unless `localFirst`.
 * A side that has nothing gives way to the other.
 */
function joined(theirs: unknown, local: unknown, localFirst: boolean): unknown {
  if (Array.isArray(theirs) && Array.isArray(local)) return union<unknown>(theirs, local);
  if (typeof theirs === "number" && typeof local === "number") return Math.max(theirs, local);
  if (isFields(theirs) && isFields(local)) {
    const keys = union(Object.keys(theirs), Object.keys(local));
    return Object.fromEntries(keys.map((key) => [key, joined(theirs[key], local[key], localFirst)]));
  }
  const [first, second] = localFirst ? [local, theirs] : [theirs, local];
  return first ?? second;
}

const hasKeys = (value: object): boolean => Object.keys(value).length > 0;
const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** What an account that was never saved to counts as. */
const NOTHING_SAVED: Save = { version: 1, profile: {}, settings: {}, character: null };

/** What this browser changed since it last joined with the account. Only these win over what the account holds. */
export interface LocalChanges {
  readonly name: boolean;
  /** The names of the settings that were changed here. */
  readonly settings: readonly string[];
  readonly character: boolean;
}

export interface MergeOptions {
  /** The name the player signed in with. It becomes the hero name when the account has no save yet. */
  readonly accountName: string;
  /**
   * Whose hero name, settings and character win when both sides have them. "account" on sign-in and at start-up.
   * "local" when this browser has changes the account does not have and it is not known which they are.
   * A list of what was changed here when it is known: then a fight won on a browser that was not looking sends
   * its fight, and does not also put its old hero name and volume over a change made elsewhere.
   */
  readonly prefer?: "account" | "local" | LocalChanges;
}

/** The parts of this browser's save that changed between two snapshots of it. */
export function changesBetween(before: Save, after: Save): LocalChanges {
  const differs = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);
  const keys = [...new Set([...Object.keys(before.settings), ...Object.keys(after.settings)])];
  return {
    name: differs(before.profile.name, after.profile.name),
    settings: keys.filter((key) => differs(before.settings[key], after.settings[key])),
    character: differs(before.character, after.character),
  };
}

/**
 * The save both sides agree on. `account` is null for an account that has never been saved to.
 * Cleared stops, styles and achievements: both. Move counts and every other count: the larger.
 * Settings and character: the account's when it has them, else this browser's.
 * Hero name: the one saved in the account, else the name signed in with.
 */
export function mergeSaves(local: Save, account: Save | null, options: MergeOptions): Save {
  const prefer = options.prefer ?? "account";
  const theirs = account ?? NOTHING_SAVED;
  const all = prefer === "local";
  const changed: LocalChanges = typeof prefer === "object" ? prefer : { name: all, settings: all ? Object.keys(local.settings) : [], character: all };
  const achievements = union(theirs.achievements ?? [], local.achievements ?? []);
  const profile = joined(theirs.profile, local.profile, changed.name) as Record<string, unknown>;
  // The account's settings when it has any, with the ones changed here put over them.
  const settings = hasKeys(theirs.settings) && !(all && hasKeys(local.settings)) ? theirs.settings : local.settings;
  const mine = Object.fromEntries(changed.settings.filter((key) => key in local.settings).map((key) => [key, local.settings[key]]));
  return {
    version: 1,
    profile: { ...profile, name: (changed.name ? text(local.profile.name) : "") || text(theirs.profile.name) || options.accountName },
    settings: { ...settings, ...mine },
    character: (changed.character ? local.character ?? theirs.character : theirs.character ?? local.character),
    ...(achievements.length > 0 ? { achievements } : {}),
  };
}
