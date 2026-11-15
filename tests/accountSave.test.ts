// The save made from the three stores and put back into them (src/account/snapshot.ts), and its schema.
import { expect, test } from "vitest";
import { ACCOUNT_NAME_MAX, SAVE_KEYS_MAX, SAVE_LIST_MAX, SAVE_MAX_BYTES, SAVE_NUMBER_MAX, SAVE_TEXT_MAX, SaveSchema } from "../src/account/contracts";
import type { Save } from "../src/account/contracts";
import { applySave, characterIn, readSave, sameSave, settingsPatch, snapshot, SYNCED_SETTINGS } from "../src/account/snapshot";
import { EMPTY_PROFILE, NAME_MAX, PROFILE_KEY } from "../src/account/store";
import { CHARACTER_KEY, saveCharacter, subscribeCharacter } from "../src/characters/characters";
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "../src/settings/store";
import { browser, fight, memory } from "./helpers/accountKit";

const SYNCED = { musicVolume: 0.35, sfxVolume: 1, voiceVolume: 1, keyHints: true };

function played() {
  const b = browser();
  b.profile.rename("Luv");
  b.profile.record(fight("polyphemus", true, 2400, { jab: 6, block: 1 }));
  b.profile.record(fight("circe", false, 300, { jab: 1 }));
  b.settings.set({ musicVolume: 0.35, mirror: false, quality: "low" });
  b.pick("zeus");
  return b;
}

test("a snapshot holds the whole profile, the settings that go with the player, the character and the achievements", () => {
  const save = snapshot(played().stores);
  expect(save).toEqual({
    version: 1,
    profile: { ...EMPTY_PROFILE, name: "Luv", cleared: ["polyphemus"], moves: { jab: 7, block: 1 }, bestScore: 2400, fights: 2, wins: 1, styles: ["boxer"] },
    settings: SYNCED,
    character: "zeus",
    achievements: ["beat_polyphemus"],
  });
  expect(SaveSchema.safeParse(save).success).toBe(true);
  expect(JSON.stringify({ save }).length).toBeLessThan(SAVE_MAX_BYTES);
  expect(SaveSchema.safeParse(snapshot(browser().stores)).success).toBe(true);
  expect(ACCOUNT_NAME_MAX).toBe(NAME_MAX);
});

test("every field of the profile is in the snapshot, whatever fields it has: none is named in the account code", () => {
  const b = browser();
  // Every field given a value that is not its empty one, by its kind, so a field added later is covered without a change here.
  const full = Object.fromEntries(Object.entries(EMPTY_PROFILE).map(([field, empty], index) =>
    [field, typeof empty === "number" ? index + 1 : typeof empty === "string" ? "Luv" : Array.isArray(empty) ? [`${field}_a`, `${field}_b`] : { jab: index + 1 }]));
  b.profile.replace(full);
  expect(b.profile.get()).toEqual(full);
  const save = snapshot(b.stores);
  expect(save.profile).toEqual(full);
  expect(Object.keys(save.profile).sort()).toEqual(Object.keys(EMPTY_PROFILE).sort());
  // Out to the account and back into an empty browser: every field arrives.
  const back = readSave(JSON.parse(JSON.stringify(save)) as unknown);
  if (back === null || back === "unreadable") throw new Error("the save did not read back");
  const second = browser();
  applySave(second.stores, back);
  expect(second.profile.get()).toEqual(full);
});

test("the settings of the machine stay on the machine: camera or keyboard, quality and the mirror are neither sent nor taken", () => {
  const b = played();
  b.settings.set({ controls: "keyboard" });
  const save = snapshot(b.stores);
  expect(Object.keys(save.settings).sort()).toEqual([...SYNCED_SETTINGS].sort());
  const laptop = browser();
  applySave(laptop.stores, { ...save, settings: { ...save.settings, controls: "keyboard", quality: "low", mirror: false } });
  expect(laptop.settings.get()).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 0.35 });
});

