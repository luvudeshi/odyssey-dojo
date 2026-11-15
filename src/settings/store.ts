// Player settings: one typed object, kept in localStorage, readable anywhere (get) or from React (useSettings).
// Music code reads `musicVolume` from here; the volume of every sound is a plain 0..1 multiplier.
import { useSyncExternalStore } from "react";
import { log } from "../core/log";

export interface Settings {
  /** How Story mode and the Training Dojo start: the webcam, or the keys with no camera asked for. */
  readonly controls: "camera" | "keyboard";
  readonly quality: "high" | "low";
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly voiceVolume: number;
  /** Flip the webcam picture so it behaves like a mirror. */
  readonly mirror: boolean;
  /** Show the key to press on the move prompt card. */
  readonly keyHints: boolean;
}

export const SETTINGS_KEY = "odyssey-dojo.settings";

/** The camera a fight is handed: none while Play with says Keyboard, even if the camera of the session is still running. */
export const cameraUnder = <T>(controls: Settings["controls"], tracker: T | null): T | null => (controls === "keyboard" ? null : tracker);

export const DEFAULT_SETTINGS: Settings ={ controls: "camera", quality: "high", musicVolume: 0.7, sfxVolume: 1, voiceVolume: 1, mirror: true, keyHints: true };

const volume = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

/** Reads stored JSON of any shape; every field that is missing or wrong falls back to its default, the rest are kept. */
export function parseSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  let data: Readonly<Record<string, unknown>> = {};
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : null;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch (error) {
    log("warn", "settings.corrupt", error);
  }
  return {
    controls: data.controls === "camera" || data.controls === "keyboard" ? data.controls : d.controls,
    quality: data.quality === "high" || data.quality === "low" ? data.quality : d.quality,
    musicVolume: volume(data.musicVolume, d.musicVolume),
    sfxVolume: volume(data.sfxVolume, d.sfxVolume),
    voiceVolume: volume(data.voiceVolume, d.voiceVolume),
    mirror: typeof data.mirror === "boolean" ? data.mirror : d.mirror,
    keyHints: typeof data.keyHints === "boolean" ? data.keyHints : d.keyHints,
  };
}

/** The part of localStorage used, so a test can pass a stand-in. Private windows may throw on either call. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function browserStorage(): SettingsStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export interface SettingsStore {
  readonly get: () => Settings;
  readonly set: (patch: Partial<Settings>) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createSettingsStore(storage: SettingsStorage | null): SettingsStore {
  const read = (): string | null => {
    try {
      return storage?.getItem(SETTINGS_KEY) ?? null;
    } catch (error) {
      log("warn", "settings.read", error);
      return null;
    }
  };
  let current = parseSettings(read());
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(patch) {
      current = parseSettings(JSON.stringify({ ...current, ...patch }));
      try {
        storage?.setItem(SETTINGS_KEY, JSON.stringify(current));
      } catch (error) {
        log("warn", "settings.save", error);
      }
      listeners.forEach((listener) => { listener(); });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

const shared = createSettingsStore(browserStorage());

export const getSettings = shared.get;
export const setSettings = shared.set;
export const subscribeSettings = shared.subscribe;

export function useSettings(): Settings {
  return useSyncExternalStore(shared.subscribe, shared.get, shared.get);
}
