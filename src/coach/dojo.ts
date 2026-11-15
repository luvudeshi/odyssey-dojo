// The training dojo, the pure parts (issue #172): a session over a list of moves, a few repetitions each. For every
// repetition the figure shows the move ("show"), the player does it ("go"), and a grade with points is shown
// ("result"). At the end: the total, the best move, and what to work on with one line on how. Frames and a clock in,
// state out: no screen here. The screen is ./ui/Dojo. docs/dojo.md has the rules in plain words.
// Every number is a first guess, not yet tuned on a real body.
import type { EnemySpec, MoveDef, PoseFrame, PoseHistory } from "../core/types";
import { EMPTY_HISTORY, clamp01, pushFrame } from "../pose/signals";
import { DOJO_DEFENDS, dojoJudgeRep, dojoMoveOf, dojoPraiseFor, dojoTipFor, usualMoves } from "./catalog";
import type { Assessment, Focus, SkillLevel, StepResult } from "./contract";
import { EXCELLENT_AT, POINTS, gradeFor } from "./grade";
import type { Grade, GradeTier } from "./grade";
import { KEYBOARD_REP, PRACTICE_TIPS, summarise } from "./practice";
import type { RepResult } from "./practice";
import { AVERAGE_BELOW, BEGINNER_BELOW, STRONG_FROM, tuneFor } from "./warmup";

/** Repetitions of each move. Three, not practice's ten: a whole session is about two minutes. */
export const DOJO_REPS = 3;
/** The four defends every style trains after its strikes. The list is kept with the rest of what the dojo can train. */
export { DOJO_DEFENDS };
/** The fight counts a move at 0.7. Training counts a near miss too: it is graded Great, never Excellent. */
export const COUNT_FROM = 0.6;
/** The most frames kept for one repetition (the second before it and the attempt). */
const MAX_FRAMES = 400;
/** The frames from before "go" that are judged with the attempt: the player standing, as long as the history is. */
const LEAD_MS = 1000;
/** How much longer a grade stays up when it comes with something to work on: time to read the line. Space or Enter still leaves it early. */
export const READ_TIP_MS = 1500;
/** Said when a keyboard player lets the time run out. */
export const KEY_TIP = "Press the key shown for the move while the bar is running.";

export interface DojoConfig {
  /** Move ids, in the order they are trained. Ids the dojo does not know (./catalog) are left out. */
  readonly moves: readonly string[];
  readonly reps: number;
  /** How long the figure plays before the first repetition of a move, and before each later one. */
  readonly showMs: number;
  readonly againMs: number;
  /** How long the player has. It ends early once the move is counted. */
  readonly goMs: number;
  /** How long after the move is counted the frames keep coming, so the finish and the hold can be judged. */
  readonly settleMs: number;
  /** How long the grade is shown. One with something to work on stays READ_TIP_MS longer. */
  readonly resultMs: number;
  /** The detector confidence from which a repetition counts. */
  readonly countFrom: number;
  /** True with no camera: a repetition is a key press, and running out of time says which key. */
  readonly keyboard: boolean;
}

export const DOJO_DEFAULTS: Omit<DojoConfig, "moves"> = {
  reps: DOJO_REPS, showMs: 2000, againMs: 1000, goMs: 3000, settleMs: 300, resultMs: 1200, countFrom: COUNT_FROM, keyboard: false,
};

/** A style as these lists need it: the game's, or one only the dojo knows. */
interface Strikes { readonly strikes: readonly string[] }

/** The whole list for a style: its strikes, then the four defends. */
export function movesFor(style: Strikes): string[] {
  return usualMoves(style);
}

/** A short list for a demo: the style's first two strikes, then block, duck and one dodge. Five moves. */
export function quickMoves(style: Strikes): string[] {
  return [...new Set([...style.strikes.slice(0, 2), "block", "duck", "dodge_left"])];
}

export type DojoPhase = "show" | "go" | "result" | "done";

/** One repetition, judged and graded. */
export interface DojoRep {
  readonly moveId: string;
  readonly result: RepResult;
  readonly grade: Grade;
  /** The quality the grade was given for, 0 to 1 (see `gradedQuality`). 0 when it did not count. */
  readonly quality: number;
  /**
   * The line shown with the grade. Under "Needs improvement" always one: what to work on. Under "Great" the weakest
   * part, when there is one. Under "Excellent" what was done well, when the camera saw it (a key press has none).
   */
  readonly tip: string | null;
  /** Milliseconds from "go" to the move being counted; null when it was not. */
  readonly reactMs: number | null;
}

