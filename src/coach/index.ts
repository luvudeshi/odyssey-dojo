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
