// What the training dojo offers to practise (src/coach/catalog.ts): the styles, the grouped list of moves a player
// ticks, the choice kept for next time, and a session that trains exactly the ticked moves in the order shown.
import { describe, expect, test } from "vitest";
import {
  DOJO_CHOICE_KEY, DOJO_DEFENDS, DOJO_MEASURES, REPS_CHOICES, WHOLE_BODY_NOTE, dojoGuideFor, dojoJudgeRep, dojoMenu, dojoTipFor, dojoMoveOf, dojoStyles, loadChoice, menuIds, needsWholeBody, pickedInOrder,
  saveChoice, startingSetup, usualMoves,
} from "../src/coach/catalog";
import type { ChoiceStorage, DojoMenuGroup, DojoStyleDef } from "../src/coach/catalog";
import { COUNT_FROM, currentMove, gradeAttempt, gradeRep, keyRep, movesFor, startDojo, summariseDojo, tickDojo, trackOf } from "../src/coach/dojo";
import type { DojoRep } from "../src/coach/dojo";
import { EXTRA_MOVES, EXTRA_STYLES, EXTRA_TIPS, extraMove } from "../src/coach/extra";
import { PRACTICE_TIPS, judgeRep } from "../src/coach/practice";
import { POWER_MOVES } from "../src/combat/engine";
import type { MoveDef } from "../src/core/types";
import { MOVES } from "../src/moves/registry";
import { STYLES } from "../src/styles/registry";
import { need } from "./helpers/need";

const styleOf = (id: string, styles: readonly DojoStyleDef[] = dojoStyles()): DojoStyleDef => need(styles.find((style) => style.id === id));
const group = (menu: readonly DojoMenuGroup[], id: DojoMenuGroup["id"]): string[] => (menu.find((each) => each.id === id)?.moves ?? []).map((move) => move.id);

/** A made-up move only the dojo knows, copied from a real one so it has a detector and a picture. */
const made = (id: string, name: string, kind: MoveDef["kind"] = "strike"): MoveDef => ({ ...need(MOVES.get(kind === "defend" ? "block" : "jab")), id, name, kind });
const BUMP = made("shoulder_bump", "Shoulder bump");
const AXE_KICK = made("axe_kick", "Axe kick");
const PARRY = made("parry", "Parry", "defend");
const SAVATE: DojoStyleDef = { id: "savate", name: "Savate", line: "Kicks and bumps.", strikes: ["shoulder_bump", "axe_kick", "jab"] };
const EXTRAS = { moves: [BUMP, AXE_KICK, PARRY], styles: [SAVATE] };
/** No extras at all: the game's own moves and styles only. */
const NONE = { moves: [], styles: [] };

/** A stand-in for localStorage. */
function memory(start: Record<string, string> = {}): ChoiceStorage & { readonly kept: Record<string, string> } {
  const kept = { ...start };
  return { kept, getItem: (key) => kept[key] ?? null, setItem: (key, value) => { kept[key] = value; } };
}
const throwing: ChoiceStorage = { getItem: () => { throw new Error("private window"); }, setItem: () => { throw new Error("private window"); } };

describe("the moves and styles the dojo knows", () => {
  test("a move is looked up in the game's registry first, then among the extra ones", () => {
    expect(dojoMoveOf("jab")).toBe(MOVES.get("jab"));
    expect(dojoMoveOf("shoulder_bump")).toBeUndefined();
    expect(dojoMoveOf("shoulder_bump", EXTRAS.moves)).toBe(BUMP);
    // An extra move cannot take the place of one of the game's.
    expect(dojoMoveOf("jab", [made("jab", "Not the jab")])).toBe(MOVES.get("jab"));
    expect(dojoMoveOf("no_such_move", EXTRAS.moves)).toBeUndefined();
  });

  test("the styles are the game's, in the game's order, each with its line and strikes; then the extra ones", () => {
    expect(dojoStyles([]).map((style) => style.id)).toEqual(STYLES.map((style) => style.id));
    for (const style of STYLES) expect(styleOf(style.id)).toMatchObject({ name: style.name, line: style.blurb, strikes: style.strikes });
    const withExtra = dojoStyles(EXTRAS.styles);
    expect(withExtra.map((style) => style.id)).toEqual([...STYLES.map((style) => style.id), "savate"]);
    // A second style with an id already taken is left out.
    expect(dojoStyles([{ ...SAVATE, id: "boxer" }]).filter((style) => style.id === "boxer")).toHaveLength(1);
  });

  test("the stub of extras the dojo ships with is read without a fault, whatever it holds", () => {
    expect(dojoStyles().length).toBe(STYLES.length + EXTRA_STYLES.filter((style) => !STYLES.some((own) => own.id === style.id)).length);
    for (const move of EXTRA_MOVES) expect(dojoMoveOf(move.id)).toBeDefined();
  });
});