export interface DojoState {
  readonly config: DojoConfig;
  readonly phase: DojoPhase;
  /** Index into `config.moves` of the move being trained; `config.moves.length` when done. */
  readonly moveIndex: number;
  /** Which repetition of that move, from 0. */
  readonly repIndex: number;
  /** When the current phase began, on the caller's clock, and how long it lasts and has left. */
  readonly phaseAtMs: number;
  readonly phaseMs: number;
  readonly msLeft: number;
  /** The last second of frames, as the fight keeps it: what the live checklist reads. Its baseline is the player's first standing frames. */
  readonly history: PoseHistory;
  /** The frames of this repetition: the second before "go", then the attempt. */
  readonly frames: readonly PoseFrame[];
  /** Set once the move is counted in the "go" phase. */
  readonly hit: (Omit<Hit, "reactMs"> & { readonly atMs: number }) | null;
  readonly reps: readonly DojoRep[];
  readonly points: number;
  /** The repetition just graded; null before the first. */
  readonly last: DojoRep | null;
}

type Lookup = (id: string) => MoveDef | undefined;
/** Every move the dojo can train: the game's own, then the ones only the dojo knows (./catalog). */
const registry: Lookup = (id) => dojoMoveOf(id);
const finite = (value: number): number => (Number.isFinite(value) ? clamp01(value) : 0);

export function startDojo(config: Partial<DojoConfig> & Pick<DojoConfig, "moves">, nowMs: number, moveOf: Lookup = registry): DojoState {
  const full: DojoConfig = { ...DOJO_DEFAULTS, ...config, moves: config.moves.filter((id) => moveOf(id) !== undefined) };
  const reps = Math.max(1, Math.floor(Number.isFinite(full.reps) ? full.reps : DOJO_REPS));
  const empty = full.moves.length === 0;
  return {
    config: { ...full, reps },
    phase: empty ? "done" : "show",
    moveIndex: 0, repIndex: 0,
    phaseAtMs: nowMs, phaseMs: empty ? 0 : full.showMs, msLeft: empty ? 0 : full.showMs,
    history: EMPTY_HISTORY, frames: [], hit: null, reps: [], points: 0, last: null,
  };
}

/** The move being asked for, or undefined when the session is done. */
export function currentMove(state: DojoState, moveOf: Lookup = registry): MoveDef | undefined {
  const id = state.config.moves[state.moveIndex];
  return id === undefined ? undefined : moveOf(id);
}

function enter(state: DojoState, phase: DojoPhase, nowMs: number, phaseMs: number): DojoState {
  return { ...state, phase, phaseAtMs: nowMs, phaseMs, msLeft: phaseMs };
}

/** What the screen saw while the player moved: the quality then, how long after "go", and whether it reached the fight's 0.7 or was a near miss. */
export interface Hit {
  readonly quality: number;
  readonly reactMs: number;
  readonly sure: boolean;
}
/** The most a near miss is graded at: under the Excellent line. */
const NEAR_MISS_QUALITY = 0.6;

/** A move with no quality score of its own needs the detector this sure (0 to 1) to be Excellent. */
export const SURE_FOR_EXCELLENT = 0.82;
/**
 * The strike quality that is Excellent in training. The fight's quality scores are strict: copying the outline exactly
 * scores a jab 0.69. Training is lenient, so a strike is Excellent from here, not from 0.7.
 */
export const STRIKE_FOR_EXCELLENT = 0.58;

/**
 * The quality a repetition is graded on, 0 to 1, where 0.7 is the Excellent line (EXCELLENT_AT in ./grade).
 * A strike with its own quality score: that score, raised so STRIKE_FOR_EXCELLENT reads as 0.7. Any other move is
 * scored by how sure its detector got, and there the fight's line (0.7) would make every counted one Excellent, so
 * the scale is stretched: 0.7 reads as 0.5, SURE_FOR_EXCELLENT as 0.7, 1 as 1. A key press is left as it is.
 */
export function gradedQuality(move: Pick<MoveDef, "quality">, result: RepResult): number {
  if (!result.counted) return 0;
  const quality = finite(result.quality);
  if (result === KEYBOARD_REP) return quality;
  if (move.quality) return finite(quality + EXCELLENT_AT - STRIKE_FOR_EXCELLENT);
  if (quality < 0.7) return quality;
  return quality < SURE_FOR_EXCELLENT ? 0.5 + (0.2 * (quality - 0.7)) / (SURE_FOR_EXCELLENT - 0.7) : 0.7 + (0.3 * (quality - SURE_FOR_EXCELLENT)) / (1 - SURE_FOR_EXCELLENT);
}

