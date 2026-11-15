// "What you practised" after a fight (issue #160, part 2). Pure: it reads the fight's events and returns data.
// No screen here. Each attack the monster warned of ends in exactly one `defended` or `playerHit`; the one
// exception is a fight that ends while a warning is still up (the god move can do that), and that attack is
// not counted at all: it was neither defended nor missed.
import type { CombatEvent, EnemyAttack } from "../core/types";
import { MOVES } from "../moves/registry";

/** One defend move the fight asked for. */
export interface DefenceLesson {
  readonly moveId: string;
  readonly name: string;
  /** What the move is for in real self-defense; empty if the move is not in the registry. */
  readonly teaches: string;
  /** Times it stopped the attack. */
  readonly worked: number;
  /** Times the attack it should have stopped landed. */
  readonly missed: number;
  /** What it answered, each once, in the order met: the real situation where one is known, the attack's name otherwise. */
  readonly answered: readonly string[];
}

/** One strike the player landed. */
export interface StrikeLesson {
  readonly moveId: string;
  readonly name: string;
  readonly teaches: string;
  /** Times it landed, the finishing move included. */
  readonly landed: number;
  /** Best quality of a landed strike, 0 to 1. The finishing move has no quality and counts as 0. */
  readonly bestQuality: number;
}

export interface Lessons {
  /** Attacks that ran their course: defended plus landed. */
  readonly attacksSeen: number;
  readonly attacksDefended: number;
  /** Most attacks in a row defended with none landing in between. */
  readonly longestCleanRun: number;
  readonly defences: readonly DefenceLesson[];
  readonly strikes: readonly StrikeLesson[];
  /** The defence with the highest share that worked, of those tried at least twice. */
  readonly best: DefenceLesson | null;
  /** The defence with the lowest share that worked, of those tried at least twice; null if nothing got through. */
  readonly workOn: DefenceLesson | null;
  /** Three or four plain sentences for a result screen (one if no attack was seen), each at most 140 characters, so a move's whole teaches line fits. */
  readonly lines: readonly string[];
}

export const MAX_LINE = 140;
const MIN_TRIES = 2;
const NEUTRAL = "No attacks to learn from yet. Step in, watch for the warning, and move.";
const CLEAN = "Nothing got through. Seeing it early and moving is what gets you home.";
const CLOSING = "Every attack you see coming is one you can move away from. The first choice is always to leave.";

interface Tally {
  worked: number;
  missed: number;
  answered: string[];
}

function known(moveId: string): { name: string; teaches: string } {
  const move = MOVES.get(moveId);
  return { name: move?.name ?? moveId, teaches: move?.teaches ?? "" };
}

function rate(lesson: DefenceLesson): number {
  return lesson.worked / (lesson.worked + lesson.missed);
}

function times(count: number): string {
  return count === 1 ? "1 time" : `${String(count)} times`;
}

