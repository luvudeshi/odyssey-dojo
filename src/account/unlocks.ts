// Which achievements a fight unlocked: the ones done after it that were not done before.
import type { Achievement } from "./achievements";

export function newlyUnlocked(before: readonly Achievement[], after: readonly Achievement[]): readonly Achievement[] {
  const had = new Set(before.filter((feat) => feat.done).map((feat) => feat.id));
  return after.filter((feat) => feat.done && !had.has(feat.id));
}
