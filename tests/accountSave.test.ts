// The save made from the three stores and put back into them (src/account/snapshot.ts), and its schema.
import { expect, test } from "vitest";
import { ACCOUNT_NAME_MAX, SAVE_MAX_BYTES, SaveSchema } from "../src/account/contracts";
import type { Save } from "../src/account/contracts";
import { applySave, characterIn, readSave, sameSave, settingsPatch, snapshot } from "../src/account/snapshot";
import { EMPTY_PROFILE, NAME_MAX, PROFILE_KEY } from "../src/account/store";
import { CHARACTER_KEY, saveCharacter, subscribeCharacter } from "../src/characters/characters";
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "../src/settings/store";
import { browser, memory } from "./helpers/accountKit";

function played() {
  const b = browser();
  b.profile.rename("Luv");
  b.profile.record({ enemyId: "polyphemus", won: true, score: 2400, mastery: { jab: 6, block: 1 } });
  b.profile.record({ enemyId: "circe", won: false, score: 300, mastery: { jab: 1 } });
  b.settings.set({ musicVolume: 0.35, mirror: false, quality: "low" });
  b.pick("zeus");
  return b;
}

test("a snapshot holds the profile, the settings, the character and the achievements, and passes the schema", () => {
  const save = snapshot(played().stores);
  expect(save).toEqual({
    version: 1,
    profile: { name: "Luv", cleared: ["polyphemus"], moves: { jab: 7, block: 1 }, bestScore: 2400, fights: 2, wins: 1 },
    settings: { ...DEFAULT_SETTINGS, musicVolume: 0.35, mirror: false, quality: "low" },
    character: "zeus",
    achievements: ["beat_polyphemus"],
  });
  expect(SaveSchema.safeParse(save).success).toBe(true);
  expect(JSON.stringify({ save }).length).toBeLessThan(SAVE_MAX_BYTES);
  expect(SaveSchema.safeParse(snapshot(browser().stores)).success).toBe(true);
  expect(ACCOUNT_NAME_MAX).toBe(NAME_MAX);
});

test("round trip: a snapshot applied to an empty browser gives the same snapshot, and is written to its storage", () => {
  const save = snapshot(played().stores);
  const second = browser();
  applySave(second.stores, save);
  expect(snapshot(second.stores)).toEqual(save);
  expect(sameSave(snapshot(second.stores), save)).toBe(true);
  // A new page on the same storage reads it all back.
  expect(snapshot(browser(second.storage).stores)).toEqual(save);
  expect(JSON.parse(second.storage.data.get(PROFILE_KEY) ?? "") as unknown).toMatchObject({ name: "Luv", cleared: ["polyphemus"] });
  expect(JSON.parse(second.storage.data.get(SETTINGS_KEY) ?? "") as unknown).toMatchObject({ musicVolume: 0.35, quality: "low" });
  expect(second.storage.data.get(CHARACTER_KEY)).toBe("zeus");
});

test("a bad save cannot corrupt the stores: wrong parts are dropped by each store's own check", () => {
  const b = played();
  const before = snapshot(b.stores);
  const bad = {
    version: 1,
    profile: { name: "Evil\n\u0000" + "x".repeat(60), cleared: ["a", 7, "a", null], moves: { jab: -4, hook: "many", cross: 2.9 }, bestScore: "high", fights: Number.NaN, wins: -1 },
    settings: { quality: "ultra", musicVolume: 7, sfxVolume: "loud", mirror: "yes", extra: { deep: true } },
    character: "hermes",
  } as unknown as Save;
  applySave(b.stores, bad);
  const after = snapshot(b.stores);
  expect(after.profile).toEqual({ name: "Evil" + "x".repeat(NAME_MAX - 4), cleared: ["a"], moves: { cross: 2 }, bestScore: 0, fights: 0, wins: 0 });
  // The one setting of the right kind is taken, held to its range; the wrong ones leave this browser's own in place.
  expect(after.settings).toEqual({ ...before.settings, musicVolume: 1 });
  expect(after.character).toBe("zeus");
  expect(SaveSchema.safeParse(after).success).toBe(true);
  // Something that is not a save at all changes nothing and throws nothing.
  for (const junk of [null, 5, "text", [], {}, { version: 2, profile: { name: "Other" } }, { version: 1, profile: null, settings: 3, character: {} }]) {
    applySave(b.stores, junk as unknown as Save);
    expect(snapshot(b.stores)).toEqual(after);
  }
});

test("applySave on a save with no usable parts changes only the profile", () => {
  const b = played();
  const before = snapshot(b.stores);
  applySave(b.stores, { version: 1, profile: { ...EMPTY_PROFILE, cleared: [], moves: {} }, settings: {}, character: null });
  expect(snapshot(b.stores)).toEqual({ version: 1, profile: { ...EMPTY_PROFILE }, settings: before.settings, character: "zeus" });
});

