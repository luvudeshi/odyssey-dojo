import { expect, test } from "vitest";
import { achievements, BLOCKS_GOAL, COMBO_GOAL, EPIC_SCORE_GOAL, MOVES_GOAL, SCORE_GOAL, STYLES_GOAL } from "../src/account/achievements";
import { newTally, tallyFrame } from "../src/account/tally";
import { newlyUnlocked } from "../src/account/unlocks";
import { cleanName, createProfileStore, EMPTY_PROFILE, NAME_MAX, parseProfile, PROFILE_KEY, withFight } from "../src/account/store";
import type { CombatEvent, EnemyAttack, EnemySpec } from "../src/core/types";
import { STYLES } from "../src/styles/registry";

const stop = (id: string): EnemySpec => ({ id, name: id.toUpperCase() }) as EnemySpec;
const ROAD = [stop("a"), stop("b")];
/** A fight in which the player was hit once and did nothing else worth counting. */
const HIT = { ...newTally(), hitsTaken: 1 };
const NEW_IDS = ["ages", "favoured", "olympus", "unbroken", "chain", "shield_wall", "light_footed", "many_ways", "veteran", "pupil", "pride", "shoulder"];

test("a stored profile of any shape reads back as a valid one", () => {
  expect(parseProfile(null)).toEqual(EMPTY_PROFILE);
  expect(parseProfile("not json")).toEqual(EMPTY_PROFILE);
  expect(parseProfile("[1,2]")).toEqual(EMPTY_PROFILE);
  const odd = parseProfile(JSON.stringify({ name: 7, cleared: ["a", 3, "a"], moves: { jab: 2.9, hook: -1, cross: "x" }, bestScore: -5, fights: "9", wins: 1.5 }));
  expect(odd).toEqual({ ...EMPTY_PROFILE, cleared: ["a"], moves: { jab: 2 }, wins: 1 });
});

test("a hero name loses control characters and is cut to the limit, spaces kept", () => {
  expect(cleanName("Toyo\n\tthe Bold\u007f")).toBe("Toyothe Bold");
  expect(cleanName("x".repeat(NAME_MAX + 9))).toHaveLength(NAME_MAX);
  expect(cleanName("Wily ")).toBe("Wily ");
  expect(cleanName(undefined)).toBe("");
});

test("a fight adds to the counts; a stop is cleared once and only by a win", () => {
  const lost = withFight(EMPTY_PROFILE, { enemyId: "a", won: false, score: 300, mastery: { jab: 2 }, styleId: "boxer", tally: HIT });
  expect(lost).toMatchObject({ cleared: [], fights: 1, wins: 0, bestScore: 300, moves: { jab: 2 } });
  const won = withFight(lost, { enemyId: "a", won: true, score: 120, mastery: { jab: 1, block: 4 }, styleId: "boxer", tally: HIT });
  const again = withFight(won, { enemyId: "a", won: true, score: 900, mastery: {}, styleId: "boxer", tally: HIT });
  expect(again).toMatchObject({ cleared: ["a"], fights: 3, wins: 2, bestScore: 900, moves: { jab: 3, block: 4 } });
});

test("the store saves each change and a new store reads it back; a storage that throws is survived", () => {
  const kept = new Map<string, string>();
  const storage = { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => { kept.set(key, value); } };
  const store = createProfileStore(storage);
  let calls = 0;
  const stopListening = store.subscribe(() => { calls += 1; });
  store.rename("Penelope");
  store.record({ enemyId: "a", won: true, score: 50, mastery: { duck: 1 }, styleId: "boxer", tally: HIT });
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
  expect(none.map((feat) => feat.id)).toEqual(["first_win", "beat_a", "beat_b", "home", "student", "second_nature", "song", ...NEW_IDS]);
  expect(none.every((feat) => !feat.done)).toBe(true);
  const some = achievements({ ...EMPTY_PROFILE, wins: 1, cleared: ["a"], moves: { jab: MOVES_GOAL }, bestScore: SCORE_GOAL - 1 }, ROAD);
  expect(some.filter((feat) => feat.done).map((feat) => feat.id)).toEqual(["first_win", "beat_a", "second_nature"]);
  const moves = Object.fromEntries(Array.from({ length: MOVES_GOAL }, (_, i) => [`m${String(i)}`, 1]));
  const all = achievements({ ...EMPTY_PROFILE, wins: 2, cleared: ["a", "b"], moves, bestScore: SCORE_GOAL }, ROAD);
  expect(all.filter((feat) => !feat.done).map((feat) => feat.id)).toEqual(["second_nature", ...NEW_IDS]);
  expect(achievements(EMPTY_PROFILE, []).find((feat) => feat.id === "home")?.done).toBe(false);
});

