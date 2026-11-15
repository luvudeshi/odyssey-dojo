// What the training dojo can train, and the list a player ticks before a session (docs/dojo.md, "Choosing what to
// practise"). The moves are the game's own (src/moves/registry) plus the ones only the dojo knows (./extra); the
// styles are the game's (src/styles/registry) plus the dojo's own. Pure: lists in, lists out. Nothing here is read by
// the fights, so a move or a style added in ./extra never reaches them.
import { POWER_MOVES } from "../combat/engine";
import type { Baseline, MoveDef, PoseFrame } from "../core/types";
import { KICK_IDS } from "../moves/legSignals";
import { MEASURES } from "../moves/measures";
import { MOVES } from "../moves/registry";
import { NEEDS_LEGS } from "../moves/waistUp";
import { STYLES } from "../styles/registry";
import { COACHING, faultOf, praiseFor } from "./coaching";
import { EXTRA_MEASURES, EXTRA_MOVES, EXTRA_NEEDS_LEGS, EXTRA_STYLES, EXTRA_TIPS, extraGuideFor, judgeExtraRep } from "./extra";
import type { DojoStyleDef } from "./extra";
import { guideFor } from "./guide";
import { currentStyleId } from "../styles/oldIds";
import type { Guide } from "./guide";
import { PRACTICE_TIPS, judgeRep } from "./practice";
import type { RepResult } from "./practice";

export type { DojoStyleDef } from "./extra";

/** The four defends every style trains after its strikes. */
export const DOJO_DEFENDS: readonly string[] = ["block", "duck", "dodge_left", "dodge_right"];
/** The repetition counts the setup step offers. */
export const REPS_CHOICES: readonly number[] = [1, 3, 5];
/** Said with every leg move: the camera has to see the legs to count them. */
export const WHOLE_BODY_NOTE = "Kicks and knees need your whole body in view: step back until the camera sees your feet.";

/** The moves and styles only the dojo knows. A test hands in its own; left out, the ones in ./extra. */
export interface DojoExtras {
  readonly moves?: readonly MoveDef[];
  readonly styles?: readonly DojoStyleDef[];
}

/** A move by its id: the game's own first, then the dojo's extra ones. */
export function dojoMoveOf(id: string, extraMoves: readonly MoveDef[] = EXTRA_MOVES): MoveDef | undefined {
  return MOVES.get(id) ?? extraMoves.find((move) => move.id === id);
}

/** Every style the dojo can train: the game's, then the dojo's own. A second style with an id already seen is left out. */
export function dojoStyles(extraStyles: readonly DojoStyleDef[] = EXTRA_STYLES): DojoStyleDef[] {
  const all = [...STYLES.map((style): DojoStyleDef => ({ id: style.id, name: style.name, line: style.blurb, strikes: style.strikes })), ...extraStyles];
  return all.filter((style, index) => all.findIndex((other) => other.id === style.id) === index);
}

/** The outline figure for a move: the game's (./guide), else the one written for an extra move. Null when it has neither. */
export function dojoGuideFor(move: MoveDef): Guide | null {
  return guideFor(move) ?? extraGuideFor(move);
}

/** What every move's detector checks, the extra moves' too: the `table` to hand `liveChecks` (./guide) for the live checklist. */
export const DOJO_MEASURES: typeof MEASURES = { ...MEASURES, ...EXTRA_MEASURES };

/**
 * Judges the frames of one try: `judgeRep` (./practice) for the game's moves, `judgeExtraRep` for the extra ones.
 * Where that has only the line for every move of the kind (or an extra move's one line) to say about a try that
 * did not count, the move's own words (./coaching) take its place: the tip for the condition the try failed, for a
 * move judged condition by condition, else how to make this move. What counted, and how well, is not touched.
 */
export function dojoJudgeRep(move: MoveDef, frames: readonly PoseFrame[], baseline: Baseline | null = null): RepResult {
  const result = MOVES.has(move.id) ? judgeRep(move, frames, baseline) : judgeExtraRep(move, frames, baseline);
  const own = COACHING[move.id];
  const general = result.part === PRACTICE_TIPS[move.kind].part || (!MOVES.has(move.id) && result.part === EXTRA_TIPS[move.id]?.part);
  if (!own || result.counted || !general) return result;
  const say = faultOf(move.id, DOJO_MEASURES[move.id] ?? [], frames, baseline) ?? own.whole;
  return { ...result, tip: say.tip, part: say.part };
}

/** The line for a try that was not seen and has no tip of its own: how to make this move (./coaching), else the extra move's own tip, else the one for its kind. */
export function dojoTipFor(move: Pick<MoveDef, "id" | "kind">): string {
  return COACHING[move.id]?.whole.tip ?? (MOVES.has(move.id) ? undefined : EXTRA_TIPS[move.id]?.tip) ?? PRACTICE_TIPS[move.kind].tip;
}

