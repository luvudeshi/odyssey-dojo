// One grade for one attempt at a move, in training and in the warm-up: a word the player sees and the points it earns.
// The three words are Excellent, Great and Needs improvement. Lenient on purpose: anything the detector counted is
// at least "Great". The tier in the middle keeps its id, "good", so nothing that reads the tier changes.

export type GradeTier = "excellent" | "good" | "needs_work";

export interface Grade {
  readonly tier: GradeTier;
  /** What the player sees. */
  readonly label: "Excellent!" | "Great!" | "Needs improvement";
  readonly points: number;
}

/** A counted attempt at or above this quality (0 to 1) is excellent. */
export const EXCELLENT_AT = 0.7;
export const POINTS: Record<GradeTier, number> = { excellent: 150, good: 100, needs_work: 25 };

const LABELS: Record<GradeTier, Grade["label"]> = { excellent: "Excellent!", good: "Great!", needs_work: "Needs improvement" };

/** `counted`: the detector fired. `quality`: its 0 to 1 score for the attempt (ignored when not counted). */
export function gradeFor(counted: boolean, quality: number): Grade {
  const tier: GradeTier = !counted ? "needs_work" : quality >= EXCELLENT_AT ? "excellent" : "good";
  return { tier, label: LABELS[tier], points: POINTS[tier] };
}
