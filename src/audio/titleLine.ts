// Which of Homer's menu lines the Story button speaks: a different one each time, also across page reloads.
import { TITLE_LINES } from "./storyLines";

export const TITLE_LINE_KEY = "odyssey-dojo.title-line";
const FALLBACK = "homer_title";

/** The part of localStorage used, so a test can pass a stand-in. */
export interface TitleLineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): TitleLineStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * A title line whose clip `available` says can play, other than `last` unless it is the only one. With none playable
 * it is "homer_title". `random` is 0..1.
 */
export function pickTitleLine(available: (id: string) => boolean, last: string | null, random: () => number): string {
  const playable = TITLE_LINES.filter((line) => available(line.id));
  const fresh = playable.filter((line) => line.id !== last);
  const pool = fresh.length > 0 ? fresh : playable;
  return pool[Math.floor(random() * pool.length)]?.id ?? FALLBACK;
}

/** Picks a line and remembers it. Storage that is missing or throws just means no memory across reloads. */
export function nextTitleLine(
  available: (id: string) => boolean,
  random: () => number = Math.random,
  storage: TitleLineStorage | null = browserStorage(),
): string {
  let last: string | null = null;
  try {
    last = storage?.getItem(TITLE_LINE_KEY) ?? null;
  } catch {
    last = null;
  }
  const id = pickTitleLine(available, last, random);
  try {
    storage?.setItem(TITLE_LINE_KEY, id);
  } catch {
    // Private window or full storage: the line still plays.
  }
  return id;
}
