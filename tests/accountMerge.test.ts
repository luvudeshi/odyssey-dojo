// The rule for joining this browser's progress with the account's (src/account/merge.ts).
import { expect, test } from "vitest";
import type { Save } from "../src/account/contracts";
import { changesBetween, mergeSaves } from "../src/account/merge";

const NO_PROGRESS = { name: "", cleared: [], moves: {}, bestScore: 0, fights: 0, wins: 0 };
const save = (profile: Partial<Save["profile"]>, rest: Partial<Save> = {}): Save => ({ version: 1, profile: { ...NO_PROGRESS, ...profile }, settings: {}, character: null, ...rest });

const PLAYED = save(
  { name: "Nobody", cleared: ["polyphemus", "circe"], moves: { jab: 6, block: 1 }, bestScore: 2400, fights: 5, wins: 3 },
  { settings: { musicVolume: 0.3, mirror: false }, character: "zeus", achievements: ["first_win", "beat_polyphemus"] },
);

test("first sign-up: an account with no save keeps all of this browser's progress and takes the account name", () => {
  const merged = mergeSaves(PLAYED, null, { accountName: "Luv" });
  expect(merged).toEqual({ ...PLAYED, profile: { ...PLAYED.profile, name: "Luv" } });
});

test("second browser: an empty browser gets everything the account has", () => {
  const empty = save({}, { settings: { musicVolume: 0.7, mirror: true }, character: "odysseus" });
  const account = { ...PLAYED, profile: { ...PLAYED.profile, name: "Luv" } };
  expect(mergeSaves(empty, account, { accountName: "Luv" })).toEqual(account);
});

test("both sides played different stops: stops and achievements are joined, counts take the larger", () => {
  const local = save(
    { name: "Local", cleared: ["sirens", "circe"], moves: { jab: 2, duck: 9 }, bestScore: 900, fights: 9, wins: 2 },
    { settings: { musicVolume: 1 }, character: "athena", achievements: ["beat_sirens", "first_win"] },
  );
  const merged = mergeSaves(local, { ...PLAYED, profile: { ...PLAYED.profile, name: "Luv the Bold" } }, { accountName: "Luv" });
  expect(merged.profile).toEqual({ name: "Luv the Bold", cleared: ["polyphemus", "circe", "sirens"], moves: { jab: 6, block: 1, duck: 9 }, bestScore: 2400, fights: 9, wins: 3 });
  expect(merged.achievements).toEqual(["first_win", "beat_polyphemus", "beat_sirens"]);
  // Settings and character are the account's, because it has them.
  expect(merged.settings).toEqual(PLAYED.settings);
  expect(merged.character).toBe("zeus");
});

test("settings and character fall back to this browser's when the account has none", () => {
  const local = save({}, { settings: { musicVolume: 1 }, character: "athena" });
  const merged = mergeSaves(local, save({ name: "Luv", cleared: ["circe"] }), { accountName: "Luv" });
  expect(merged.settings).toEqual({ musicVolume: 1 });
  expect(merged.character).toBe("athena");
  expect(merged.profile.cleared).toEqual(["circe"]);
});

test("the hero name is the one saved in the account, else the name signed in with", () => {
  expect(mergeSaves(save({ name: "Local" }), save({ name: "" }), { accountName: "Luv" }).profile.name).toBe("Luv");
  expect(mergeSaves(save({ name: "Local" }), save({ name: "Kept" }), { accountName: "Luv" }).profile.name).toBe("Kept");
});

test("a browser with changes it could not send keeps its own name, settings and character, and still loses no progress", () => {
  const local = save({ name: "Renamed", cleared: ["sirens"], wins: 1, fights: 1 }, { settings: { musicVolume: 0 }, character: "athena" });
  const merged = mergeSaves(local, { ...PLAYED, profile: { ...PLAYED.profile, name: "Luv" } }, { accountName: "Luv", prefer: "local" });
  expect(merged.profile.name).toBe("Renamed");
  expect(merged.settings).toEqual({ musicVolume: 0 });
  expect(merged.character).toBe("athena");
  expect(merged.profile.cleared).toEqual(["polyphemus", "circe", "sirens"]);
  expect(merged.profile).toMatchObject({ bestScore: 2400, fights: 5, wins: 3 });
});

test("merging is safe to repeat and never lowers anything", () => {
  const account = { ...PLAYED, profile: { ...PLAYED.profile, name: "Luv" } };
  const local = save({ cleared: ["sirens"], moves: { jab: 9 }, bestScore: 10, fights: 1, wins: 1 });
  const once = mergeSaves(local, account, { accountName: "Luv" });
  expect(mergeSaves(once, account, { accountName: "Luv" })).toEqual(once);
  expect(mergeSaves(once, once, { accountName: "Luv" })).toEqual(once);
  expect(Number(once.profile.wins)).toBeLessThanOrEqual(Number(once.profile.fights));
});

