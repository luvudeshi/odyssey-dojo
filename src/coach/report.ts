// End-of-fight lines: did each warm-up habit get better?
import type { Habit } from "./habits";

/** A change in severity smaller than this reads as "about the same". */
const CLEAR_CHANGE = 0.1;

/** One plain line per habit found before the fight, in the same order. A habit missing from `after` is gone. */
export function improvement(before: readonly Habit[], after: readonly Habit[]): string[] {
  return before.map((habit) => {
    const now = after.find((other) => other.id === habit.id);
    if (!now) return `${habit.label}: fixed. Well done.`;
    const change = now.severity - habit.severity;
    if (change <= -CLEAR_CHANGE) return `${habit.label}: better. Keep going.`;
    if (change >= CLEAR_CHANGE) return `${habit.label}: worse than in the warm-up. ${habit.tip}`;
    return `${habit.label}: about the same. ${habit.tip}`;
  });
}
