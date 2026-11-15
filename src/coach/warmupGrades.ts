// What the warm-up tells the player: a grade, points and one tip for each step as it ends, and at the end the
// total, the best move and what to work on. Pure. The grade rule is `gradeStep` in ./warmup, the words and the
// points are ./grade, and the tip for a weak part comes from practice mode's `judgeRep`.
import type { Baseline, PoseFrame } from "../core/types";
import { MOVES } from "../moves/registry";
import type { StepResult, WarmupStep } from "./contract";
import { POINTS } from "./grade";
import type { Grade, GradeTier } from "./grade";
import { PRACTICE_TIPS, judgeRep } from "./practice";
import { gradeStep, stepScore, tipFor } from "./warmup";

/** How one step went, as the screen shows it. */
export interface StepFeedback {
  readonly step: WarmupStep;
  readonly result: StepResult;
  readonly grade: Grade;
  /** One line on how to make the move better, at most 90 characters. Shown under "Needs improvement" and in the work-on list. */
  readonly tip: string;
}

/**
 * The grade and the tip for a step that has just ended. `frames` are the frames of that step, oldest first, and
 * `baseline` the player's standing measure. A move that was not seen gets the tip for its weakest measured part,
 * or for what stopped it being read (not in the picture, no standing start); otherwise the move's own line.
 */
export function feedbackFor(result: StepResult, frames: readonly PoseFrame[] = [], baseline: Baseline | null = null): StepFeedback {
  const move = MOVES.get(result.step.moveId);
  const rep = move && frames.length > 0 ? judgeRep(move, frames, baseline) : null;
  // A tip from a repetition judged the other way (counted here, not there) would not fit the grade. And when
  // nothing about the move could be measured, the move's own line says more than "I did not see a move".
  const vague = move ? [PRACTICE_TIPS.still.tip, PRACTICE_TIPS[move.kind].tip] : [];
  const measured = rep && rep.counted === result.done && rep.tip !== null && !vague.includes(rep.tip) ? rep.tip : null;
  return { step: result.step, result, grade: gradeStep(result), tip: measured ?? tipFor(result.step.moveId) };
}

export interface Highlights {
  readonly points: number;
  /** Every step Excellent. */
  readonly maxPoints: number;
  readonly counts: Readonly<Record<GradeTier, number>>;
  /** The best graded move that was seen, or null when none was. */
  readonly best: StepFeedback | null;
  /** When at least one step needs improvement: the steps graded lowest, lowest first, at most three, none of them Excellent. */
  readonly workOn: readonly StepFeedback[];
  /** True when every step was Good or better. `workOn` is empty then and `sharpen` names the weakest anyway. */
  readonly allGood: boolean;
  readonly sharpen: StepFeedback | null;
}

/** The most moves the work-on list names. */
export const MAX_WORK_ON = 3;

/** The end of the warm-up. Ties keep warm-up order. */
export function highlights(feedback: readonly StepFeedback[]): Highlights {
  const counts: Record<GradeTier, number> = { excellent: 0, good: 0, needs_work: 0 };
  for (const each of feedback) counts[each.grade.tier] += 1;
  const lowestFirst = [...feedback].sort((a, b) => a.grade.points - b.grade.points || stepScore(a.result) - stepScore(b.result));
  const seen = feedback.filter((each) => each.result.done);
  const best = seen.reduce<StepFeedback | null>(
    (top, each) => (!top || each.grade.points > top.grade.points || (each.grade.points === top.grade.points && stepScore(each.result) > stepScore(top.result)) ? each : top),
    null,
  );
  const allGood = feedback.length > 0 && counts.needs_work === 0;
  return {
    points: feedback.reduce((sum, each) => sum + each.grade.points, 0),
    maxPoints: feedback.length * POINTS.excellent,
    counts,
    best,
    workOn: counts.needs_work > 0 ? lowestFirst.filter((each) => each.grade.tier !== "excellent").slice(0, MAX_WORK_ON) : [],
    allGood,
    sharpen: allGood ? (lowestFirst[0] ?? null) : null,
  };
}