/** The line shown with an Excellent: what was done well in this move. Null for a move with none written. */
export function dojoPraiseFor(move: Pick<MoveDef, "id">): string | null {
  return praiseFor(move.id);
}

/** The words in an id that mark a leg move among the extra ones, for one that EXTRA_NEEDS_LEGS has not listed. */
const LEG_WORD = /(?:^|_)(?:kick|knee|stomp)(?:_|$)/;

/** True for a move the camera can only count with the legs in view: the game's two, the extra kicks, and any other extra move named as one. */
export function needsWholeBody(move: Pick<MoveDef, "id">): boolean {
  return KICK_IDS.includes(move.id) || NEEDS_LEGS.includes(move.id) || EXTRA_NEEDS_LEGS.includes(move.id) || (!MOVES.has(move.id) && LEG_WORD.test(move.id));
}

export type DojoGroupId = "style" | "kicks" | "defends" | "more";

export interface DojoMenuMove {
  readonly id: string;
  readonly name: string;
  readonly kind: MoveDef["kind"];
  /** True when the camera has to see the legs. */
  readonly wholeBody: boolean;
}

export interface DojoMenuGroup {
  readonly id: DojoGroupId;
  readonly title: string;
  /** One line under the title, when the group needs one. */
  readonly note: string | null;
  readonly moves: readonly DojoMenuMove[];
}

export interface DojoMenuOptions {
  /** Left out: the moves and styles in ./extra. */
  readonly extras?: DojoExtras;
  /** Move ids that must be on the list whatever they are (a list handed to the screen): the ones not placed yet go under "More moves". */
  readonly include?: readonly string[];
}

/**
 * The list a player ticks, in the order it is shown and trained. Four groups, each move in the first one it fits:
 * the style's own strikes; "Kicks and knees" (front kick, knee, and any extra leg move); "Defends" (block, duck, both
 * dodges, and any other defend: a style's own, such as a high block, sits here and not with its strikes); "More
 * moves" (the strikes of every other style and the extra strikes). A god's power move is never offered. A group with
 * nothing in it is left out, and an id nobody knows is skipped. The style's own group carries the whole-body note
 * when a kick is in it.
 */
export function dojoMenu(style: Pick<DojoStyleDef, "name" | "strikes">, options: DojoMenuOptions = {}): DojoMenuGroup[] {
  const extraMoves = options.extras?.moves ?? EXTRA_MOVES;
  const styles = dojoStyles(options.extras?.styles ?? EXTRA_STYLES);
  const placed = new Set<string>();
  const take = (ids: readonly string[]): DojoMenuMove[] => ids.flatMap((id) => {
    const move = dojoMoveOf(id, extraMoves);
    if (!move || placed.has(id)) return [];
    placed.add(id);
    return [{ id, name: move.name, kind: move.kind, wholeBody: needsWholeBody(move) }];
  });
  const offered = (move: MoveDef): boolean => !POWER_MOVES.has(move.id);
  const extras = extraMoves.filter(offered);

  const kindOf = (id: string): MoveDef["kind"] | undefined => dojoMoveOf(id, extraMoves)?.kind;
  const own = take(style.strikes.filter((id) => kindOf(id) !== "defend"));
  const kicks = take([...KICK_IDS, ...extras.filter(needsWholeBody).map((move) => move.id)]);
  const ownDefends = style.strikes.filter((id) => kindOf(id) === "defend");
  const defends = take([...DOJO_DEFENDS, ...ownDefends, ...extras.filter((move) => move.kind === "defend").map((move) => move.id)]);
  const others = [...styles.flatMap((each) => each.strikes), ...extras.map((move) => move.id)]
    .filter((id) => { const move = dojoMoveOf(id, extraMoves); return move?.kind === "strike" && offered(move); });
  const more = take([...others, ...(options.include ?? [])]);

  const groups: DojoMenuGroup[] = [
    { id: "style", title: `${style.name} strikes`, note: own.some((move) => move.wholeBody) ? WHOLE_BODY_NOTE : null, moves: own },
    { id: "kicks", title: "Kicks and knees", note: WHOLE_BODY_NOTE, moves: kicks },
    { id: "defends", title: "Defends", note: null, moves: defends },
    { id: "more", title: "More moves", note: null, moves: more },
  ];
  return groups.filter((group) => group.moves.length > 0);
}

/** Every move id on the list, in the order shown. */
export function menuIds(menu: readonly DojoMenuGroup[]): string[] {
  return menu.flatMap((group) => group.moves.map((move) => move.id));
}