/** One repetition from its judged result: the grade, the points and the line to show. */
export function gradeRep(move: MoveDef, result: RepResult, reactMs: number | null = null, nearMiss = false): DojoRep {
  // A near miss counts, but is never better than Great.
  const quality = nearMiss && result.counted ? Math.min(finite(result.quality), NEAR_MISS_QUALITY) : gradedQuality(move, result);
  const grade = gradeFor(result.counted, quality);
  const tip = grade.tier === "needs_work" ? (result.tip ?? dojoTipFor(move))
    : grade.tier === "good" ? result.tip
      : result === KEYBOARD_REP ? null : dojoPraiseFor(move);
  return { moveId: move.id, result, grade, quality, tip, reactMs: result.counted ? reactMs : null };
}

/**
 * Judges the frames of one attempt (`judgeRep`, or `judgeExtraRep` for a move only the dojo knows), leniently: a near miss (the detector reached `countFrom` but not the
 * fight's 0.7) counts, at the quality of how sure the detector got, so it is Great and never Excellent. `hit` is what
 * the screen saw while the player moved; what was counted then stays counted, whatever the second look says.
 */
export function gradeAttempt(
  move: MoveDef, frames: readonly PoseFrame[], baseline: PoseHistory["baseline"] = null,
  countFrom: number = COUNT_FROM, hit: Hit | null = null,
): DojoRep {
  const read = dojoJudgeRep(move, frames, baseline);
  if (read.counted) return gradeRep(move, read, hit?.reactMs ?? null);
  if (hit?.sure) return gradeRep(move, { ...read, counted: true, quality: finite(hit.quality) }, hit.reactMs);
  if (hit || read.peak >= countFrom) return gradeRep(move, { ...read, counted: true, quality: finite(hit?.quality ?? read.peak) }, hit?.reactMs ?? null, true);
  return gradeRep(move, read);
}

function shown(state: DojoState, rep: DojoRep, nowMs: number): DojoState {
  // Something to work on is a sentence to read: it stays up longer than a grade alone, or one with a word of praise.
  const readMs = rep.tip !== null && rep.grade.tier !== "excellent" ? READ_TIP_MS : 0;
  return { ...enter(state, "result", nowMs, state.config.resultMs + readMs), reps: [...state.reps, rep], points: state.points + rep.grade.points, last: rep, hit: null };
}

function judged(state: DojoState, move: MoveDef, nowMs: number): DojoState {
  const { config, frames, hit, history } = state;
  if (config.keyboard && frames.length === 0) {
    return shown(state, gradeRep(move, { counted: false, quality: 0, peak: 0, tip: KEY_TIP, part: "key press" }), nowMs);
  }
  return shown(state, gradeAttempt(move, frames, history.baseline, config.countFrom, hit && { ...hit, reactMs: hit.atMs - state.phaseAtMs }), nowMs);
}

function advance(state: DojoState, nowMs: number): DojoState {
  const { config } = state;
  const sameMove = state.repIndex + 1 < config.reps;
  const moveIndex = sameMove ? state.moveIndex : state.moveIndex + 1;
  const next = { ...state, moveIndex, repIndex: sameMove ? state.repIndex + 1 : 0, frames: state.history.frames, hit: null };
  if (moveIndex >= config.moves.length) return { ...enter(next, "done", nowMs, 0), frames: [] };
  return enter(next, "show", nowMs, sameMove ? config.againMs : config.showMs);
}

/**
 * Moves the session to `nowMs` and takes in `frame` when the camera has a new one. Call once per animation frame.
 * A finished session does not change.
 */
