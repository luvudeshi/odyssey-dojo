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
