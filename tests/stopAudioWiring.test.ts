// The pieces that wire a stop's sound into a fight: the ambience gain under speech and pause, and the event override in sfx.
import { expect, test, vi } from "vitest";
import { ambienceGain } from "../src/audio/stopAudio";
import { stopClipFor } from "../src/audio/stopSounds";
import type { CombatEvent } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";

test("the ambience sits at 0.16, halves under a spoken line and is silent while paused", () => {
  expect(ambienceGain(1, false, false)).toBeCloseTo(0.16);
  expect(ambienceGain(1, true, false)).toBeCloseTo(0.08);
  expect(ambienceGain(0.5, false, false)).toBeCloseTo(0.08);
  expect(ambienceGain(1, true, true)).toBe(0);
});

test("the ambience is quieter than the stop's event sounds and the usual effects", () => {
  expect(ambienceGain(1, false, false)).toBeLessThan(0.5);
});

test("circe's wand telegraphs with the wand, lands as a squeal, and an unlisted attack keeps the usual sound", () => {
  const attacks = ENEMIES.find((spec) => spec.id === "circe")?.attacks ?? [];
  const wand = attacks.find((each) => each.id === "wand_left");
  expect(wand).toBeDefined();
  if (!wand) return;
  expect(stopClipFor("circe", { type: "telegraph", attack: wand })).toBe("wand");
  expect(stopClipFor("circe", { type: "playerHit", attack: wand, damage: wand.damage })).toBe("squeal");
  expect(stopClipFor("circe", { type: "telegraph", attack: { ...wand, id: "unlisted" } })).toBeNull();
});

test("an event override that plays the sound skips the usual one, and one that declines lets it through", async () => {
  const started: unknown[] = [];
  class FakeContext {
    readonly sampleRate = 44100;
    readonly destination = {};
    state = "running";
    createGain = () => ({ gain: { value: 1 }, connect: (node: unknown) => node });
    createBuffer = (_channels: number, length: number) => ({ length, getChannelData: () => new Float32Array(length) });
    createBufferSource = () => {
      const source = { buffer: null, playbackRate: { value: 1 }, connect: (node: unknown) => node, start: () => started.push(source) };
      return source;
    };
    decodeAudioData = () => Promise.reject(new Error("no clip"));
    resume = () => Promise.resolve();
  }
  vi.useFakeTimers();
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  try {
    const fresh = await import("../src/audio/sfx");
    const event: CombatEvent = { type: "whiffed" };
    const takes = vi.fn(() => true);
    fresh.setEventOverride(takes);
    fresh.playEvent(event);
    expect(takes).toHaveBeenCalledExactlyOnceWith(event);
    expect(started).toHaveLength(0);

    const declines = vi.fn(() => false);
    fresh.setEventOverride(declines);
    fresh.playEvent(event);
    expect(declines).toHaveBeenCalledExactlyOnceWith(event);
    expect(started).toHaveLength(1);

    fresh.setEventOverride(null);
    fresh.playEvent(event);
    expect(started).toHaveLength(2);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