test("the counted achievements report progress toward their goal, capped at it; the rest report none", () => {
  const by = (profile: typeof EMPTY_PROFILE) => Object.fromEntries(achievements(profile, ROAD).map((feat) => [feat.id, feat.progress]));
  expect(by(EMPTY_PROFILE)).toMatchObject({
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
  const win = withFight(EMPTY_PROFILE, { enemyId: "a", won: true, score: SCORE_GOAL, mastery: { jab: MOVES_GOAL }, styleId: "boxer", tally: HIT });
  expect(newlyUnlocked(before, achievements(win, ROAD)).map((feat) => feat.id)).toEqual(["first_win", "beat_a", "second_nature", "song"]);
  const again = withFight(win, { enemyId: "a", won: true, score: SCORE_GOAL, mastery: { jab: 1 }, styleId: "boxer", tally: HIT });
  expect(newlyUnlocked(achievements(win, ROAD), achievements(again, ROAD))).toEqual([]);
  const last = withFight(again, { enemyId: "b", won: true, score: 1, mastery: {}, styleId: "boxer", tally: HIT });
  expect(newlyUnlocked(achievements(again, ROAD), achievements(last, ROAD)).map((feat) => feat.id)).toEqual(["beat_b", "home"]);
});

test("the tally counts powers, blocks, dodges, hits, the best combo and a guest, frame by frame", () => {
  const attack = (counter: string): EnemyAttack => ({ id: counter, name: counter, telegraphMs: 1, damage: 1, counter });
  const defended = (counter: string): CombatEvent => ({ type: "defended", attack: attack(counter) });
  const tally = newTally();
  tallyFrame(tally, [defended("block"), defended("dodge_left"), defended("dodge_right"), defended("duck")], 4, false);
  tallyFrame(tally, [{ type: "powerUnleashed", damage: 5 }, { type: "playerHit", attack: attack("block"), damage: 3 }], 0, true);
  expect(tally).toEqual({ powers: 1, blocks: 1, dodges: 2, hitsTaken: 1, bestCombo: 4, room: true });
});

test("the new achievements follow the new counters, and a profile saved before them reads as zero", () => {
  const old = parseProfile(JSON.stringify({ name: "Nobody", wins: 3, fights: 4, cleared: ["a"], bestScore: 900 }));
  expect(old).toMatchObject({ wins: 3, powers: 0, blocks: 0, dodges: 0, bestCombo: 0, unhit: 0, styles: [], dojo: 0, dojoPerfect: 0, rooms: 0 });
  const done = (profile: typeof EMPTY_PROFILE): readonly string[] => achievements(profile, ROAD).filter((feat) => feat.done).map((feat) => feat.id);
  const clean = withFight(old, { enemyId: "b", won: true, score: EPIC_SCORE_GOAL, mastery: {}, styleId: "hoplite", tally: { powers: 1, blocks: BLOCKS_GOAL, dodges: 2, hitsTaken: 0, bestCombo: COMBO_GOAL, room: true } });
  expect(clean).toMatchObject({ powers: 1, blocks: BLOCKS_GOAL, dodges: 2, bestCombo: COMBO_GOAL, unhit: 1, styles: ["hoplite"], rooms: 1 });
  expect(done(clean)).toEqual(expect.arrayContaining(["ages", "favoured", "unbroken", "chain", "shield_wall", "shoulder"]));
  expect(done(clean)).not.toEqual(expect.arrayContaining(["olympus"]));
  expect(done(withFight(clean, { enemyId: "b", won: false, score: 0, mastery: {}, styleId: "karate", tally: newTally() }))).not.toContain("many_ways");
  expect(done({ ...EMPTY_PROFILE, styles: STYLES.map((style) => style.id) })).toContain("many_ways");
  expect(STYLES).toHaveLength(STYLES_GOAL);
});

test("a dojo session and a guest's room fight are recorded and kept", () => {
  const storage = new Map<string, string>();
  const box = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
  const store = createProfileStore(box);
  store.recordDojo(false);
  store.recordDojo(true);
  store.recordRoom();
  expect(createProfileStore(box).get()).toMatchObject({ dojo: 2, dojoPerfect: 1, rooms: 1 });
  expect(achievements(store.get(), ROAD).filter((feat) => feat.done).map((feat) => feat.id)).toEqual(["pupil", "pride", "shoulder"]);
});
