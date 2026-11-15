// The skill check at the start of the game: a 15-second warm-up, what it says about the player, and the
// monster tuned for that player. Pure: frames in, an assessment out. Every number here is a first guess,
// not yet tuned on a real body. docs/warmup.md has the rule in plain words.
import type { EnemyAttack, EnemySpec } from "../core/types";
import { MOVES } from "../moves/registry";
import { EMPTY_HISTORY, clamp01, pushFrame } from "../pose/signals";
import type { Assess, Assessment, Focus, SkillLevel, StepResult, WarmupStep } from "./contract";
import { scoreWarmup } from "./habits";
import type { DefenseId, Habit } from "./habits";
import { trainOn } from "./train";

const STEP_MS = 2500;

/** What the warm-up asks for, in order: the two basic punches, then the four defenses. 15 seconds in all. */
export const WARMUP_STEPS: readonly WarmupStep[] = [
  { id: "jab", moveId: "jab", say: "Jab: left fist out to keep space", ms: STEP_MS },
  { id: "cross", moveId: "cross", say: "Cross: right fist, your power hand", ms: STEP_MS },
  { id: "block", moveId: "block", say: "Block: fists up to cover your head", ms: STEP_MS },
  { id: "dodge_left", moveId: "dodge_left", say: "Dodge left: step off the line", ms: STEP_MS },
  { id: "dodge_right", moveId: "dodge_right", say: "Dodge right: step off the line", ms: STEP_MS },
  { id: "duck", moveId: "duck", say: "Duck: drop low under a swing", ms: STEP_MS },
];

/** A move counts as seen at this confidence: the same line the fight uses (src/input/poseInput.ts). */
const ON = 0.7;
/** A move made this soon after its step starts gets full marks for speed; one at SLOW_MS or later gets none. */
export const FAST_MS = 700;
export const SLOW_MS = 2000;
/** The mean step score under which the player is a beginner, and under which they are average. */
export const BEGINNER_BELOW = 0.4;
export const AVERAGE_BELOW = 0.75;
/** A move scoring under this is worth working on; one at STRONG_FROM or over is already strong. */
export const FOCUS_BELOW = 0.6;
export const STRONG_FROM = 0.8;
/** What the level does to every attack's warning time. */
export const TELEGRAPH_SCALE: Record<SkillLevel, number> = { beginner: 1.25, average: 1, good: 0.85 };

const DEFENSES: readonly string[] = ["block", "duck", "dodge_left", "dodge_right"] satisfies readonly DefenseId[];
const OTHER_SIDE: Readonly<Record<string, string>> = { dodge_left: "dodge_right", dodge_right: "dodge_left" };

/** One line per move, written for self-defense. A move not listed here uses its own hint. */
const TIPS: Readonly<Record<string, string>> = {
  jab: "Snap your left fist straight out from your chin, then pull it straight back.",
  cross: "Drive your right fist straight out, turn your hip into it, then guard again.",
  block: "Bring both hands up to your face before anything else.",
  duck: "Bend your knees to drop under a swing, and keep your eyes on what is coming.",
  dodge_left: "Step your whole body to your left, off the line of the attack.",
  dodge_right: "Step your whole body to your right, off the line of the attack.",
};
const TIP_BOTH_SIDES = "Step your whole body off the line of the attack, to either side.";

/**
 * How well one step went, 0 to 1. Not seen: 0. Seen: 0.4, plus up to 0.3 for speed (all of it at FAST_MS
 * or sooner, none at SLOW_MS or later) and up to 0.3 for how well the move was made.
 */
export function stepScore(result: StepResult): number {
  if (!result.done || result.reactMs === null) return 0;
  const speed = clamp01((SLOW_MS - result.reactMs) / (SLOW_MS - FAST_MS));
  return 0.4 + 0.3 * speed + 0.3 * (Number.isFinite(result.quality) ? clamp01(result.quality) : 0);
}

/** The lowest score each move got, by move id, in warm-up order. */
function moveScores(steps: readonly StepResult[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const result of steps) {
    const id = result.step.moveId;
    scores.set(id, Math.min(scores.get(id) ?? 1, stepScore(result)));
  }
  return scores;
}

/** True when this focus stands for both side steps: it is a dodge and the other side was weak too. */
function bothSides(focus: Focus, scores: ReadonlyMap<string, number>): boolean {
  const other = OTHER_SIDE[focus.moveId];
  return other !== undefined && (scores.get(other) ?? 1) < FOCUS_BELOW;
}

/**
 * Plays the frames through the real move detectors, one step's time window after another, and says what
 * the player can do. Frames before `startedAtMs` are the player standing still: they are fed first, because
 * the dodges and the duck are measured against that stance.
 */
