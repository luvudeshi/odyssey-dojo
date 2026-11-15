// How this browser's progress and the account's progress become one save. Nothing is ever lost by signing in:
// cleared stops and achievements are joined, counts take the larger of the two.
import type { Save } from "./contracts";

/** Both lists joined, each id once, the first list's order kept. */
function union(first: readonly string[], second: readonly string[]): string[] {
  return [...new Set([...first, ...second])];
}

function largerCounts(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [move, times] of Object.entries(b)) out[move] = Math.max(out[move] ?? 0, times);
  return out;
}

const hasKeys = (value: object): boolean => Object.keys(value).length > 0;

/** What an account that was never saved to counts as. */
const NOTHING_SAVED: Save = { version: 1, profile: { name: "", cleared: [], moves: {}, bestScore: 0, fights: 0, wins: 0 }, settings: {}, character: null };

export interface MergeOptions {
  /** The name the player signed in with. It becomes the hero name when the account has no save yet. */
  readonly accountName: string;
  /**
   * Whose hero name, settings and character win when both sides have them. "account" on sign-in and at start-up;
   * "local" when this browser has changes it could not send yet, so they are not undone by an older save.
   */
  readonly prefer?: "account" | "local";
}

/**
 * The save both sides agree on. `account` is null for an account that has never been saved to.
 * Cleared stops and achievements: both. Move counts, fights, wins, best score: the larger.
 * Settings and character: the account's when it has them, else this browser's.
 * Hero name: the one saved in the account, else the name signed in with.
 */
export function mergeSaves(local: Save, account: Save | null, options: MergeOptions): Save {
  const localFirst = options.prefer === "local";
  const theirs = account ?? NOTHING_SAVED;
  const first = localFirst ? local : theirs;
  const second = localFirst ? theirs : local;
  const achievements = union(theirs.achievements ?? [], local.achievements ?? []);
  return {
    version: 1,
    profile: {
      name: (localFirst ? local.profile.name : "") || theirs.profile.name || options.accountName,
      cleared: union(theirs.profile.cleared, local.profile.cleared),
      moves: largerCounts(theirs.profile.moves, local.profile.moves),
      bestScore: Math.max(theirs.profile.bestScore, local.profile.bestScore),
      fights: Math.max(theirs.profile.fights, local.profile.fights),
      wins: Math.max(theirs.profile.wins, local.profile.wins),
    },
    settings: hasKeys(first.settings) ? first.settings : second.settings,
    character: first.character ?? second.character,
    ...(achievements.length > 0 ? { achievements } : {}),
  };
}
