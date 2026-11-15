// The report card at the end of a fight: one row per move the fight asked for, with a grade, points and the
// one thing to work on. Pure: it reads the fight's events (and, when the fight kept them, the per-move
// feedback results) and returns data. No screen here. docs/report-card.md has the rules and the table of lines.
import type { CombatEvent } from "../core/types";
import { MOVES } from "../moves/registry";

export type CardGrade = "EXCELLENT" | "GREAT" | "NEEDS IMPROVEMENT";

/** One per-move feedback result from the fight (the pop-up shown as a move counts). Any grade word is taken; only points and tip are read. */
export interface MoveFeedback {
  readonly move: string;
  readonly grade: string;
  readonly points: number;
  readonly tip?: string | null;
}

/**
 * Where a grade starts, on a 0 to 1 quality, best first. Below the last line: NEEDS IMPROVEMENT.
 * The one place to change when the per-move grade's own lines should be used instead.
 */
export const GRADE_LINES: readonly (readonly [number, CardGrade])[] = [[0.85, "EXCELLENT"], [0.6, "GREAT"]];

/** Points for one counted move of each grade: the Training Dojo's own (POINTS in src/coach/grade.ts). */
export const GRADE_POINTS: Readonly<Record<CardGrade, number>> = { EXCELLENT: 150, GREAT: 100, "NEEDS IMPROVEMENT": 25 };

/** Points for one attack stopped. A defend has no quality of its own, so each one earns the middle grade's points. */
export const DEFEND_POINTS = GRADE_POINTS.GREAT;

/** A work-on line has to fit one row of the result panel. */
export const WORK_ON_MAX = 48;

/**
 * The one thing to work on for each move in the registry, strikes and defends, used when the fight kept no
 * measured tip for the move. No move name in the line: the row shows it.
 */
export const WORK_ON: Readonly<Record<string, string>> = {
  aegis_push: "Push both palms out together from your chest",
  block: "Fists up by your cheeks, elbows tucked in",
  chain_punch: "Send the second punch right behind the first",
  cross: "Turn your hips and drive the right fist out",
  dodge_left: "Step your feet left, don't just lean",
  dodge_right: "Step your feet right, don't just lean",
  double_palm: "Keep both palms side by side at chest height",
  duck: "Bend your knees to drop, keep your back up",
  front_kick: "Lift the knee first, then snap the foot out",
  hammer_fist: "Raise the fist above your head before it drops",
  hook: "Keep the elbow bent, level with your shoulder",
  jab: "Snap the hand straight back to your chin",
  jump: "Hop off both feet and land soft on bent knees",
  knee: "Drive the knee up high, foot tucked under it",
  knife_hand: "Chop out flat at neck height, palm down",
  moon_arrow: "Hold the front arm level as you draw and loose",
  overhead_strike: "Reach the hand high first, then chop right down",
  reverse_punch: "Pull the left fist to your hip as you punch",
  rising_palm: "Drive the palm heel up to chin height",
  spear_thrust: "Keep both hands together as you drive forward",
  stake_thrust: "Grip at your chest, then drive forward and down",
  sun_burst: "Hands meet at your chest, then fling arms wide",
  swift_dash: "Take one quick full step, not a lean",
  thunderbolt: "Hand right over your head, then throw it down",
  trident_sweep: "Sweep both arms across together, chest height",
  uppercut: "Drop the fist to your waist, then punch up",
};

/** For a move with no line of its own (one that is not in the registry). */
export const WORK_ON_DEFAULT = "Make the whole move, then back to your guard";

/** One move the fight asked for. */
export interface MoveCard {
  readonly moveId: string;
  readonly name: string;
  readonly kind: "strike" | "defend";
  /** Strike: openings that called for it. Defend: attacks it should have stopped that ran their course. */
  readonly asked: number;
  /** Strike: times it landed (the finishing blow included). Defend: times it stopped the attack. */
  readonly done: number;
  /** 0 to 1 over the times asked. Strike: the quality of each one landed, a miss counting 0. Defend: the share stopped. */
  readonly quality: number;
  readonly grade: CardGrade;
  readonly points: number;
  /** The fight's most frequent tip for this move when it kept one, else the move's line from WORK_ON. */
  readonly workOn: string;
}

export interface ReportCard {
  /** Weakest first: by grade, then quality, then move id. */
  readonly moves: readonly MoveCard[];
  /** null for a fight that asked for no move. */
  readonly grade: CardGrade | null;
  readonly points: number;
  readonly best: MoveCard | null;
  /** The weakest move: `moves[0]`. */
  readonly workOnNext: MoveCard | null;
  /** "Dodge left: step your feet left, don't just lean", or "" when there is nothing to work on. */
  readonly workOnLine: string;
}

const RANK: Readonly<Record<CardGrade, number>> = { "NEEDS IMPROVEMENT": 0, GREAT: 1, EXCELLENT: 2 };
const BY_RANK: readonly CardGrade[] = ["NEEDS IMPROVEMENT", "GREAT", "EXCELLENT"];

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** The grade for a 0 to 1 quality, by GRADE_LINES. */
export function gradeForQuality(quality: number): CardGrade {
  return GRADE_LINES.find(([line]) => quality >= line)?.[1] ?? "NEEDS IMPROVEMENT";
}