export function tickDojo(state: DojoState, nowMs: number, frame: PoseFrame | null, moveOf: Lookup = registry): DojoState {
  if (state.phase === "done") return state;
  const move = currentMove(state, moveOf);
  if (!move) return enter(state, "done", nowMs, 0);
  const fresh = frame !== null && Number.isFinite(frame.t) && frame.t > (state.history.frames.at(-1)?.t ?? -Infinity) ? frame : null;
  const history = fresh ? pushFrame(state.history, fresh) : state.history;
  const elapsed = Math.max(0, nowMs - state.phaseAtMs);
  const timed = { ...state, history, msLeft: Math.max(0, state.phaseMs - elapsed) };

  if (state.phase === "show") {
    const frames = fresh ? [...state.frames, fresh].filter((old) => fresh.t - old.t <= LEAD_MS) : state.frames;
    return elapsed >= state.phaseMs ? enter({ ...timed, frames }, "go", nowMs, state.config.goMs) : { ...timed, frames };
  }
  if (state.phase === "result") return elapsed >= state.phaseMs ? advance(timed, nowMs) : timed;

  // "go": the player's turn.
  const frames = fresh ? [...state.frames, fresh].slice(-MAX_FRAMES) : state.frames;
  let hit = state.hit;
  if (fresh && !hit) {
    const confidence = finite(move.detect(history));
    if (confidence >= state.config.countFrom) {
      // A strike is scored at the frame it counts, the way the fight scores it.
      const sure = confidence >= 0.7;
      hit = { atMs: nowMs, quality: sure ? finite(move.quality?.(history) ?? confidence) : confidence, sure };
    }
  }
  // A loosened detector counts a strike early in the motion; the best look in the settle window is the one scored.
  if (fresh && hit?.sure && hit.atMs !== nowMs) {
    const later = finite(move.quality?.(history) ?? 0);
    if (later > hit.quality) hit = { ...hit, quality: later };
  }
  const going = { ...timed, frames, hit };
  if ((hit && nowMs - hit.atMs >= state.config.settleMs) || elapsed >= state.phaseMs) return judged(going, move, nowMs);
  return going;
}

/** A repetition made on the keyboard. It counts only while it is the player's turn. */
export function keyRep(state: DojoState, nowMs: number, moveOf: Lookup = registry): DojoState {
  const move = currentMove(state, moveOf);
  if (state.phase !== "go" || !move) return state;
  return shown(state, gradeRep(move, KEYBOARD_REP, Math.max(0, nowMs - state.phaseAtMs)), nowMs);
}

/** Leaves the grade early and goes on to the next repetition. */
export function skipResult(state: DojoState, nowMs: number): DojoState {
  return state.phase === "result" ? advance(state, nowMs) : state;
}

/** One move on the strip along the bottom of a session. */
export interface TrackStep {
  readonly moveId: string;
  readonly name: string;
  /** "done": every repetition of it is over. "current": the one being trained. "next": still to come. */
  readonly status: "done" | "current" | "next";
  /** The best grade among its repetitions so far; null before the first. */
  readonly best: GradeTier | null;
  /** The points its repetitions have earned so far. */
  readonly points: number;
  /** How many of its repetitions have been graded. */
  readonly tries: number;
}

/** What the strip shows: every move of the session in the order trained, and how many are finished. */
export interface DojoTrack {
  readonly steps: readonly TrackStep[];
  readonly done: number;
  readonly total: number;
}

const BEST_FIRST: readonly GradeTier[] = ["excellent", "good", "needs_work"];

/**
 * The session as a row of moves: the ones before `moveIndex` are done, that one is the current one, the rest are
 * next, in order. Each carries its best grade and its points so far. With `moveIndex` at or past the end (the
 * session is over) every move is done. An id the lookup does not know is left out, as `startDojo` leaves it out.
 */
export function trackOf(moves: readonly string[], moveIndex: number, reps: readonly DojoRep[], moveOf: Lookup = registry): DojoTrack {
  const known = moves.flatMap((id) => { const move = moveOf(id); return move ? [move] : []; });
  const at = Number.isFinite(moveIndex) ? Math.max(0, Math.floor(moveIndex)) : 0;
  const steps = known.map((move, index): TrackStep => {
    const own = reps.filter((each) => each.moveId === move.id);
    return {
      moveId: move.id, name: move.name, status: index < at ? "done" : index === at ? "current" : "next",
      best: BEST_FIRST.find((tier) => own.some((each) => each.grade.tier === tier)) ?? null,
      points: own.reduce((sum, each) => sum + each.grade.points, 0), tries: own.length,
    };
  });
  return { steps, done: Math.min(at, steps.length), total: steps.length };
}

/** How one move went over its repetitions. */
export interface MoveReport {
  readonly moveId: string;
  readonly name: string;
  readonly reps: number;
  readonly points: number;
  /** Mean points per repetition. */
  readonly average: number;
  readonly meanQuality: number;
  readonly grades: Readonly<Record<GradeTier, number>>;
}

export interface WorkOn {
  readonly moveId: string;
  readonly name: string;
  /** One line on how to make it better. */
  readonly line: string;
  /** True when every repetition of the session was Great or better: this is the move to sharpen, not one that failed. */
  readonly sharpen: boolean;
}

