import { expect, test } from "vitest";
import { achievements, MOVES_GOAL, SCORE_GOAL } from "../src/account/achievements";
import { newlyUnlocked } from "../src/account/unlocks";
import { cleanName, createProfileStore, EMPTY_PROFILE, NAME_MAX, parseProfile, PROFILE_KEY, withFight } from "../src/account/store";
import type { EnemySpec } from "../src/core/types";

const stop = (id: string): EnemySpec => ({ id, name: id.toUpperCase() }) as EnemySpec;
const ROAD = [stop("a"), stop("b")];

test("a stored profile of any shape reads back as a valid one", () => {
  expect(parseProfile(null)).toEqual(EMPTY_PROFILE);
  expect(parseProfile("not json")).toEqual(EMPTY_PROFILE);
  expect(parseProfile("[1,2]")).toEqual(EMPTY_PROFILE);
  const odd = parseProfile(JSON.stringify({ name: 7, cleared: ["a", 3, "a"], moves: { jab: 2.9, hook: -1, cross: "x" }, bestScore: -5, fights: "9", wins: 1.5 }));
  expect(odd).toEqual({ name: "", cleared: ["a"], moves: { jab: 2 }, bestScore: 0, fights: 0, wins: 1 });
});

test("a hero name loses control characters and is cut to the limit, spaces kept", () => {
  expect(cleanName("Toyo\n\tthe Bold\u007f")).toBe("Toyothe Bold");
  expect(cleanName("x".repeat(NAME_MAX + 9))).toHaveLength(NAME_MAX);
  expect(cleanName("Wily ")).toBe("Wily ");
  expect(cleanName(undefined)).toBe("");
});

test("a fight adds to the counts; a stop is cleared once and only by a win", () => {
  const lost = withFight(EMPTY_PROFILE, { enemyId: "a", won: false, score: 300, mastery: { jab: 2 } });
  expect(lost).toMatchObject({ cleared: [], fights: 1, wins: 0, bestScore: 300, moves: { jab: 2 } });
  const won = withFight(lost, { enemyId: "a", won: true, score: 120, mastery: { jab: 1, block: 4 } });
  const again = withFight(won, { enemyId: "a", won: true, score: 900, mastery: {} });
  expect(again).toMatchObject({ cleared: ["a"], fights: 3, wins: 2, bestScore: 900, moves: { jab: 3, block: 4 } });
});

test("the store saves each change and a new store reads it back; a storage that throws is survived", () => {
  const kept = new Map<string, string>();
  const storage = { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => { kept.set(key, value); } };
  const store = createProfileStore(storage);
  let calls = 0;
  const stopListening = store.subscribe(() => { calls += 1; });
  store.rename("Penelope");
  store.record({ enemyId: "a", won: true, score: 50, mastery: { duck: 1 } });
  stopListening();
  store.rename("Nobody");
  expect(calls).toBe(2);
  expect(kept.has(PROFILE_KEY)).toBe(true);
  expect(createProfileStore(storage).get()).toMatchObject({ name: "Nobody", cleared: ["a"], wins: 1 });
  const broken = createProfileStore({ getItem: () => { throw new Error("private window"); }, setItem: () => { throw new Error("full"); } });
  broken.rename("Still here");
  expect(broken.get().name).toBe("Still here");
  expect(createProfileStore(null).get()).toEqual(EMPTY_PROFILE);
});

test("achievements follow the profile: one per stop, the whole road, moves and score", () => {
  const none = achievements(EMPTY_PROFILE, ROAD);
  expect(none.map((feat) => feat.id)).toEqual(["first_win", "beat_a", "beat_b", "home", "student", "second_nature", "song"]);
  expect(none.every((feat) => !feat.done)).toBe(true);
  const some = achievements({ ...EMPTY_PROFILE, wins: 1, cleared: ["a"], moves: { jab: MOVES_GOAL }, bestScore: SCORE_GOAL - 1 }, ROAD);
  expect(some.filter((feat) => feat.done).map((feat) => feat.id)).toEqual(["first_win", "beat_a", "second_nature"]);
  const moves = Object.fromEntries(Array.from({ length: MOVES_GOAL }, (_, i) => [`m${String(i)}`, 1]));
  const all = achievements({ ...EMPTY_PROFILE, wins: 2, cleared: ["a", "b"], moves, bestScore: SCORE_GOAL }, ROAD);
  expect(all.filter((feat) => !feat.done).map((feat) => feat.id)).toEqual(["second_nature"]);
  expect(achievements(EMPTY_PROFILE, []).find((feat) => feat.id === "home")?.done).toBe(false);
});

test("the counted achievements report progress toward their goal, capped at it; the rest report none", () => {
  const by = (profile: typeof EMPTY_PROFILE) => Object.fromEntries(achievements(profile, ROAD).map((feat) => [feat.id, feat.progress]));
  expect(by(EMPTY_PROFILE)).toEqual({
    first_win: null, beat_a: null, beat_b: null,
    home: { have: 0, goal: 2, unit: "stops" }, student: { have: 0, goal: MOVES_GOAL, unit: "moves" },
    second_nature: { have: 0, goal: MOVES_GOAL, unit: "lands" }, song: { have: 0, goal: SCORE_GOAL, unit: "points" },
  });
  const part = by({ ...EMPTY_PROFILE, cleared: ["a", "zzz"], moves: { jab: 3, duck: 1 }, bestScore: 500 });
  expect(part.home).toMatchObject({ have: 1 });
  expect(part.student).toMatchObject({ have: 2 });
  expect(part.second_nature).toMatchObject({ have: 3 });
  expect(part.song).toMatchObject({ have: 500 });
  expect(by({ ...EMPTY_PROFILE, moves: { jab: 40 }, bestScore: 9000 }).second_nature).toMatchObject({ have: MOVES_GOAL });
  expect(by({ ...EMPTY_PROFILE, bestScore: 9000 }).song).toMatchObject({ have: SCORE_GOAL });
  expect(achievements(EMPTY_PROFILE, []).find((feat) => feat.id === "home")?.progress).toBeNull();
});

test("newlyUnlocked lists only what a fight turned on, several at once, none when nothing changed", () => {
  const before = achievements(EMPTY_PROFILE, ROAD);
  const win = withFight(EMPTY_PROFILE, { enemyId: "a", won: true, score: SCORE_GOAL, mastery: { jab: MOVES_GOAL } });
  expect(newlyUnlocked(before, achievements(win, ROAD)).map((feat) => feat.id)).toEqual(["first_win", "beat_a", "second_nature", "song"]);
  const again = withFight(win, { enemyId: "a", won: true, score: SCORE_GOAL, mastery: { jab: 1 } });
  expect(newlyUnlocked(achievements(win, ROAD), achievements(again, ROAD))).toEqual([]);
  const last = withFight(again, { enemyId: "b", won: true, score: 1, mastery: {} });
  expect(newlyUnlocked(achievements(again, ROAD), achievements(last, ROAD)).map((feat) => feat.id)).toEqual(["beat_b", "home"]);
});
