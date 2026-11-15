// The settings store: validating parser, field-by-field fallback, saving on change and subscribers.
import { expect, test, vi } from "vitest";
import { cameraUnder, createSettingsStore, DEFAULT_SETTINGS, parseSettings, SETTINGS_KEY } from "../src/settings/store";
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

test("the control choice defaults to the camera, keeps keyboard, and refuses anything else", () => {
  expect(DEFAULT_SETTINGS.controls).toBe("camera");
  expect(parseSettings(JSON.stringify({ controls: "keyboard" })).controls).toBe("keyboard");
  expect(parseSettings(JSON.stringify({ controls: "gamepad" })).controls).toBe("camera");
  const storage = memory();
  createSettingsStore(storage).set({ controls: "keyboard" });
  expect(createSettingsStore(storage).get().controls).toBe("keyboard");
});

test("a fight gets the running camera only while Play with says Camera, so a keyboard choice is not asked to calibrate again", () => {
  const running = { name: "tracker" };
  expect(cameraUnder("camera", running)).toBe(running);
  expect(cameraUnder("keyboard", running)).toBeNull();
  expect(cameraUnder("camera", null)).toBeNull();
  // "Use keyboard instead" sets Keyboard, so every later fight of the story gets no camera; "Use camera" sets Camera back.
  const store = createSettingsStore(memory());
  store.set({ controls: "keyboard" });
  expect(cameraUnder(store.get().controls, running)).toBeNull();
  store.set({ controls: "camera" });
  expect(cameraUnder(store.get().controls, running)).toBe(running);
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