export interface DojoSummary {
  readonly reps: readonly DojoRep[];
  readonly points: number;
  /** What every repetition Excellent would have earned. */
  readonly maxPoints: number;
  readonly grades: Readonly<Record<GradeTier, number>>;
  /** One report per move, in the order trained. */
  readonly moves: readonly MoveReport[];
  /** The move with the highest average; null when nothing counted. */
  readonly best: MoveReport | null;
  /** At most three moves, weakest first. Empty when every repetition was Excellent. */
  readonly workOn: readonly WorkOn[];
  /** 0 to 1, and the same level words the warm-up uses. */
  readonly skill: number;
  readonly level: SkillLevel;
}

const count = (reps: readonly DojoRep[]): Record<GradeTier, number> => ({
  excellent: reps.filter((rep) => rep.grade.tier === "excellent").length,
  good: reps.filter((rep) => rep.grade.tier === "good").length,
  needs_work: reps.filter((rep) => rep.grade.tier === "needs_work").length,
});
const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

/** What each grade is worth toward the skill number. */
export const SKILL_VALUE: Readonly<Record<GradeTier, number>> = { excellent: 1, good: 0.6, needs_work: 0 };

/**
 * One number for the session, 0 to 1 (the mean of SKILL_VALUE over the repetitions), and the warm-up's level for it:
 * beginner under 0.4, average under 0.75, good from there. No repetitions: 0.5 and average, so nothing is tuned.
 */
export function skillFrom(session: { readonly reps: readonly DojoRep[] }): { skill: number; level: SkillLevel } {
  if (session.reps.length === 0) return { skill: 0.5, level: "average" };
  const skill = mean(session.reps.map((rep) => SKILL_VALUE[rep.grade.tier]));
  return { skill, level: skill < BEGINNER_BELOW ? "beginner" : skill < AVERAGE_BELOW ? "average" : "good" };
}

/** The line for a move in the work-on list: the tip for the part that was weak most often, else how the move is done. */
function howTo(reps: readonly DojoRep[], move: MoveDef | undefined): string {
  const missed = reps.filter((rep) => rep.grade.tier === "needs_work");
  // What went wrong on the misses says more than what was a little weak on the good ones.
  const tip = summarise((missed.length > 0 ? missed : reps).map((rep) => rep.result)).tip;
  return tip ?? move?.hint ?? PRACTICE_TIPS.strike.tip;
}

/** Sums up a session, or the part of one played so far. */
export function summariseDojo(reps: readonly DojoRep[], moveOf: Lookup = registry): DojoSummary {
  const ids = [...new Set(reps.map((rep) => rep.moveId))];
  const of = (id: string): DojoRep[] => reps.filter((rep) => rep.moveId === id);
  const moves: MoveReport[] = ids.map((id) => {
    const own = of(id);
    const points = own.reduce((sum, rep) => sum + rep.grade.points, 0);
    return {
      moveId: id, name: moveOf(id)?.name ?? id, reps: own.length, points, average: points / own.length,
      meanQuality: mean(own.map((rep) => rep.quality)), grades: count(own),
    };
  });
  // Weakest first; on a tie the lower quality, then the order trained.
  const weakestFirst = [...moves].sort((a, b) => a.average - b.average || a.meanQuality - b.meanQuality);
  const strongestFirst = [...moves].sort((a, b) => b.average - a.average || b.meanQuality - a.meanQuality);
  const grades = count(reps);
  const line = (report: MoveReport, sharpen: boolean): WorkOn =>
    ({ moveId: report.moveId, name: report.name, line: howTo(of(report.moveId), moveOf(report.moveId)), sharpen });
  const missed = weakestFirst.filter((report) => report.grades.needs_work > 0);
  const weakest = weakestFirst[0];
  const workOn = missed.length > 0
    ? missed.slice(0, 3).map((report) => line(report, false))
    : weakest && grades.good > 0 ? [line(weakest, true)] : [];
  return {
    reps, points: reps.reduce((sum, rep) => sum + rep.grade.points, 0), maxPoints: reps.length * POINTS.excellent,
    grades, moves, best: grades.excellent + grades.good > 0 ? (strongestFirst[0] ?? null) : null, workOn, ...skillFrom({ reps }),
  };
}

/** The headline for the end screen. */
export function closingLine(summary: DojoSummary): string {
  if (summary.reps.length === 0) return "No repetitions yet.";
  if (summary.grades.needs_work === 0 && summary.grades.good === 0) return "Every one excellent. Nothing to fix.";
  if (summary.grades.needs_work === 0) return "Every one counted. Now sharpen the weakest.";
  if (summary.best === null) return "None counted yet. Slow down and make each move big and clear.";
  return "Good work. Here is what to practise next.";
}

