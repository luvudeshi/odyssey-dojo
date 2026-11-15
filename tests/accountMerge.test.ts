// The rule for joining this browser's progress with the account's (src/account/merge.ts).
import { expect, test } from "vitest";
import type { Save } from "../src/account/contracts";
import { mergeSaves } from "../src/account/merge";

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
  expect(once.profile.wins).toBeLessThanOrEqual(once.profile.fights);
});
