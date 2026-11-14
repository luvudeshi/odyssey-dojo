// The settings store: validating parser, field-by-field fallback, saving on change and subscribers.
import { expect, test, vi } from "vitest";
import { createSettingsStore, DEFAULT_SETTINGS, parseSettings, SETTINGS_KEY } from "../src/settings/store";
import type { SettingsStorage } from "../src/settings/store";

function memory(initial?: string): SettingsStorage {
  const data = new Map<string, string>(initial === undefined ? [] : [[SETTINGS_KEY, initial]]);
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

test("garbage and missing values give the defaults", () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  for (const raw of [null, "", "{nope", "[]", "5", "null", 7]) expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
});

test("each bad field falls back alone and the good ones are kept", () => {
  const parsed = parseSettings(JSON.stringify({ quality: "ultra", musicVolume: 3, sfxVolume: "loud", voiceVolume: 0.25, mirror: "yes", keyHints: false }));
  expect(parsed).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 1, voiceVolume: 0.25, keyHints: false });
});

test("a change is saved, notifies, and survives a new store on the same storage", () => {
  const storage = memory();
  const store = createSettingsStore(storage);
  const listener = vi.fn();
  const off = store.subscribe(listener);
  store.set({ quality: "low", mirror: false, sfxVolume: 0.4 });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(createSettingsStore(storage).get()).toEqual({ ...DEFAULT_SETTINGS, quality: "low", mirror: false, sfxVolume: 0.4 });
  off();
  store.set({ keyHints: false });
  expect(listener).toHaveBeenCalledTimes(1);
});

test("storage that throws or is missing does not break the store", () => {
  const broken: SettingsStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  for (const storage of [broken, null]) {
    const store = createSettingsStore(storage);
    store.set({ voiceVolume: 0 });
    expect(store.get().voiceVolume).toBe(0);
  }
});