test("every kind of field is joined by its kind, so a field the game adds later needs no change here", () => {
  const local = save({
    cleared: ["circe"], styles: ["boxer"], blocks: 30, dodges: 2, bestCombo: 4, unhit: 0, powers: 1, dojo: 3, dojoPerfect: 0, rooms: 1,
    someday: { medals: 2, names: ["first"] }, motto: "local words", onlyHere: 5,
  });
  const account = save({
    name: "Luv", cleared: ["polyphemus"], styles: ["hoplite", "boxer"], blocks: 12, dodges: 9, bestCombo: 11, unhit: 2, powers: 0, dojo: 1, dojoPerfect: 1, rooms: 0,
    someday: { medals: 5, names: ["second"], extra: true }, motto: "account words", onlyThere: [1, 2],
  });
  const merged = mergeSaves(local, account, { accountName: "Luv" });
  expect(merged.profile).toEqual({
    name: "Luv", cleared: ["polyphemus", "circe"], moves: {}, bestScore: 0, fights: 0, wins: 0,
    // Lists: both. Counts: the larger.
    styles: ["hoplite", "boxer"], blocks: 30, dodges: 9, bestCombo: 11, unhit: 2, powers: 1, dojo: 3, dojoPerfect: 1, rooms: 1,
    // An object is joined field by field; a text is the account's; a field only one side has is kept.
    someday: { medals: 5, names: ["second", "first"], extra: true }, motto: "account words", onlyHere: 5, onlyThere: [1, 2],
  });
  expect(mergeSaves(local, account, { accountName: "Luv", prefer: "local" }).profile.motto).toBe("local words");
  // Nothing in either profile is lower or missing afterwards.
  for (const side of [local, account]) {
    for (const [field, value] of Object.entries(side.profile)) {
      if (typeof value === "number") expect(Number(merged.profile[field]), field).toBeGreaterThanOrEqual(value);
      if (Array.isArray(value)) expect(merged.profile[field], field).toEqual(expect.arrayContaining(value));
    }
  }
});

test("an account that was never saved to changes nothing but the name", () => {
  const local = save({ name: "Nobody", styles: ["boxer"], blocks: 3 });
  expect(mergeSaves(local, null, { accountName: "Luv" }).profile).toEqual({ ...local.profile, name: "Luv" });
  expect(mergeSaves(local, save({}, { profile: {} }), { accountName: "Luv" }).profile).toEqual({ ...local.profile, name: "Luv" });
});

test("when it is known what was changed here, only that wins: a fight sent from a stale browser does not undo a rename made elsewhere", () => {
  const account = { ...PLAYED, profile: { ...PLAYED.profile, name: "Luv the Bold" }, settings: { musicVolume: 0.3, sfxVolume: 0.8, keyHints: true }, character: "zeus" };
  const before = save({ name: "Luv", cleared: ["polyphemus"] }, { settings: { musicVolume: 0.3, sfxVolume: 1, keyHints: true }, character: "athena" });
  // A fight and nothing else.
  const fought = { ...before, profile: { ...before.profile, cleared: ["polyphemus", "sirens"], wins: 1, fights: 1 } };
  expect(changesBetween(before, fought)).toEqual({ name: false, settings: [], character: false });
  const merged = mergeSaves(fought, account, { accountName: "Luv", prefer: changesBetween(before, fought) });
  expect(merged.profile).toMatchObject({ name: "Luv the Bold", cleared: ["polyphemus", "circe", "sirens"] });
  expect(merged.settings).toEqual(account.settings);
  expect(merged.character).toBe("zeus");

  // One slider moved here: that one setting wins, the others and the name are the account's.
  const slid = { ...before, settings: { ...before.settings, musicVolume: 0.9 } };
  expect(changesBetween(before, slid)).toEqual({ name: false, settings: ["musicVolume"], character: false });
  const one = mergeSaves(slid, account, { accountName: "Luv", prefer: changesBetween(before, slid) });
  expect(one.settings).toEqual({ musicVolume: 0.9, sfxVolume: 0.8, keyHints: true });
  expect(one.profile.name).toBe("Luv the Bold");

  // A rename and a new character here win over the account's.
  const renamed = { ...before, profile: { ...before.profile, name: "Luv of Ithaca" }, character: "achilles" };
  const two = mergeSaves(renamed, account, { accountName: "Luv", prefer: changesBetween(before, renamed) });
  expect([two.profile.name, two.character, two.settings]).toEqual(["Luv of Ithaca", "achilles", account.settings]);
});
