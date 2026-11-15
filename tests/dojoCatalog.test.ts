// What the training dojo offers to practise (src/coach/catalog.ts): the styles, the grouped list of moves a player
// ticks, the choice kept for next time, and a session that trains exactly the ticked moves in the order shown.
import { describe, expect, test } from "vitest";
import {
  DOJO_CHOICE_KEY, DOJO_DEFENDS, REPS_CHOICES, WHOLE_BODY_NOTE, dojoMenu, dojoMoveOf, dojoStyles, loadChoice, menuIds, needsWholeBody, pickedInOrder,
  saveChoice, startingSetup, usualMoves,
} from "../src/coach/catalog";
import type { ChoiceStorage, DojoMenuGroup, DojoStyleDef } from "../src/coach/catalog";
import { keyRep, movesFor, startDojo, summariseDojo, tickDojo } from "../src/coach/dojo";
import { EXTRA_MOVES, EXTRA_STYLES } from "../src/coach/extra";
import { POWER_MOVES } from "../src/combat/engine";
import type { MoveDef } from "../src/core/types";
import { MOVES } from "../src/moves/registry";
import { STYLES } from "../src/styles/registry";
import { need } from "./helpers/need";

const styleOf = (id: string, styles: readonly DojoStyleDef[] = dojoStyles()): DojoStyleDef => need(styles.find((style) => style.id === id));
const group = (menu: readonly DojoMenuGroup[], id: DojoMenuGroup["id"]): string[] => (menu.find((each) => each.id === id)?.moves ?? []).map((move) => move.id);

/** A made-up move only the dojo knows, copied from a real one so it has a detector and a picture. */
const made = (id: string, name: string, kind: MoveDef["kind"] = "strike"): MoveDef => ({ ...need(MOVES.get(kind === "defend" ? "block" : "jab")), id, name, kind });
const ELBOW = made("elbow_strike", "Elbow strike");
const SIDE_KICK = made("side_kick", "Side kick");
const PARRY = made("parry", "Parry", "defend");
const MUAY_THAI: DojoStyleDef = { id: "muay_thai", name: "Muay Thai", line: "Elbows and kicks.", strikes: ["elbow_strike", "side_kick", "jab"] };
const EXTRAS = { moves: [ELBOW, SIDE_KICK, PARRY], styles: [MUAY_THAI] };

/** A stand-in for localStorage. */
function memory(start: Record<string, string> = {}): ChoiceStorage & { readonly kept: Record<string, string> } {
  const kept = { ...start };
  return { kept, getItem: (key) => kept[key] ?? null, setItem: (key, value) => { kept[key] = value; } };
}
const throwing: ChoiceStorage = { getItem: () => { throw new Error("private window"); }, setItem: () => { throw new Error("private window"); } };

describe("the moves and styles the dojo knows", () => {
  test("a move is looked up in the game's registry first, then among the extra ones", () => {
    expect(dojoMoveOf("jab")).toBe(MOVES.get("jab"));
    expect(dojoMoveOf("elbow_strike")).toBeUndefined();
    expect(dojoMoveOf("elbow_strike", EXTRAS.moves)).toBe(ELBOW);
    // An extra move cannot take the place of one of the game's.
    expect(dojoMoveOf("jab", [made("jab", "Not the jab")])).toBe(MOVES.get("jab"));
    expect(dojoMoveOf("no_such_move", EXTRAS.moves)).toBeUndefined();
  });

  test("the styles are the game's, in the game's order, each with its line and strikes; then the extra ones", () => {
    expect(dojoStyles([]).map((style) => style.id)).toEqual(STYLES.map((style) => style.id));
    for (const style of STYLES) expect(styleOf(style.id)).toMatchObject({ name: style.name, line: style.blurb, strikes: style.strikes });
    const withExtra = dojoStyles(EXTRAS.styles);
    expect(withExtra.map((style) => style.id)).toEqual([...STYLES.map((style) => style.id), "muay_thai"]);
    // A second style with an id already taken is left out.
    expect(dojoStyles([{ ...MUAY_THAI, id: "boxer" }]).filter((style) => style.id === "boxer")).toHaveLength(1);
  });

  test("the stub of extras the dojo ships with is read without a fault, whatever it holds", () => {
    expect(dojoStyles().length).toBe(STYLES.length + EXTRA_STYLES.filter((style) => !STYLES.some((own) => own.id === style.id)).length);
    for (const move of EXTRA_MOVES) expect(dojoMoveOf(move.id)).toBeDefined();
  });
});