export const assessWarmup: Assess = (frames, startedAtMs, steps) => {
  const ordered = frames.filter((frame) => Number.isFinite(frame.t)).sort((a, b) => a.t - b.t);
  let history = EMPTY_HISTORY;
  let next = 0;
  let stepStart = startedAtMs;
  const results: StepResult[] = [];
  for (const step of steps) {
    const move = MOVES.get(step.moveId);
    let reactMs: number | null = null;
    let thrown: number | null = null;
    let peak = 0;
    for (let frame = ordered[next]; frame && frame.t < stepStart + step.ms; frame = ordered[next]) {
      next += 1;
      history = pushFrame(history, frame);
      if (!move || frame.t < stepStart) continue;
      const confidence = move.detect(history);
      peak = Math.max(peak, confidence);
      if (reactMs === null && confidence >= ON) {
        reactMs = frame.t - stepStart;
        thrown = move.quality?.(history) ?? null;
      }
    }
    const done = reactMs !== null;
    // A strike says how well it was thrown; a defense is as good as the surest the detector got.
    const quality = done ? clamp01(thrown ?? peak) : 0;
    results.push({ step, done, reactMs, quality: Number.isFinite(quality) ? quality : 0 });
    stepStart += step.ms;
  }

  const scores = moveScores(results);
  const mean = results.reduce((sum, result) => sum + stepScore(result), 0) / Math.max(1, results.length);
  const level: SkillLevel =
    !results.some((result) => result.done) || mean < BEGINNER_BELOW ? "beginner" : mean < AVERAGE_BELOW ? "average" : "good";

  // Weakest first. On a tie a defense comes before a punch (staying safe is learned first), then warm-up order.
  const weak = [...scores]
    .filter(([, score]) => score < FOCUS_BELOW)
    .sort((a, b) => a[1] - b[1] || Number(DEFENSES.includes(b[0])) - Number(DEFENSES.includes(a[0])));
  const focus: Focus[] = [];
  for (const [moveId] of weak) {
    // Both side steps weak is one thing to work on, not two.
    if (focus.some((picked) => OTHER_SIDE[picked.moveId] === moveId)) continue;
    const other = OTHER_SIDE[moveId];
    const both = other !== undefined && weak.some(([id]) => id === other);
    focus.push({ moveId, tip: both ? TIP_BOTH_SIDES : (TIPS[moveId] ?? MOVES.get(moveId)?.hint ?? "") });
  }
  return {
    level,
    focus: focus.slice(0, 2),
    strong: [...scores].filter(([, score]) => score >= STRONG_FROM).map(([id]) => id),
    habits: scoreWarmup(ordered),
    steps: results,
  };
};

/** What keyboard-only play uses: no warm-up was made, so the fights are the normal ones. */
export const SKIPPED: Assessment = { level: "average", focus: [], strong: [], habits: [], steps: [] };

/** The defenses the focus asks for, with how weak each is (1 is never seen). Punches change no attack weights. */
function focusNeeds(assessment: Assessment): Pick<Habit, "trains" | "severity">[] {
  const scores = moveScores(assessment.steps);
  const needs = new Map<string, number>();
  for (const focus of assessment.focus) {
    needs.set(focus.moveId, 1 - (scores.get(focus.moveId) ?? 0));
    const other = OTHER_SIDE[focus.moveId];
    if (other !== undefined && bothSides(focus, scores)) needs.set(other, 1 - (scores.get(other) ?? 0));
  }
  return [...needs]
    .filter((need): need is [DefenseId, number] => DEFENSES.includes(need[0]))
    .map(([trains, severity]) => ({ trains, severity }));
}

/**
 * The enemy for this player. A beginner gets 1.25 times the warning before every attack, a good player
 * 0.85 times, an average one the same. Then attack weights lean toward the attacks stopped by the focus
 * moves and by what the habits train (`trainOn`, capped at MAX_LEAN). Only `telegraphMs` and `weight`
 * ever change. With nothing to change (SKIPPED, or an average player with no weak spot) the same object
 * comes back.
 */
export function tuneFor(enemy: EnemySpec, assessment: Assessment): EnemySpec {
  const scale = TELEGRAPH_SCALE[assessment.level];
  const needs = [...assessment.habits, ...focusNeeds(assessment)];
  if (scale === 1 && needs.length === 0) return enemy;
  const leaned = trainOn(enemy, needs);
  if (scale === 1) return leaned;
  const timed = (attack: EnemyAttack): EnemyAttack => ({ ...attack, telegraphMs: Math.round(attack.telegraphMs * scale) });
  const [first, ...rest] = leaned.attacks;
  return { ...leaned, attacks: [timed(first), ...rest.map(timed)] };
}

const LEVEL_LINE: Record<SkillLevel, string> = {
  beginner: "Level: beginner. Fights will give you more warning.",
  average: "Level: average. Fights run at the normal speed.",
  good: "Level: good. Fights will give you less warning.",
};

const nameOf = (moveId: string): string => MOVES.get(moveId)?.name ?? moveId;

/** Two or three plain lines for the screen: the level, what to work on, and what is already strong. */
export function summary(assessment: Assessment): string[] {
  const lines = [LEVEL_LINE[assessment.level]];
  if (assessment.steps.length === 0) return [...lines, "No warm-up, so the fights are the usual ones."];
  const scores = moveScores(assessment.steps);
  const work = assessment.focus.map((focus) => (bothSides(focus, scores) ? "Dodge" : nameOf(focus.moveId)));
  lines.push(work.length > 0 ? `Work on: ${work.join(", ")}.` : "Nothing to fix first. Keep it up.");
  if (assessment.strong.length > 0) lines.push(`Already strong: ${assessment.strong.map(nameOf).join(", ")}.`);
  return lines;
}