/** The ticked moves in the order the list shows them: the order they are trained in. */
export function pickedInOrder(menu: readonly DojoMenuGroup[], ticked: Iterable<string>): string[] {
  const chosen = new Set(ticked);
  return menuIds(menu).filter((id) => chosen.has(id));
}

/** What the player chose last time, kept in this browser. */
export interface DojoChoice {
  readonly style: string;
  readonly moves: readonly string[];
  readonly reps: number;
}

export const DOJO_CHOICE_KEY = "odyssey-dojo.training";

/** The part of localStorage used, so a test can pass a stand-in (the same shape src/settings/store.ts uses). */
export interface ChoiceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): ChoiceStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The stored choice, its style id as today's (a saved Hoplite or Pankration is read as Jiu-jitsu or Taekwondo). No storage, a private window that throws, or anything that is not a choice: null. */
export function loadChoice(storage: ChoiceStorage | null = browserStorage()): DojoChoice | null {
  try {
    const data: unknown = JSON.parse(storage?.getItem(DOJO_CHOICE_KEY) ?? "null");
    if (typeof data !== "object" || data === null) return null;
    const { style, moves, reps } = data as Record<string, unknown>;
    if (typeof style !== "string" || !Array.isArray(moves) || typeof reps !== "number" || !Number.isFinite(reps)) return null;
    return { style: currentStyleId(style), moves: moves.filter((id): id is string => typeof id === "string"), reps };
  } catch {
    return null;
  }
}

/** Keeps the choice for next time. A browser that will not store it is not an error. */
export function saveChoice(choice: DojoChoice, storage: ChoiceStorage | null = browserStorage()): void {
  try {
    storage?.setItem(DOJO_CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // Private windows and full storage throw: the choice is simply not remembered.
  }
}

/** What the screen was handed, and what was kept from last time. */
export interface StartFrom {
  /** Left out: the moves and styles in ./extra. */
  readonly extras?: DojoExtras;
  /** The style passed to the screen, when one was. It is the one preselected. */
  readonly style?: Pick<DojoStyleDef, "name" | "strikes"> | null;
  /** The move list passed to the screen, when one was. Those are the ones ticked. */
  readonly moves?: readonly string[];
  readonly reps?: number;
  readonly saved?: DojoChoice | null;
}

export interface Setup {
  /** Every style offered, the preselected one among them. */
  readonly styles: readonly DojoStyleDef[];
  readonly style: DojoStyleDef;
  readonly ticked: readonly string[];
  readonly reps: number;
}

/** The style's usual list: its strikes, then the four defends. `movesFor` in ./dojo is this. */
export const usualMoves = (style: Pick<DojoStyleDef, "strikes">): string[] => [...new Set([...style.strikes, ...DOJO_DEFENDS])];
/** Shown when there is no style at all, which no build of the game has: nothing of its own, the rest still tickable. */
const NO_STYLE: DojoStyleDef = { id: "none", name: "Training", line: "", strikes: [] };

/**
 * What the setup step shows first. The style: the one handed in, else the one kept from last time, else the first.
 * The ticks: the list handed in, else last time's when it was for this style, else the style's usual list.
 * The repetitions: the number handed in, else last time's, else `fallbackReps`.
 */
export function startingSetup(from: StartFrom, fallbackReps: number): Setup {
  const known = dojoStyles(from.extras?.styles ?? EXTRA_STYLES);
  const given = from.style ?? null;
  // A style handed in that is not one of ours (a test's, a demo's) is offered first, as it is.
  const handed = given && (known.find((style) => style.name === given.name) ?? { id: given.name, name: given.name, line: "", strikes: given.strikes });
  const styles = handed && !known.includes(handed) ? [handed, ...known] : known;
  const saved = from.saved ?? null;
  const style = handed ?? styles.find((each) => each.id === saved?.style) ?? styles[0] ?? NO_STYLE;
  const extraMoves = from.extras?.moves ?? EXTRA_MOVES;
  const isKnown = (id: string): boolean => dojoMoveOf(id, extraMoves) !== undefined;
  const remembered = saved && saved.style === style.id ? saved.moves.filter(isKnown) : [];
  const ticked = from.moves ? from.moves.filter(isKnown) : remembered.length > 0 ? remembered : usualMoves(style).filter(isKnown);
  const wanted = from.reps ?? saved?.reps ?? fallbackReps;
  const reps = Number.isFinite(wanted) && wanted >= 1 ? Math.floor(wanted) : fallbackReps;
  return { styles: styles.length > 0 ? styles : [style], style, ticked: [...new Set(ticked)], reps };
}
