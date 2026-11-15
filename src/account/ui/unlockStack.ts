// How many unlock cards the notice shows at once. A first win on a fresh profile unlocks five to eight achievements
// together; a card each ran off the bottom of the screen, so the stack stops at MAX_CARDS and one line counts the rest.

/** The most cards shown at once. Five cards and the line under them fit a window 600 px high. */
export const MAX_CARDS = 5;

export interface UnlockStack<T> {
  /** The ones that get a card, in the order they came. */
  readonly shown: readonly T[];
  /** How many more were unlocked than are shown: 0 when every one has a card. */
  readonly more: number;
}

/** The first `cap` items get a card; the rest are only counted. A cap that is not a whole number of at least 1 is taken as 1. */
export function stackOf<T>(items: readonly T[], cap: number = MAX_CARDS): UnlockStack<T> {
  const most = Number.isFinite(cap) ? Math.max(1, Math.floor(cap)) : 1;
  const shown = items.slice(0, most);
  return { shown, more: items.length - shown.length };
}

/** The line under the cards: "and 3 more". Empty when there is nothing more to count. */
export function moreLine(more: number): string {
  return more > 0 ? `and ${String(more)} more` : "";
}
