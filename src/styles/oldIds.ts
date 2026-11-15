// Style ids the game used to have, and the style that took each one's place. Saved profiles and hall of heroes
// rows can still hold the old ids, so every place that reads a saved style id passes it through currentStyleId.

/** Old id to the id that replaced it: Pankration was the kicking style, Hoplite the two-strike style with no kicks. */
export const RENAMED_STYLES: Readonly<Record<string, string>> = {
  pankration: "taekwondo",
  hoplite: "jiu_jitsu",
};

/** The id to use today for a saved style id. Ids that were never renamed come back as they are. */
export function currentStyleId(id: string): string {
  return Object.hasOwn(RENAMED_STYLES, id) ? (RENAMED_STYLES[id] ?? id) : id;
}

/** A saved list of style ids as today's ids, in the same order, each one once. */
export function currentStyleIds(ids: readonly string[]): readonly string[] {
  return [...new Set(ids.map(currentStyleId))];
}

/**
 * The Training Dojo's kept choice (DOJO_CHOICE_KEY in src/coach/catalog.ts) from before the rename. Then the Dojo's own
 * kicks list had the id "taekwondo", which is the game's Taekwondo style now; the list is "taekwondo_kicks".
 */
export const RENAMED_DOJO_STYLES: Readonly<Record<string, string>> = {
  ...RENAMED_STYLES,
  taekwondo: "taekwondo_kicks",
};

/** The id to use today for a style id the Dojo kept before the rename. Only for a choice saved before it (see catalog.ts). */
export function currentDojoStyleId(id: string): string {
  return Object.hasOwn(RENAMED_DOJO_STYLES, id) ? (RENAMED_DOJO_STYLES[id] ?? id) : id;
}