describe("the list a player ticks", () => {
  test("the boxer's list: its strikes, kicks and knees, the defends, then the strikes of the other styles", () => {
    const menu = dojoMenu(styleOf("boxer"), { extras: NONE });
    expect(menu.map((each) => each.id)).toEqual(["style", "kicks", "defends", "more"]);
    expect(menu.map((each) => each.title)).toEqual(["Boxer strikes", "Kicks and knees", "Defends", "More moves"]);
    expect(group(menu, "style")).toEqual(["jab", "cross", "hook", "uppercut"]);
    expect(group(menu, "kicks")).toEqual(["front_kick", "knee"]);
    expect(group(menu, "defends")).toEqual(["block", "duck", "dodge_left", "dodge_right"]);
    const others = STYLES.filter((style) => style.id !== "boxer").flatMap((style) => style.strikes);
    expect(group(menu, "more")).toEqual([...new Set(others)].filter((id) => !["front_kick", "knee", "uppercut"].includes(id)));
  });

  test("the kicks say they need the whole body in view", () => {
    const kicks = need(dojoMenu(styleOf("boxer")).find((each) => each.id === "kicks"));
    expect(kicks.note).toBe(WHOLE_BODY_NOTE);
    expect(kicks.note).toMatch(/whole body/);
    expect(kicks.moves.every((move) => move.wholeBody)).toBe(true);
    expect(needsWholeBody({ id: "jab" })).toBe(false);
  });

  test("for every style: no move twice, every id known, both kicks and all four defends there, no god power", () => {
    for (const style of dojoStyles()) {
      const ids = menuIds(dojoMenu(style));
      expect(new Set(ids).size, style.id).toBe(ids.length);
      for (const id of ids) expect(dojoMoveOf(id), id).toBeDefined();
      for (const id of ["front_kick", "knee", ...DOJO_DEFENDS]) expect(ids, style.id).toContain(id);
      expect(ids.filter((id) => POWER_MOVES.has(id)), style.id).toEqual([]);
      // Every strike of every style can be ticked whichever style is chosen.
      for (const other of STYLES) for (const id of other.strikes) expect(ids, `${style.id} offers ${id}`).toContain(id);
    }
  });

  test("a style whose own strikes are kicks keeps them in its own group, marked, and has no second kicks group", () => {
    const menu = dojoMenu(styleOf("taekwondo"), { extras: NONE });
    expect(group(menu, "style")).toEqual(["front_kick", "knee", "hammer_fist", "uppercut"]);
    expect(menu.map((each) => each.id)).toEqual(["style", "defends", "more"]);
    expect(need(menu[0]).moves.map((move) => move.wholeBody)).toEqual([true, true, false, false]);
  });

  test("the usual list for a style is ticked in the order the list shows it", () => {
    for (const style of dojoStyles([])) expect(pickedInOrder(dojoMenu(style), movesFor(style)), style.id).toEqual(movesFor(style));
    // A dojo style with a block among its strikes trains the same moves, with that block down among the defends.
    for (const style of dojoStyles()) {
      const picked = pickedInOrder(dojoMenu(style), movesFor(style));
      expect([...picked].sort(), style.id).toEqual([...movesFor(style)].sort());
      const firstDefend = picked.findIndex((id) => dojoMoveOf(id)?.kind === "defend");
      expect(picked.slice(firstDefend).every((id) => dojoMoveOf(id)?.kind === "defend"), style.id).toBe(true);
    }
    expect(usualMoves(styleOf("boxer"))).toEqual(movesFor(styleOf("boxer")));
  });

  test("the order is stable: the same list every time, and ticks in any order come out in the list's order", () => {
    const boxer = styleOf("boxer");
    expect(dojoMenu(boxer)).toEqual(dojoMenu(boxer));
    expect(pickedInOrder(dojoMenu(boxer), ["duck", "front_kick", "jab", "not_a_move", "jab"])).toEqual(["jab", "front_kick", "duck"]);
    expect(pickedInOrder(dojoMenu(boxer), [])).toEqual([]);
  });

  test("extra moves show up: a leg move under kicks, a defend under defends, a strike under more moves", () => {
    const menu = dojoMenu(styleOf("boxer"), { extras: EXTRAS });
    expect(group(menu, "kicks")).toEqual(["front_kick", "knee", "axe_kick"]);
    expect(group(menu, "defends")).toEqual(["block", "duck", "dodge_left", "dodge_right", "parry"]);
    expect(group(menu, "more")).toContain("shoulder_bump");
    expect(group(menu, "more")).not.toContain("axe_kick");
    expect(need(menu.flatMap((each) => each.moves).find((move) => move.id === "shoulder_bump")).name).toBe("Shoulder bump");
    expect(needsWholeBody(AXE_KICK)).toBe(true);
    expect(needsWholeBody(BUMP)).toBe(false);
    const ids = menuIds(menu);
    expect(new Set(ids).size).toBe(ids.length);
    // Without the extras none of them is offered.
    expect(menuIds(dojoMenu(styleOf("boxer"), { extras: NONE })).filter((id) => ["axe_kick", "parry", "shoulder_bump"].includes(id))).toEqual([]);
  });

  test("an extra style trains its own strikes, extra and not, and its kick says it needs the whole body", () => {
    const menu = dojoMenu(styleOf("savate", dojoStyles(EXTRAS.styles)), { extras: EXTRAS });
    expect(need(menu[0]).title).toBe("Savate strikes");
    expect(group(menu, "style")).toEqual(["shoulder_bump", "axe_kick", "jab"]);
    expect(need(menu[0]).moves.map((move) => move.wholeBody)).toEqual([false, true, false]);
    expect(group(menu, "kicks")).toEqual(["front_kick", "knee"]);
    expect(group(menu, "more")).not.toContain("jab");
  });

  test("an id nobody knows is skipped, a god's power is not offered, and a move handed in is always tickable", () => {
    const odd: DojoStyleDef = { id: "odd", name: "Odd", line: "", strikes: ["no_such_move", "jab"] };
    expect(group(dojoMenu(odd), "style")).toEqual(["jab"]);
    const power = made("sky_fire", "Sky fire");
    expect(menuIds(dojoMenu(styleOf("boxer"), { extras: { moves: [power] } }))).toContain("sky_fire");
    expect(menuIds(dojoMenu(styleOf("boxer")))).not.toContain("thunderbolt");
    expect(group(dojoMenu(styleOf("boxer"), { include: ["thunderbolt", "jab", "nothing"] }), "more").at(-1)).toBe("thunderbolt");
  });
});

