// The warm-up coach: score a warm-up into habits, lean the monster on them, say what improved.
export { scoreWarmup } from "./habits";
export type { DefenseId, Habit, HabitId } from "./habits";
export { MAX_LEAN, trainOn } from "./train";
export { improvement } from "./report";
export { SKIPPED, WARMUP_STEPS, assessWarmup, stepScore, summary, tuneFor } from "./warmup";
export type { Assess, Assessment, Focus, SkillLevel, StepResult, WarmupStep } from "./contract";
// Practice mode: judge one repetition, give a tip for its weakest part, sum up ten.
export { KEYBOARD_REP, PRACTICE_TIPS, PRAISE, REPS, TABLED_MOVES, judgeRep, nextRep, startPractice, summarise } from "./practice";
export type { PracticeState, PracticeSummary, PracticeTip, RepResult, Trend } from "./practice";
// The move guide: a looping figure per move and a live checklist of what its detector sees. The component is ./ui/MoveGuide.
export { guideFor, liveChecks, poseAt, toScreen } from "./guide";
export type { Guide, GuideKeyframe, LiveCheck, LiveChecks } from "./guide";
// One grade for one attempt at a move: the word the player sees and the points it earns.
export { EXCELLENT_AT, POINTS, gradeFor } from "./grade";
export type { Grade, GradeTier } from "./grade";
// The warm-up's grades: a grade and a tip per step, the end-of-warm-up highlights, and the line on what was tuned.
export { TELEGRAPH_SCALE, gradeStep, levelOf, tipFor, tuneLine } from "./warmup";
export { MAX_WORK_ON, feedbackFor, highlights } from "./warmupGrades";
export type { Highlights, StepFeedback } from "./warmupGrades";
