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

export interface MergeOptions {
  /** The name the player signed in with. It becomes the hero name when the account has no save yet. */
  readonly accountName: string;
  /**
   * Whose hero name, settings and character win when both sides have them. "account" on sign-in and at start-up;
   * "local" when this browser has changes the account does not have yet, so they are not undone by an older save.
   */
  readonly prefer?: "account" | "local";
}

/**
 * The save both sides agree on. `account` is null for an account that has never been saved to.
 * Cleared stops, styles and achievements: both. Move counts and every other count: the larger.
 * Settings and character: the account's when it has them, else this browser's.
 * Hero name: the one saved in the account, else the name signed in with.
 */
export function mergeSaves(local: Save, account: Save | null, options: MergeOptions): Save {
  const localFirst = options.prefer === "local";
  const theirs = account ?? NOTHING_SAVED;
  const first = localFirst ? local : theirs;
  const second = localFirst ? theirs : local;
  const achievements = union(theirs.achievements ?? [], local.achievements ?? []);
  const profile = joined(theirs.profile, local.profile, localFirst) as Record<string, unknown>;
  return {
    version: 1,
    profile: { ...profile, name: (localFirst ? text(local.profile.name) : "") || text(theirs.profile.name) || options.accountName },
    settings: hasKeys(first.settings) ? first.settings : second.settings,
    character: first.character ?? second.character,
    ...(achievements.length > 0 ? { achievements } : {}),
  };
}
