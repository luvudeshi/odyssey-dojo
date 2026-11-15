// The browser's rules for a save held against the server's. The two are written apart (the server adds what only it
// needs: tidying text so Postgres can store it), so this is what keeps them the same.
import { expect, test } from "vitest";
import * as browserRules from "../src/account/contracts";
import { SaveSchema } from "../src/account/contracts";
import { applySave, readSave, snapshot } from "../src/account/snapshot";
import { EMPTY_PROFILE } from "../src/account/store";
import { DEFAULT_SETTINGS } from "../src/settings/store";
import * as serverRules from "../server/lib/accountRules";
import { parseSaveBody } from "../server/lib/accountRules";
import { browser, fight } from "./helpers/accountKit";

test("the browser and the server hold a save to the same bounds", () => {
  expect([serverRules.SAVE_KEYS_MAX, serverRules.SAVE_LIST_MAX, serverRules.SAVE_DEPTH, serverRules.SAVE_TEXT_MAX, serverRules.SAVE_NUMBER_MAX, serverRules.SAVE_BODY_BYTES])
    .toEqual([browserRules.SAVE_KEYS_MAX, browserRules.SAVE_LIST_MAX, browserRules.SAVE_DEPTH, browserRules.SAVE_TEXT_MAX, browserRules.SAVE_NUMBER_MAX, browserRules.SAVE_MAX_BYTES]);
  expect([serverRules.NAME_MIN, serverRules.NAME_MAX, serverRules.PASSWORD_MIN, serverRules.PASSWORD_MAX])
    .toEqual([browserRules.ACCOUNT_NAME_MIN, browserRules.ACCOUNT_NAME_MAX, browserRules.PASSWORD_MIN, browserRules.PASSWORD_MAX]);
});

test("what one side takes the other takes, and what one refuses the other refuses", () => {
  const good = snapshot(browser().stores);
  const deep = (depth: number): unknown => (depth === 0 ? 1 : { in: deep(depth - 1) });
  const many = (count: number): string[] => Array.from({ length: count }, (_, index) => `id_${String(index)}`);
  const cases: readonly unknown[] = [
    good, { ...good, profile: {} }, { ...good, profile: { ...good.profile, later: { a: [1, "two", null, true] } } }, { ...good, character: { id: "zeus" } },
    { ...good, profile: { ...good.profile, field: deep(serverRules.SAVE_DEPTH) } }, { ...good, profile: { ...good.profile, field: deep(serverRules.SAVE_DEPTH + 1) } },
    { ...good, profile: { ...good.profile, cleared: many(serverRules.SAVE_LIST_MAX) } }, { ...good, profile: { ...good.profile, cleared: many(serverRules.SAVE_LIST_MAX + 1) } },
    { ...good, profile: { ...good.profile, fights: serverRules.SAVE_NUMBER_MAX } }, { ...good, profile: { ...good.profile, fights: serverRules.SAVE_NUMBER_MAX + 1 } },
    { ...good, profile: { ...good.profile, name: "x".repeat(serverRules.SAVE_TEXT_MAX + 1) } }, { ...good, settings: { ["k".repeat(61)]: 1 } },
    { ...good, version: 2 }, { ...good, profile: [] }, { ...good, settings: null }, { ...good, character: 7 }, { ...good, achievements: [""] }, { ...good, achievements: many(serverRules.SAVE_LIST_MAX + 1) },
    null, "save", {},
  ];
  for (const whole of cases) {
    expect(parseSaveBody({ save: whole }) !== null, JSON.stringify(whole).slice(0, 100)).toBe(SaveSchema.safeParse(whole).success);
  }
});

test("a whole profile goes to the server and back without losing a field, whatever fields it has", () => {
  const first = browser();
  // Every field given a value that is not its empty one, by its kind, so a field added later is covered without a change here.
  const full = Object.fromEntries(Object.entries(EMPTY_PROFILE).map(([field, empty], index) =>
    [field, typeof empty === "number" ? index + 1 : typeof empty === "string" ? "Luv" : Array.isArray(empty) ? [`${field}_a`, `${field}_b`] : { jab: index + 1 }]));
  first.profile.replace(full);
  first.profile.record(fight("polyphemus", true, 2400, { jab: 6 }));
  first.settings.set({ musicVolume: 0.25, keyHints: false, quality: "low" });
  first.pick("athena");
  const sent = snapshot(first.stores);

  // What the server stores is what was sent, field for field.
  const stored = parseSaveBody(JSON.parse(JSON.stringify({ save: sent })) as unknown);
  expect(stored).toEqual(sent);

  // And a second browser that reads it has the same profile, the settings that travel, and the character.
  const back = readSave(JSON.parse(JSON.stringify(stored)) as unknown);
  if (back === null || back === "unreadable") throw new Error("the save did not read back");
  const second = browser();
  applySave(second.stores, back);
  expect(second.profile.get()).toEqual(first.profile.get());
  expect(Object.keys(second.profile.get()).sort()).toEqual(Object.keys(EMPTY_PROFILE).sort());
  expect(second.settings.get()).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 0.25, keyHints: false });
  expect(second.stores.character.get()).toBe("athena");
});
