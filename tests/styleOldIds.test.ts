// Saved data from before Hoplite and Pankration were replaced still loads: each old id reads as the style that took its place.
import { expect, test } from "vitest";
import { STYLES_GOAL, achievements } from "../src/account/achievements";
import { parseProfile } from "../src/account/store";
import { RENAMED_STYLES, currentStyleId, currentStyleIds } from "../src/styles/oldIds";
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