describe("the list a player ticks", () => {
  test("the boxer's list: its strikes, kicks and knees, the defends, then the strikes of the other styles", () => {
    const menu = dojoMenu(styleOf("boxer"), { extras: {} });
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
    const menu = dojoMenu(styleOf("pankration"), { extras: {} });
    expect(group(menu, "style")).toEqual(["front_kick", "knee", "hammer_fist", "uppercut"]);
    expect(menu.map((each) => each.id)).toEqual(["style", "defends", "more"]);
    expect(need(menu[0]).moves.map((move) => move.wholeBody)).toEqual([true, true, false, false]);
  });

  test("the usual list for a style is ticked in the order the list shows it", () => {
    for (const style of dojoStyles()) expect(pickedInOrder(dojoMenu(style), movesFor(style)), style.id).toEqual(movesFor(style));
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
    expect(group(menu, "kicks")).toEqual(["front_kick", "knee", "side_kick"]);
    expect(group(menu, "defends")).toEqual(["block", "duck", "dodge_left", "dodge_right", "parry"]);
    expect(group(menu, "more")).toContain("elbow_strike");
    expect(group(menu, "more")).not.toContain("side_kick");
    expect(need(menu.flatMap((each) => each.moves).find((move) => move.id === "elbow_strike")).name).toBe("Elbow strike");
    expect(needsWholeBody(SIDE_KICK)).toBe(true);
    expect(needsWholeBody(ELBOW)).toBe(false);
    const ids = menuIds(menu);
    expect(new Set(ids).size).toBe(ids.length);
    // Without the extras none of them is offered.
    expect(menuIds(dojoMenu(styleOf("boxer"), { extras: {} })).filter((id) => ["side_kick", "parry", "elbow_strike"].includes(id))).toEqual([]);
  });

  test("an extra style trains its own strikes, extra and not, and its kick says it needs the whole body", () => {
    const menu = dojoMenu(styleOf("muay_thai", dojoStyles(EXTRAS.styles)), { extras: EXTRAS });
    expect(need(menu[0]).title).toBe("Muay Thai strikes");
    expect(group(menu, "style")).toEqual(["elbow_strike", "side_kick", "jab"]);
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
    const setup = startingSetup({ extras: EXTRAS, saved: { style: "muay_thai", moves: ["elbow_strike", "parry"], reps: 3 } }, 3);
    expect(setup.style).toBe(MUAY_THAI);
    expect(setup.ticked).toEqual(["elbow_strike", "parry"]);
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
    const played = playKeys(["elbow_strike", "parry", "jab"], 1, moveOf);
    expect(played.asked).toEqual(["elbow_strike", "parry", "jab"]);
    expect(summariseDojo(startDojo({ moves: ["elbow_strike"] }, 0, moveOf).reps, moveOf).moves).toEqual([]);
    let state = startDojo({ moves: ["elbow_strike"], reps: 1, keyboard: true }, 0, moveOf);
    state = tickDojo(state, 5000, null, moveOf);
    state = keyRep(state, 5001, moveOf);
    expect(summariseDojo(state.reps, moveOf).moves.map((move) => move.name)).toEqual(["Elbow strike"]);
    // Without the lookup the dojo does not know it, so it is left out and there is nothing to train.
    expect(startDojo({ moves: ["elbow_strike"] }, 0).phase).toBe("done");
  });
});