describe("the dojo's own moves and styles (src/coach/extra)", () => {
  const NAMES = ["roundhouse_kick", "side_kick", "low_kick", "elbow_strike", "palm_heel", "wrist_release", "high_block", "low_block"];

  test("every extra move is found by id and none is in the game's registry", () => {
    expect(EXTRA_MOVES.map((move) => move.id).sort()).toEqual([...NAMES].sort());
    for (const id of NAMES) {
      expect(dojoMoveOf(id), id).toBe(extraMove(id));
      expect(MOVES.has(id), id).toBe(false);
    }
  });

  test("the four dojo styles are offered after the game's five", () => {
    expect(dojoStyles().map((style) => style.id)).toEqual([...STYLES.map((style) => style.id), "taekwondo_kicks", "self_defense", "muay_thai", "karate_basics"]);
  });

  test("Taekwondo kicks is all kicks: its own group holds them, with the whole-body note", () => {
    const menu = dojoMenu(styleOf("taekwondo_kicks"));
    expect(group(menu, "style")).toEqual(["front_kick", "roundhouse_kick", "side_kick", "low_kick", "knee"]);
    expect(need(menu[0]).note).toBe(WHOLE_BODY_NOTE);
    expect(need(menu[0]).moves.every((move) => move.wholeBody)).toBe(true);
    expect(menu.map((each) => each.id)).toEqual(["style", "defends", "more"]);
  });

  test("for a style with no kicks of its own, all five kicks are under Kicks and knees", () => {
    const menu = dojoMenu(styleOf("boxer"));
    expect(group(menu, "kicks")).toEqual(["front_kick", "knee", "roundhouse_kick", "side_kick", "low_kick"]);
    expect(need(menu.find((each) => each.id === "kicks")).note).toBe(WHOLE_BODY_NOTE);
    expect(need(menu[0]).note).toBeNull();
  });

  test("high block and low block are defends: under Defends for every style, never among the strikes", () => {
    for (const style of dojoStyles()) {
      const menu = dojoMenu(style);
      expect(group(menu, "defends"), style.id).toEqual(expect.arrayContaining(["block", "duck", "dodge_left", "dodge_right", "high_block", "low_block"]));
      for (const each of menu) if (each.id !== "defends") expect(each.moves.filter((move) => move.kind === "defend"), `${style.id} ${each.id}`).toEqual([]);
    }
    // Karate basics lists both blocks with its strikes; they are still ticked at first.
    const karate = styleOf("karate_basics");
    expect(group(dojoMenu(karate), "style")).toEqual(["reverse_punch", "knife_hand", "front_kick", "side_kick"]);
    expect(group(dojoMenu(karate), "defends")).toEqual(["block", "duck", "dodge_left", "dodge_right", "high_block", "low_block"]);
    expect(startingSetup({ saved: { style: "karate_basics", moves: [], reps: 3 } }, 3).ticked).toEqual(expect.arrayContaining(["high_block", "low_block"]));
  });

  test("the hand strikes are under More moves for a style that does not have them", () => {
    expect(group(dojoMenu(styleOf("boxer")), "more")).toEqual(expect.arrayContaining(["elbow_strike", "palm_heel", "wrist_release"]));
  });

  test("every move on every list has an outline, a checklist table and a key of its own", () => {
    const ids = [...new Set(dojoStyles().flatMap((style) => menuIds(dojoMenu(style))))];
    for (const id of ids) {
      const move = need(dojoMoveOf(id));
      expect(dojoGuideFor(move), id).not.toBeNull();
      expect(DOJO_MEASURES[id], id).toBeDefined();
    }
    const keys = ids.map((id) => need(dojoMoveOf(id)).key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(NAMES.map((id) => need(dojoMoveOf(id)).key).sort()).toEqual(["a", "d", "e", "o", "v", "w", "x", "y"]);
  });

  test("an extra move's tips are its own: a missed try with nobody moving, and the fallback line", () => {
    const kick = need(dojoMoveOf("roundhouse_kick"));
    expect(dojoTipFor(kick)).toBe(need(EXTRA_TIPS.roundhouse_kick).tip);
    expect(dojoTipFor(need(dojoMoveOf("jab")))).toBe(PRACTICE_TIPS.strike.tip);
    const missed = gradeAttempt(kick, []);
    expect(missed.grade.tier).toBe("needs_work");
    expect(missed.tip).toBeTruthy();
    expect(dojoJudgeRep(need(dojoMoveOf("jab")), [])).toEqual(judgeRep(need(dojoMoveOf("jab")), []));
  });

  test("a Taekwondo session on the keyboard: every kick, in order, each counted by its own key press", () => {
    const moves = pickedInOrder(dojoMenu(styleOf("taekwondo")), ["roundhouse_kick", "front_kick", "high_block"]);
    expect(moves).toEqual(["front_kick", "roundhouse_kick", "high_block"]);
    let state = startDojo({ moves, reps: 1, keyboard: true }, 0);
    const asked: string[] = [];
    for (let now = 0; state.phase !== "done" && now < 60_000; now += 50) {
      state = tickDojo(state, now, null);
      if (state.phase !== "go") continue;
      asked.push(need(currentMove(state)).key);
      state = keyRep(state, now);
    }
    expect(asked).toEqual(["f", "o", "y"]);
    const summary = summariseDojo(state.reps);
    expect(summary.moves.map((move) => move.name)).toEqual(["Front kick", need(dojoMoveOf("roundhouse_kick")).name, "High block"]);
    expect(summary.grades.excellent).toBe(3);
  });

  test("an extra defend made in front of the camera counts: its detector answers 1, over the dojo's 0.6", () => {
    for (const id of ["high_block", "low_block"]) {
      const move = need(dojoMoveOf(id));
      expect(move.kind, id).toBe("defend");
      expect(gradeAttempt(move, [], null, COUNT_FROM, { quality: 1, reactMs: 400, sure: true }).grade.tier, id).toBe("excellent");
    }
  });
});

describe("what the setup step starts on", () => {
  const boxer = need(STYLES.find((style) => style.id === "boxer"));

  test("nothing handed in and nothing kept: the first style, its usual list, three tries", () => {
    const setup = startingSetup({}, 3);
    expect(setup.style.id).toBe(need(STYLES[0]).id);
    expect(setup.ticked).toEqual(movesFor(setup.style));
    expect(setup.reps).toBe(3);
    expect(setup.styles.map((style) => style.id)).toEqual(dojoStyles().map((style) => style.id));
    expect(REPS_CHOICES).toEqual([1, 3, 5]);
  });

  test("a style handed in is the one preselected, whatever was kept", () => {
    const setup = startingSetup({ style: boxer, saved: { style: "karate", moves: ["knife_hand"], reps: 5 } }, 3);
    expect(setup.style.id).toBe("boxer");
    expect(setup.ticked).toEqual(movesFor(boxer));
    expect(setup.reps).toBe(5);
  });

  test("last time's choice comes back: the style, the moves that are still known, the tries", () => {
    const setup = startingSetup({ saved: { style: "karate", moves: ["front_kick", "gone_move", "duck"], reps: 1 } }, 3);
    expect(setup.style.id).toBe("karate");
    expect(setup.ticked).toEqual(["front_kick", "duck"]);
    expect(setup.reps).toBe(1);
    // Kept for the same style as the one handed in: the kept moves are ticked.
    expect(startingSetup({ style: boxer, saved: { style: "boxer", moves: ["jab", "knee"], reps: 3 } }, 3).ticked).toEqual(["jab", "knee"]);
  });

  test("a list of moves handed in is what is ticked, and a number of tries handed in wins", () => {
    const setup = startingSetup({ style: boxer, moves: ["jab", "block", "jab", "no_such_move"], reps: 2, saved: { style: "boxer", moves: ["hook"], reps: 5 } }, 3);
    expect(setup.ticked).toEqual(["jab", "block"]);
    expect(setup.reps).toBe(2);
  });

  test("a style nobody knows is still offered, first; a kept style that is gone falls back to the first", () => {
    const setup = startingSetup({ style: { name: "House style", strikes: ["jab"] } }, 3);
    expect(setup.styles[0]).toBe(setup.style);
    expect(setup.style.name).toBe("House style");
    expect(setup.ticked).toEqual(["jab", ...DOJO_DEFENDS]);
    expect(startingSetup({ saved: { style: "gone", moves: ["jab"], reps: 3 } }, 3).style.id).toBe(need(STYLES[0]).id);
    expect(startingSetup({ saved: { style: "boxer", moves: [], reps: Number.NaN } }, 3)).toMatchObject({ reps: 3, ticked: movesFor(boxer) });
  });

  test("an extra style can be the one kept, with its extra moves ticked", () => {
    const setup = startingSetup({ extras: EXTRAS, saved: { style: "savate", moves: ["shoulder_bump", "parry"], reps: 3 } }, 3);
    expect(setup.style).toBe(SAVATE);
    expect(setup.ticked).toEqual(["shoulder_bump", "parry"]);
  });
});

describe("the choice kept in the browser", () => {
  test("the key is named like the game's other keys", () => {
    expect(DOJO_CHOICE_KEY).toBe("odyssey-dojo.training");
  });

  test("what is saved is what is loaded", () => {
    const storage = memory();
    saveChoice({ style: "boxer", moves: ["jab", "front_kick"], reps: 5 }, storage);
    expect(Object.keys(storage.kept)).toEqual([DOJO_CHOICE_KEY]);
    expect(loadChoice(storage)).toEqual({ style: "boxer", moves: ["jab", "front_kick"], reps: 5 });
  });

  test("a kept Hoplite or Pankration is read as Jiu-jitsu or Taekwondo, so the choice is not lost", () => {
    for (const [old, now] of [["hoplite", "jiu_jitsu"], ["pankration", "taekwondo"], ["boxer", "boxer"]] as const) {
      expect(loadChoice(memory({ [DOJO_CHOICE_KEY]: JSON.stringify({ style: old, moves: ["jab"], reps: 4 }) })), old).toEqual({ style: now, moves: ["jab"], reps: 4 });
    }
  });

  test("nothing kept, no storage, rubbish or a browser that throws: null, and saving does not throw", () => {
    expect(loadChoice(memory())).toBeNull();
    expect(loadChoice(null)).toBeNull();
    for (const raw of ["not json", "7", "[]", "{}", JSON.stringify({ style: 1, moves: [], reps: 3 }), JSON.stringify({ style: "boxer", moves: "jab", reps: 3 }), JSON.stringify({ style: "boxer", moves: [], reps: "3" })]) {
      expect(loadChoice(memory({ [DOJO_CHOICE_KEY]: raw })), raw).toBeNull();
    }
    expect(loadChoice(memory({ [DOJO_CHOICE_KEY]: JSON.stringify({ style: "boxer", moves: ["jab", 4, null], reps: 3 }) }))).toEqual({ style: "boxer", moves: ["jab"], reps: 3 });
    expect(loadChoice(throwing)).toBeNull();
    expect(() => { saveChoice({ style: "boxer", moves: [], reps: 3 }, throwing); }).not.toThrow();
    expect(() => { saveChoice({ style: "boxer", moves: [], reps: 3 }, null); }).not.toThrow();
  });
});

describe("a session of hand-picked moves", () => {
  /** Plays a keyboard session to the end: one key press on every turn. Returns the move asked for on each turn. */
  function playKeys(moves: readonly string[], reps: number, moveOf?: (id: string) => MoveDef | undefined): { asked: string[]; trained: string[]; perMove: number[] } {
    let state = startDojo({ moves, reps, keyboard: true }, 0, moveOf);
    const asked: string[] = [];
    for (let now = 0; state.phase !== "done" && now < 600_000; now += 50) {
      state = tickDojo(state, now, null, moveOf);
      if (state.phase !== "go") continue;
      asked.push(state.config.moves[state.moveIndex] ?? "");
      state = keyRep(state, now, moveOf);
    }
    const summary = summariseDojo(state.reps, moveOf);
    return { asked, trained: summary.moves.map((move) => move.moveId), perMove: summary.moves.map((move) => move.reps) };
  }

  test("two picked moves, a kick among them: exactly those, in the order picked, the chosen number of times", () => {
    const picked = pickedInOrder(dojoMenu(styleOf("boxer")), ["front_kick", "jab"]);
    expect(picked).toEqual(["jab", "front_kick"]);
    const played = playKeys(picked, 3);
    expect(played.asked).toEqual(["jab", "jab", "jab", "front_kick", "front_kick", "front_kick"]);
    expect(played.trained).toEqual(["jab", "front_kick"]);
    expect(played.perMove).toEqual([3, 3]);
  });

  test("any hand-picked list is trained as given, with one, three or five tries", () => {
    const list = ["knee", "dodge_right", "knife_hand", "front_kick", "block"];
    for (const reps of REPS_CHOICES) {
      const played = playKeys(list, reps);
      expect(played.asked).toEqual(list.flatMap((id) => Array.from({ length: reps }, () => id)));
      expect(played.trained).toEqual(list);
    }
  });

  test("a move only the dojo knows is trained like any other, by its own name", () => {
    const moveOf = (id: string): MoveDef | undefined => dojoMoveOf(id, EXTRAS.moves);
    const played = playKeys(["shoulder_bump", "parry", "jab"], 1, moveOf);
    expect(played.asked).toEqual(["shoulder_bump", "parry", "jab"]);
    expect(summariseDojo(startDojo({ moves: ["shoulder_bump"] }, 0, moveOf).reps, moveOf).moves).toEqual([]);
    let state = startDojo({ moves: ["shoulder_bump"], reps: 1, keyboard: true }, 0, moveOf);
    state = tickDojo(state, 5000, null, moveOf);
    state = keyRep(state, 5001, moveOf);
    expect(summariseDojo(state.reps, moveOf).moves.map((move) => move.name)).toEqual(["Shoulder bump"]);
    // Without the lookup the dojo does not know it, so it is left out and there is nothing to train.
    expect(startDojo({ moves: ["shoulder_bump"] }, 0).phase).toBe("done");
  });
});

describe("the strip of moves along the bottom of a session", () => {
  const LIST = ["jab", "cross", "front_kick", "roundhouse_kick", "block", "high_block"];
  const graded = (moveId: string, how: "excellent" | "good" | "missed"): DojoRep => {
    const move = need(dojoMoveOf(moveId));
    if (how === "missed") return gradeRep(move, { counted: false, quality: 0, peak: 0, tip: null, part: null });
    return gradeRep({ ...move, quality: () => 0 }, { counted: true, quality: how === "excellent" ? 0.9 : 0.4, peak: 1, tip: null, part: null }, 400);
  };

  test("at the start nothing is done: the first move is the current one and the rest are next, in order", () => {
    const track = trackOf(LIST, 0, []);
    expect(track).toMatchObject({ done: 0, total: 6 });
    expect(track.steps.map((step) => step.moveId)).toEqual(LIST);
    expect(track.steps.map((step) => step.status)).toEqual(["current", "next", "next", "next", "next", "next"]);
    expect(track.steps.every((step) => step.best === null && step.points === 0 && step.tries === 0)).toBe(true);
    expect(track.steps.map((step) => step.name).slice(2, 4)).toEqual(["Front kick", need(dojoMoveOf("roundhouse_kick")).name]);
  });

  test("two moves done, the third under way: each shows its best grade and its points so far", () => {
    const reps = [graded("jab", "good"), graded("jab", "excellent"), graded("cross", "missed"), graded("cross", "missed"), graded("front_kick", "good")];
    const track = trackOf(LIST, 2, reps);
    expect(track).toMatchObject({ done: 2, total: 6 });
    expect(track.steps.map((step) => step.status)).toEqual(["done", "done", "current", "next", "next", "next"]);
    expect(track.steps.map((step) => step.best)).toEqual(["excellent", "needs_work", "good", null, null, null]);
    expect(track.steps.map((step) => step.points)).toEqual([250, 50, 100, 0, 0, 0]);
    expect(track.steps.map((step) => step.tries)).toEqual([2, 2, 1, 0, 0, 0]);
  });

  test("the session over: every move is done; an index out of range or not a number does not throw", () => {
    expect(trackOf(LIST, LIST.length, []).steps.every((step) => step.status === "done")).toBe(true);
    expect(trackOf(LIST, 99, [])).toMatchObject({ done: 6, total: 6 });
    expect(trackOf(LIST, -3, []).steps[0]?.status).toBe("current");
    expect(trackOf(LIST, Number.NaN, []).done).toBe(0);
    expect(trackOf([], 0, [])).toEqual({ steps: [], done: 0, total: 0 });
  });

  test("an id nobody knows is left out, as the session leaves it out, and the lookup can be handed in", () => {
    expect(trackOf(["jab", "no_such_move", "block"], 1, []).steps.map((step) => [step.moveId, step.status])).toEqual([["jab", "done"], ["block", "current"]]);
    const moveOf = (id: string): MoveDef | undefined => dojoMoveOf(id, EXTRAS.moves);
    expect(trackOf(["shoulder_bump", "jab"], 0, [], moveOf).steps.map((step) => step.name)).toEqual(["Shoulder bump", "Jab"]);
    expect(trackOf(["shoulder_bump", "jab"], 0, []).steps.map((step) => step.name)).toEqual(["Jab"]);
  });

  test("it follows a played session: the count of done moves rises by one as each move's last try is graded", () => {
    let state = startDojo({ moves: LIST, reps: 2, keyboard: true }, 0);
    const seen: number[] = [];
    for (let now = 0; state.phase !== "done" && now < 600_000; now += 50) {
      state = tickDojo(state, now, null);
      if (state.phase === "go") state = keyRep(state, now);
      const track = trackOf(state.config.moves, state.moveIndex, state.reps);
      if (seen.at(-1) !== track.done) seen.push(track.done);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const end = trackOf(state.config.moves, state.moveIndex, state.reps);
    expect(end.steps.map((step) => [step.status, step.best, step.points, step.tries])).toEqual(LIST.map(() => ["done", "excellent", 300, 2]));
  });
});