/** `lead` plus as much of `rest` as fits in MAX_LINE, cut at a word and never mid-word. */
function fit(lead: string, rest: string): string {
  const body = rest.trim().replace(/\.$/, "");
  if (body === "") return lead.trim().replace(/[:.]$/, "") + ".";
  const whole = `${lead}${body}.`;
  if (whole.length <= MAX_LINE) return whole;
  const room = MAX_LINE - lead.length - 3;
  const words = body.split(" ");
  let kept = "";
  for (const word of words) {
    const next = kept === "" ? word : `${kept} ${word}`;
    if (next.length > room) break;
    kept = next;
  }
  return kept === "" ? lead.trim().replace(/[:.]$/, "") + "." : `${lead}${kept.replace(/[,;:]$/, "")}...`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function linesFor(
  seen: number,
  defended: number,
  run: number,
  best: DefenceLesson | null,
  workOn: DefenceLesson | null,
  mostTried: DefenceLesson | undefined,
): string[] {
  if (seen === 0) return [NEUTRAL];
  const lines = [
    seen === 1
      ? `You saw 1 attack and ${defended === 1 ? "got out of its way" : "it caught you. Now you know its warning"}.`
      : `You saw ${String(seen)} attacks and got out of the way of ${String(defended)}.`,
  ];
  if (best && best !== workOn) {
    const tries = best.worked + best.missed;
    const held = `Your ${best.name.toLowerCase()} held ${String(best.worked)} of ${times(tries)}`;
    // A teaches line with a colon of its own reads better as its own sentence.
    lines.push(best.teaches.includes(":") ? fit(`${held}. `, best.teaches) : fit(`${held}: `, lowerFirst(best.teaches)));
  }
  if (workOn) lines.push(fit(`Work on: ${workOn.name.toLowerCase()}. `, workOn.teaches));
  else if (defended === seen) lines.push(CLEAN);
  if (run >= 2) lines.push(`Your longest run without being hit: ${String(run)} attacks in a row.`);
  // Too little to judge any one move: name the one that came up most, so there is still something to take away.
  if (lines.length < 2 && mostTried) lines.push(fit(`Remember the ${mostTried.name.toLowerCase()}: `, lowerFirst(mostTried.teaches)));
  if (lines.length < 3) lines.push(CLOSING);
  return lines;
}

/**
 * What the player practised in one fight. `situation` may give the real situation an attack stands for
 * (part 1 of issue #160); when it returns a line, that line is listed in `answered` in place of the attack's name.
 */
export function lessonsFrom(
  events: readonly CombatEvent[],
  situation?: (attack: EnemyAttack) => string | null,
): Lessons {
  const tallies = new Map<string, Tally>();
  const landed = new Map<string, { landed: number; bestQuality: number }>();
  let attacksDefended = 0;
  let attacksHit = 0;
  let run = 0;
  let longestCleanRun = 0;

  const tallyFor = (attack: EnemyAttack): Tally => {
    const tally = tallies.get(attack.counter) ?? { worked: 0, missed: 0, answered: [] };
    tallies.set(attack.counter, tally);
    const what = situation?.(attack) ?? attack.name;
    if (!tally.answered.includes(what)) tally.answered.push(what);
    return tally;
  };
  const strike = (moveId: string, quality: number): void => {
    const entry = landed.get(moveId) ?? { landed: 0, bestQuality: 0 };
    landed.set(moveId, { landed: entry.landed + 1, bestQuality: Math.max(entry.bestQuality, quality) });
  };

  for (const event of events) {
    if (event.type === "defended") {
      tallyFor(event.attack).worked += 1;
      attacksDefended += 1;
      run += 1;
      longestCleanRun = Math.max(longestCleanRun, run);
    } else if (event.type === "playerHit") {
      tallyFor(event.attack).missed += 1;
      attacksHit += 1;
      run = 0;
    } else if (event.type === "enemyHit") {
      strike(event.move, Math.min(1, Math.max(0, event.quality)));
    } else if (event.type === "finished") {
      strike(event.move, 0);
    }
  }

  const defences: DefenceLesson[] = [...tallies].map(([moveId, tally]) => ({
    moveId,
    ...known(moveId),
    worked: tally.worked,
    missed: tally.missed,
    answered: tally.answered,
  }));
  const strikes: StrikeLesson[] = [...landed].map(([moveId, entry]) => ({ moveId, ...known(moveId), ...entry }));

  // Ties go to the move tried more often, then to the one met first.
  const tried = defences.filter((lesson) => lesson.worked + lesson.missed >= MIN_TRIES);
  let best: DefenceLesson | null = null;
  let workOn: DefenceLesson | null = null;
  for (const lesson of tried) {
    const tries = lesson.worked + lesson.missed;
    if (!best || rate(lesson) > rate(best) || (rate(lesson) === rate(best) && tries > best.worked + best.missed)) {
      best = lesson;
    }
    if (lesson.missed === 0) continue;
    if (!workOn || rate(lesson) < rate(workOn) || (rate(lesson) === rate(workOn) && tries > workOn.worked + workOn.missed)) {
      workOn = lesson;
    }
  }

  const attacksSeen = attacksDefended + attacksHit;
  const mostTried = [...defences].sort((a, b) => b.worked + b.missed - (a.worked + a.missed))[0];
  return {
    attacksSeen,
    attacksDefended,
    longestCleanRun,
    defences,
    strikes,
    best,
    workOn,
    lines: linesFor(attacksSeen, attacksDefended, longestCleanRun, best, workOn, mostTried),
  };
}
