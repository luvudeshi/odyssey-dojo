// Saved data from before Hoplite and Pankration were replaced still loads: each old id reads as the style that took its place.
import { expect, test } from "vitest";
import { STYLES_GOAL, achievements } from "../src/account/achievements";
import { parseProfile } from "../src/account/store";
import { DOJO_CHOICE_KEY, dojoStyles, loadChoice, saveChoice, startingSetup } from "../src/coach/catalog";
import { RENAMED_DOJO_STYLES, RENAMED_STYLES, currentDojoStyleId, currentStyleId, currentStyleIds } from "../src/styles/oldIds";
import { STYLES } from "../src/styles/registry";

const IDS = STYLES.map((style) => style.id);

test("the two old ids read as the styles that took their place, and every other id is left alone", () => {
  expect(currentStyleId("pankration")).toBe("taekwondo");
  expect(currentStyleId("hoplite")).toBe("jiu_jitsu");
  for (const id of IDS) expect(currentStyleId(id), id).toBe(id);
  for (const id of ["", "wizard", "toString", "constructor", "__proto__"]) expect(currentStyleId(id), id).toBe(id);
});

test("no old id is a style today, and each one points at a style that is", () => {
  for (const [old, now] of Object.entries(RENAMED_STYLES)) {
    expect(IDS, old).not.toContain(old);
    expect(IDS, old).toContain(now);
  }
});

test("a saved list keeps its order and holds each style once", () => {
  expect(currentStyleIds(["boxer", "hoplite", "karate"])).toEqual(["boxer", "jiu_jitsu", "karate"]);
  expect(currentStyleIds(["hoplite", "jiu_jitsu", "pankration", "taekwondo"])).toEqual(["jiu_jitsu", "taekwondo"]);
  expect(currentStyleIds([])).toEqual([]);
});

test("a profile saved with the old styles loads, and Man of many ways counts each style once", () => {
  const old = parseProfile(JSON.stringify({ name: "Nobody", wins: 5, styles: ["boxer", "hoplite", "karate", "kung_fu", "pankration"] }));
  expect([...old.styles].sort()).toEqual([...IDS].sort());
  expect(achievements(old, []).find((feat) => feat.id === "many_ways")?.done).toBe(true);
  // An old win and a new win in the same style are one style, not two.
  const both = parseProfile(JSON.stringify({ styles: ["hoplite", "jiu_jitsu", "boxer", "karate", "kung_fu"] }));
  expect(both.styles).toHaveLength(STYLES_GOAL - 1);
  expect(achievements(both, []).find((feat) => feat.id === "many_ways")?.done).toBe(false);
});

// The Training Dojo keeps the last choice under DOJO_CHOICE_KEY. Before the rename its kicks list was "taekwondo".
const kept = (value: unknown) => {
  const store: Record<string, string> = { [DOJO_CHOICE_KEY]: JSON.stringify(value) };
  return { store, getItem: (key: string) => store[key] ?? null, setItem: (key: string, text: string) => { store[key] = text; } };
};

test("a Dojo choice kept before the rename reads with today's ids: the kicks list, Taekwondo and Jiu-jitsu", () => {
  expect(currentDojoStyleId("taekwondo")).toBe("taekwondo_kicks");
  expect(currentDojoStyleId("pankration")).toBe("taekwondo");
  expect(currentDojoStyleId("hoplite")).toBe("jiu_jitsu");
  for (const id of [...IDS.filter((id) => id !== "taekwondo"), "taekwondo_kicks", "self_defense", "muay_thai", "karate_basics", "", "toString"]) {
    expect(currentDojoStyleId(id), id).toBe(id);
  }
  const offered = dojoStyles().map((style) => style.id);
  for (const id of Object.values(RENAMED_DOJO_STYLES)) expect(offered, id).toContain(id);

  const kicks = ["roundhouse_kick", "side_kick", "low_kick"];
  expect(loadChoice(kept({ style: "taekwondo", moves: kicks, reps: 3 }))).toEqual({ style: "taekwondo_kicks", moves: kicks, reps: 3 });
  expect(loadChoice(kept({ style: "pankration", moves: ["front_kick"], reps: 1 }))?.style).toBe("taekwondo");
  expect(loadChoice(kept({ style: "hoplite", moves: [], reps: 5 }))?.style).toBe("jiu_jitsu");
  // The setup step then opens on the kicks list, with last time's kicks ticked.
  const setup = startingSetup({ saved: loadChoice(kept({ style: "taekwondo", moves: kicks, reps: 3 })) }, 3);
  expect(setup.style.id).toBe("taekwondo_kicks");
  expect(setup.ticked).toEqual(kicks);
});

test("a Dojo choice saved now keeps the game's Taekwondo as Taekwondo", () => {
  const storage = kept(null);
  saveChoice({ style: "taekwondo", moves: ["front_kick", "knee"], reps: 3 }, storage);
  expect(loadChoice(storage)).toEqual({ style: "taekwondo", moves: ["front_kick", "knee"], reps: 3 });
  saveChoice({ style: "taekwondo_kicks", moves: ["side_kick"], reps: 1 }, storage);
  expect(loadChoice(storage)?.style).toBe("taekwondo_kicks");
});