const median = (values: readonly number[]): number | null => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
};
const short = (text: string, most: number): string => (text.length <= most ? text : `${text.slice(0, most - 1).trimEnd()}…`);

/**
 * The session as the warm-up's `Assessment`, so `tuneFor` (src/coach/warmup.ts) can tune the monsters from training
 * the way it does from a warm-up. One step per move: seen when more than half its repetitions counted, with the
 * middle reaction time and the mean quality. The focus is the work-on list (not the "to sharpen" one), at most two.
 * No habits are read here.
 */
export function assessmentFrom(session: { readonly reps: readonly DojoRep[]; readonly goMs?: number }, moveOf: Lookup = registry): Assessment {
  const summary = summariseDojo(session.reps, moveOf);
  const steps: StepResult[] = summary.moves.map((report) => {
    const own = session.reps.filter((rep) => rep.moveId === report.moveId);
    const counted = own.filter((rep) => rep.result.counted);
    const done = counted.length * 2 > own.length;
    const reactMs = done ? (median(counted.flatMap((rep) => (rep.reactMs === null ? [] : [rep.reactMs]))) ?? 0) : null;
    return {
      step: { id: report.moveId, moveId: report.moveId, say: short(report.name, 40), ms: session.goMs ?? DOJO_DEFAULTS.goMs },
      done, reactMs, quality: done ? finite(mean(counted.map((rep) => rep.quality))) : 0,
    };
  });
  const focus: Focus[] = summary.workOn.filter((each) => !each.sharpen).slice(0, 2).map((each) => ({ moveId: each.moveId, tip: short(each.line, 90) }));
  const strong = summary.moves
    .filter((report) => mean(session.reps.filter((rep) => rep.moveId === report.moveId).map((rep) => SKILL_VALUE[rep.grade.tier])) >= STRONG_FROM)
    .map((report) => report.moveId);
  return { level: summary.level, focus, strong, habits: [], steps };
}

/** What a session changes in the fights: the warning before an attack against the usual (1.25 is a quarter more), and the defends the monsters ask for more often. */
export interface Tuning {
  readonly warning: number;
  readonly more: readonly string[];
}

/** The words for the defends in the tuning line, in the order they are said. Both dodges are one word. */
const DEFEND_WORDS: readonly (readonly [string, string])[] = [["block", "block"], ["duck", "duck"], ["dodge_left", "dodge"], ["dodge_right", "dodge"]];

/**
 * What `tuneFor` does to these enemies for this assessment, read off its own output and not off its rules: the
 * warning is all the tuned warning times over all the plain ones, and a defend is in `more` when an attack it stops
 * got a heavier weight on any enemy. Hand it the assessment the game keeps (`assessmentFrom` of the session).
 */
export function tuningOf(assessment: Assessment, enemies: readonly EnemySpec[]): Tuning {
  let plainMs = 0;
  let tunedMs = 0;
  const raised = new Set<string>();
  for (const enemy of enemies) {
    const tuned = tuneFor(enemy, assessment);
    enemy.attacks.forEach((attack, index) => {
      const now = tuned.attacks[index] ?? attack;
      plainMs += attack.telegraphMs;
      tunedMs += now.telegraphMs;
      if ((now.weight ?? 1) > (attack.weight ?? 1)) raised.add(attack.counter);
    });
  }
  const more = [...new Set(DEFEND_WORDS.filter(([id]) => raised.has(id)).map(([, word]) => word))];
  return { warning: plainMs > 0 ? tunedMs / plainMs : 1, more };
}

/** One plain line for the end screen: what this session changes in the fights. */
export function tuningLine(assessment: Assessment, enemies: readonly EnemySpec[]): string {
  const { warning, more } = tuningOf(assessment, enemies);
  const percent = Math.round((warning - 1) * 100);
  const pace = percent > 0
    ? `Monsters will swing slower for you: ${String(percent)}% more warning before every attack.`
    : percent < 0
      ? `Monsters will swing faster for you: ${String(-percent)}% less warning before every attack.`
      : "Monsters will fight at the usual pace.";
  if (more.length === 0) return pace;
  const last = more[more.length - 1] ?? "";
  const list = more.length === 1 ? last : `${more.slice(0, -1).join(", ")} or ${last}`;
  return `${pace} Expect more attacks you have to ${list}.`;
}