test("round trip: a snapshot applied to an empty browser gives the same snapshot, and is written to its storage", () => {
  const save = snapshot(played().stores);
  const second = browser();
  applySave(second.stores, save);
  expect(snapshot(second.stores)).toEqual(save);
  expect(sameSave(snapshot(second.stores), save)).toBe(true);
  // A new page on the same storage reads it all back.
  expect(snapshot(browser(second.storage).stores)).toEqual(save);
  expect(JSON.parse(second.storage.data.get(PROFILE_KEY) ?? "") as unknown).toMatchObject({ name: "Luv", cleared: ["polyphemus"], styles: ["boxer"] });
  expect(JSON.parse(second.storage.data.get(SETTINGS_KEY) ?? "") as unknown).toMatchObject({ musicVolume: 0.35, quality: "high", mirror: true });
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
  // The fields the bad save holds are checked one by one; the one it does not hold (styles) is left as it was.
  expect(after.profile).toEqual({ ...EMPTY_PROFILE, name: "Evil" + "x".repeat(NAME_MAX - 4), cleared: ["a"], moves: { cross: 2 }, styles: ["boxer"] });
  // The one setting of the right kind is taken, held to its range; the wrong ones leave this browser's own in place.
  expect(after.settings).toEqual({ ...before.settings, musicVolume: 1 });
  expect(b.settings.get()).toMatchObject({ quality: "low", mirror: false });
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
  applySave(b.stores, { version: 1, profile: { ...EMPTY_PROFILE }, settings: {}, character: null });
  expect(snapshot(b.stores)).toEqual({ version: 1, profile: { ...EMPTY_PROFILE }, settings: before.settings, character: "zeus" });
});

test("a save from before a field existed cannot zero it: what the save does not hold stays as it is here", () => {
  const b = played();
  const old = { version: 1, profile: { name: "Luv", cleared: ["polyphemus", "circe"], moves: { jab: 9 }, bestScore: 3000, fights: 4, wins: 2 }, settings: {}, character: null } as Save;
  applySave(b.stores, old);
  expect(b.profile.get()).toEqual({ ...EMPTY_PROFILE, ...old.profile, styles: ["boxer"] });
});

test("settingsPatch keeps the synced settings of the right kind and nothing else", () => {
  expect(settingsPatch({ quality: "low", musicVolume: 0.2, mirror: false, keyHints: 1, sfxVolume: null, other: "x" })).toEqual({ musicVolume: 0.2 });
  expect(settingsPatch({ quality: "medium", voiceVolume: -3, keyHints: false, controls: "keyboard" })).toEqual({ voiceVolume: 0, keyHints: false });
  for (const junk of [null, undefined, 4, "x", [1]]) expect(settingsPatch(junk)).toEqual({});
});

test("characterIn reads an id or an object with an id, and only a character the game has", () => {
  expect(characterIn("athena")).toBe("athena");
  expect(characterIn({ id: "achilles", palette: "x" })).toBe("achilles");
  for (const junk of ["hermes", "", null, 3, { id: 3 }, {}]) expect(characterIn(junk)).toBeNull();
});

test("readSave: no save is null, a save of another version or past the bounds is unreadable, a rough save is tidied", () => {
  expect(readSave(null)).toBeNull();
  expect(readSave(undefined)).toBeNull();
  const whole = snapshot(played().stores);
  const others: readonly unknown[] = [
    { version: 2, profile: {}, settings: {}, character: null }, { profile: {} }, "save", 4, [], { version: 1, profile: "x", settings: {}, character: null },
    // Past the bounds: it is not taken into this browser, where it would stay for good.
    { ...whole, profile: { ...whole.profile, fights: 1e300 } },
    { ...whole, profile: { ...whole.profile, cleared: Array.from({ length: SAVE_LIST_MAX + 1 }, (_, index) => `made_up_${String(index)}`) } },
    { ...whole, achievements: ["x", 4] },
  ];
  for (const other of others) expect(readSave(other), JSON.stringify(other).slice(0, 80)).toBe("unreadable");
  const rough = readSave({ version: 1, profile: { name: "Luv", cleared: ["a", "a", 2], moves: { jab: 3, no: 0 }, bestScore: 5 }, settings: { musicVolume: 0.5, junk: 1, quality: "low" }, character: { id: "zeus" }, achievements: ["x"] });
  expect(rough).toEqual({ version: 1, profile: { ...EMPTY_PROFILE, name: "Luv", cleared: ["a"], moves: { jab: 3 }, bestScore: 5 }, settings: { musicVolume: 0.5 }, character: "zeus", achievements: ["x"] });
  expect(readSave(JSON.parse(JSON.stringify(whole)) as unknown)).toEqual(whole);
});