/** The grade whose points are nearest; halfway goes to the lower grade. */
function gradeForPoints(points: number): CardGrade {
  let best: CardGrade = "NEEDS IMPROVEMENT";
  for (const grade of BY_RANK) {
    if (Math.abs(GRADE_POINTS[grade] - points) < Math.abs(GRADE_POINTS[best] - points)) best = grade;
  }
  return best;
}

/** The tip given most often; a tie goes to the one met first. null when no result had one. */
function topTip(results: readonly MoveFeedback[]): string | null {
  const counts = new Map<string, number>();
  for (const result of results) {
    const tip = result.tip?.trim();
    if (tip) counts.set(tip, (counts.get(tip) ?? 0) + 1);
  }
  let top: string | null = null;
  for (const [tip, count] of counts) {
    if (top === null || count > (counts.get(top) ?? 0)) top = tip;
  }
  return top;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

interface Tally {
  kind: "strike" | "defend";
  asked: number;
  done: number;
  /** Sum of the quality of each one done. */
  quality: number;
  points: number;
}

/**
 * The fight's report card. `feedback` is every per-move feedback result the fight showed, in any order; a move
 * that has results takes its points, grade and tip from them, and every other move is graded from the events.
 */
export function reportCard(events: readonly CombatEvent[], feedback: readonly MoveFeedback[] = []): ReportCard {
  const tallies = new Map<string, Tally>();
  const tallyFor = (moveId: string, kind: "strike" | "defend"): Tally => {
    const tally = tallies.get(moveId) ?? { kind, asked: 0, done: 0, quality: 0, points: 0 };
    tallies.set(moveId, tally);
    return tally;
  };
  const land = (moveId: string, quality: number): void => {
    const tally = tallyFor(moveId, "strike");
    tally.done += 1;
    tally.quality += quality;
    tally.points += GRADE_POINTS[gradeForQuality(quality)];
  };

  for (const event of events) {
    if (event.type === "opening") {
      tallyFor(event.move, "strike").asked += 1;
    } else if (event.type === "enemyHit") {
      land(event.move, clamp01(event.quality));
    } else if (event.type === "finished") {
      // The finishing blow is asked for with no opening and has no quality: landing it is all there is to it.
      tallyFor(event.move, "strike").asked += 1;
      land(event.move, 1);
    } else if (event.type === "defended" || event.type === "playerHit") {
      const tally = tallyFor(event.attack.counter, "defend");
      tally.asked += 1;
      if (event.type === "defended") {
        tally.done += 1;
        tally.quality += 1;
        tally.points += DEFEND_POINTS;
      }
    }
  }

  const results = new Map<string, MoveFeedback[]>();
  for (const result of feedback) results.set(result.move, [...(results.get(result.move) ?? []), result]);
  // A move the fight's events never show but that has results still gets a row.
  for (const moveId of results.keys()) tallyFor(moveId, MOVES.get(moveId)?.kind ?? "strike");

  const moves: MoveCard[] = [...tallies].map(([moveId, tally]) => {
    const mine = results.get(moveId) ?? [];
    // A strike can land without an opening of its own in the list (a list cut short): it was still asked for.
    const asked = Math.max(tally.asked, tally.done, mine.length);
    const done = Math.max(tally.done, mine.length);
    const quality = asked === 0 ? 0 : clamp01(tally.quality / asked);
    const points = mine.length > 0 ? mine.reduce((sum, result) => sum + result.points, 0) : tally.points;
    return {
      moveId,
      name: MOVES.get(moveId)?.name ?? moveId,
      kind: tally.kind,
      asked,
      done,
      quality,
      grade: mine.length > 0 ? gradeForPoints(points / asked) : gradeForQuality(quality),
      points,
      workOn: topTip(mine) ?? WORK_ON[moveId] ?? WORK_ON_DEFAULT,
    };
  });
  moves.sort((a, b) => RANK[a.grade] - RANK[b.grade] || a.quality - b.quality || (a.moveId < b.moveId ? -1 : 1));

  const totalAsked = moves.reduce((sum, move) => sum + move.asked, 0);
  const meanRank = totalAsked === 0 ? 0 : moves.reduce((sum, move) => sum + RANK[move.grade] * move.asked, 0) / totalAsked;
  // Halfway between two grades goes to the lower one.
  const grade = moves.length === 0 ? null : BY_RANK[Math.ceil(meanRank - 0.5)] ?? "NEEDS IMPROVEMENT";
  let best: MoveCard | null = null;
  for (const move of moves) {
    if (!best || RANK[move.grade] > RANK[best.grade] || (move.grade === best.grade && move.quality > best.quality)) best = move;
  }
  const workOnNext = moves[0] ?? null;
  return {
    moves,
    grade,
    points: moves.reduce((sum, move) => sum + move.points, 0),
    best,
    workOnNext,
    workOnLine: workOnNext ? `${workOnNext.name}: ${lowerFirst(workOnNext.workOn)}` : "",
  };
}