test("settingsPatch keeps the settings of the right kind and nothing else", () => {
  expect(settingsPatch({ quality: "low", musicVolume: 0.2, mirror: false, keyHints: 1, sfxVolume: null, other: "x" })).toEqual({ quality: "low", musicVolume: 0.2, mirror: false });
  expect(settingsPatch({ quality: "medium", voiceVolume: -3 })).toEqual({ voiceVolume: 0 });
  for (const junk of [null, undefined, 4, "x", [1]]) expect(settingsPatch(junk)).toEqual({});
});

test("characterIn reads an id or an object with an id, and only a character the game has", () => {
  expect(characterIn("athena")).toBe("athena");
  expect(characterIn({ id: "achilles", palette: "x" })).toBe("achilles");
  for (const junk of ["hermes", "", null, 3, { id: 3 }, {}]) expect(characterIn(junk)).toBeNull();
});

test("readSave: no save is null, a save of another version is unreadable, a rough save is tidied", () => {
  expect(readSave(null)).toBeNull();
  expect(readSave(undefined)).toBeNull();
  for (const other of [{ version: 2, profile: {} }, { profile: {} }, "save", 4, [], { version: 1, profile: "x" }]) expect(readSave(other)).toBe("unreadable");
  const rough = readSave({ version: 1, profile: { name: "Luv", cleared: ["a", "a", 2], moves: { jab: 3, no: 0 }, bestScore: 5 }, settings: { musicVolume: 0.5, junk: 1 }, character: { id: "zeus" }, achievements: ["x", 4] });
  expect(rough).toEqual({ version: 1, profile: { name: "Luv", cleared: ["a"], moves: { jab: 3 }, bestScore: 5, fights: 0, wins: 0 }, settings: { musicVolume: 0.5 }, character: "zeus", achievements: ["x"] });
  const whole = snapshot(played().stores);
  expect(readSave(JSON.parse(JSON.stringify(whole)) as unknown)).toEqual(whole);
});

test("sameSave does not mind the order of keys and lists", () => {
  const a = snapshot(played().stores);
  const b: Save = { ...a, profile: { ...a.profile, moves: { block: 1, jab: 7 }, cleared: [...a.profile.cleared].reverse() }, settings: Object.fromEntries(Object.entries(a.settings).reverse()) };
  expect(sameSave(a, b)).toBe(true);
  expect(sameSave(a, { ...a, profile: { ...a.profile, wins: 2 } })).toBe(false);
  expect(sameSave(a, { ...a, character: "athena" })).toBe(false);
});

test("the schema refuses a save that is out of bounds", () => {
  const good = snapshot(played().stores);
  const refuse = (change: object): boolean => !SaveSchema.safeParse({ ...good, ...change }).success;
  expect(refuse({ version: 2 })).toBe(true);
  expect(refuse({ profile: { ...good.profile, name: "x".repeat(NAME_MAX + 1) } })).toBe(true);
  expect(refuse({ profile: { ...good.profile, cleared: Array.from({ length: 101 }, (_, i) => `s${String(i)}`) } })).toBe(true);
  expect(refuse({ profile: { ...good.profile, bestScore: -1 } })).toBe(true);
  expect(refuse({ profile: { ...good.profile, wins: 1.5 } })).toBe(true);
  expect(refuse({ profile: { ...good.profile, moves: { jab: 2e9 } } })).toBe(true);
  expect(refuse({ settings: { deep: { nested: true } } })).toBe(true);
  expect(refuse({ character: "x".repeat(41) })).toBe(true);
  expect(refuse({ achievements: ["x".repeat(61)] })).toBe(true);
  expect(refuse({ settings: [] })).toBe(true);
});

test("the profile store's replace checks what it is given; a signed-out player's stores work as before", () => {
  const b = browser();
  let calls = 0;
  b.profile.subscribe(() => { calls += 1; });
  b.profile.replace({ name: "Penelope", cleared: ["a", "a"], wins: 2, fights: 1.7, moves: [] });
  expect(b.profile.get()).toEqual({ ...EMPTY_PROFILE, name: "Penelope", cleared: ["a"], wins: 2, fights: 1 });
  b.profile.replace(undefined);
  expect(b.profile.get()).toEqual(EMPTY_PROFILE);
  expect(calls).toBe(2);
  expect(browser(b.storage).profile.get()).toEqual(EMPTY_PROFILE);
});

test("saveCharacter tells its listeners, and stops when they leave", () => {
  const storage = memory();
  let calls = 0;
  const leave = subscribeCharacter(() => { calls += 1; });
  expect(saveCharacter("athena", storage)).toBe("athena");
  expect(saveCharacter("hermes", storage)).toBe("odysseus");
  leave();
  saveCharacter("zeus", storage);
  expect(calls).toBe(2);
});