test("sameSave does not mind the order of keys and lists", () => {
  const a = snapshot(played().stores);
  const b: Save = { ...a, profile: { ...a.profile, moves: { block: 1, jab: 7 }, cleared: ["circe", "polyphemus"] }, settings: Object.fromEntries(Object.entries(a.settings).reverse()) };
  expect(sameSave({ ...a, profile: { ...a.profile, cleared: ["polyphemus", "circe"] } }, b)).toBe(true);
  expect(sameSave(a, { ...a, profile: { ...a.profile, wins: 2 } })).toBe(false);
  expect(sameSave(a, { ...a, profile: { ...a.profile, styles: ["boxer", "jiu_jitsu"] } })).toBe(false);
  expect(sameSave(a, { ...a, character: "athena" })).toBe(false);
});

test("the schema bounds a save by size and depth, and never by which fields it has", () => {
  const good = snapshot(played().stores);
  const refuse = (change: object): boolean => !SaveSchema.safeParse({ ...good, ...change }).success;
  expect(refuse({})).toBe(false);
  expect(refuse({ profile: { ...good.profile, aFieldFromNextWeek: { deep: ["list"] } } })).toBe(false);
  expect(refuse({ settings: { ...good.settings, controls: "keyboard", somethingNew: [1, 2] } })).toBe(false);
  expect(refuse({ version: 2 })).toBe(true);
  expect(refuse({ profile: { ...good.profile, name: "x".repeat(SAVE_TEXT_MAX + 1) } })).toBe(true);
  expect(refuse({ profile: { ...good.profile, cleared: Array.from({ length: SAVE_LIST_MAX + 1 }, (_, i) => `s${String(i)}`) } })).toBe(true);
  expect(refuse({ profile: { ...good.profile, bestScore: SAVE_NUMBER_MAX * 10 } })).toBe(true);
  expect(refuse({ profile: Object.fromEntries(Array.from({ length: SAVE_KEYS_MAX + 1 }, (_, i) => [`f${String(i)}`, 1])) })).toBe(true);
  expect(refuse({ profile: { ...good.profile, deep: { a: { b: { c: { d: 1 } } } } } })).toBe(true);
  expect(refuse({ settings: { ["k".repeat(61)]: 1 } })).toBe(true);
  expect(refuse({ character: "x".repeat(61) })).toBe(true);
  expect(refuse({ achievements: ["x".repeat(61)] })).toBe(true);
  expect(refuse({ settings: [] })).toBe(true);
  expect(refuse({ profile: null })).toBe(true);
});

test("the profile store's replace checks what it is given and keeps what it is not given; a signed-out player's stores work as before", () => {
  const b = browser();
  let calls = 0;
  b.profile.subscribe(() => { calls += 1; });
  b.profile.replace({ name: "Penelope", cleared: ["a", "a"], wins: 2, fights: 1.7, moves: [] });
  const penelope = { ...EMPTY_PROFILE, name: "Penelope", cleared: ["a"], wins: 2, fights: 1 };
  expect(b.profile.get()).toEqual(penelope);
  b.profile.replace({ blocks: 4, wins: "many" });
  expect(b.profile.get()).toEqual({ ...penelope, blocks: 4, wins: 0 });
  // Something that is not a profile changes nothing.
  for (const junk of [undefined, null, 5, "text", ["a"]]) b.profile.replace(junk);
  expect(b.profile.get()).toEqual({ ...penelope, blocks: 4, wins: 0 });
  expect(calls).toBe(7);
  expect(browser(b.storage).profile.get()).toEqual({ ...penelope, blocks: 4, wins: 0 });
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
