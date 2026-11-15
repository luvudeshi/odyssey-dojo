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
// One grade for one attempt: Excellent, Great or Needs improvement, and the points it earns.
export { EXCELLENT_AT, POINTS, gradeFor } from "./grade";
// What the dojo says about each move, written by hand: praise, how to make it, and a tip for each fault.
export { COACHING, faultFor, faultOf, praiseFor } from "./coaching";
export type { Fault, MoveCoaching } from "./coaching";
export type { Grade, GradeTier } from "./grade";
// The training dojo: a session over a list of moves, graded repetition by repetition. The screen is ./ui/Dojo.
export {
  COUNT_FROM, DOJO_DEFAULTS, DOJO_DEFENDS, DOJO_REPS, KEY_TIP, SKILL_VALUE, STRIKE_FOR_EXCELLENT, SURE_FOR_EXCELLENT, assessmentFrom, closingLine,
  currentMove, gradeAttempt, gradeRep, gradedQuality, keyRep, movesFor, quickMoves, skillFrom, skipResult, startDojo, summariseDojo, tickDojo, trackOf, tuningLine, tuningOf,
} from "./dojo";
export type { DojoConfig, DojoPhase, DojoRep, DojoState, DojoSummary, DojoTrack, Hit, MoveReport, TrackStep, Tuning, WorkOn } from "./dojo";
// What the dojo can train and the list a player ticks before a session: the game's moves and styles plus the dojo's own (./extra).
export { DOJO_CHOICE_KEY, DOJO_MEASURES, REPS_CHOICES, dojoGuideFor, dojoMenu, dojoMoveOf, dojoStyles, loadChoice, pickedInOrder, saveChoice, startingSetup } from "./catalog";
export type { DojoChoice, DojoMenuGroup, DojoMenuMove, DojoStyleDef } from "./catalog";
