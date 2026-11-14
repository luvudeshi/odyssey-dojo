// Guards the built-in sound effects: every combat event has a clean, loud enough, repeatable clip of the right length.
import { afterEach, expect, test, vi } from "vitest";
import { listedClips, playEvent } from "../src/audio/sfx";
import { SFX_TYPES, synthClip } from "../src/audio/sfxSynth";
import type { CombatEvent } from "../src/core/types";

/** Event type, then the shortest and longest the clip may be, in seconds. */
const EXPECTED: readonly (readonly [CombatEvent["type"], number, number])[] = [
  ["telegraph", 0.4, 0.65],
  ["defended", 0.25, 0.45],
  ["playerHit", 0.3, 0.5],
  ["opening", 0.2, 0.4],
  ["enemyHit", 0.2, 0.4],
  ["whiffed", 0.2, 0.4],
  ["won", 1.2, 1.6],
  ["lost", 1.4, 1.8],
];
const RATES = [44100, 48000];
const UNKNOWN = "notAnEvent" as string as CombatEvent["type"];

interface FakeSource {
  buffer: unknown;
  readonly playbackRate: { value: number };
  connect(node: unknown): unknown;
  start(): void;
}

/** The decoded clip file every fake context hands back. */
const DECODED = { decoded: true };

/** Just enough of an AudioContext to record what playEvent starts. */
class FakeContext {
  static latest: FakeContext | null = null;
  readonly sampleRate = 44100;
  readonly destination = {};
  readonly started: FakeSource[] = [];
  state = "running";
  resumeDelayMs = 0;

  constructor() {
    FakeContext.latest = this;
  }

  createGain(): unknown {
    return { gain: { value: 1 }, connect: (node: unknown) => node };
  }

  createBuffer(_channels: number, length: number): unknown {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }

  createBufferSource(): FakeSource {
    const source: FakeSource = {
      buffer: null,
      playbackRate: { value: 1 },
      connect: (node) => node,
      start: () => {
        this.started.push(source);
      },
    };
    return source;
  }

  decodeAudioData(): Promise<unknown> {
    return Promise.resolve(DECODED);
  }

  resume(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.state = "running";
        resolve();
      }, this.resumeDelayMs);
    });
  }
}

/** Loads a fresh copy of the sound module into a fake browser whose index.json has the given content. */
async function inBrowser(index: unknown): Promise<{ play: typeof playEvent; requested: string[] }> {
  const requested: string[] = [];
  vi.useFakeTimers();
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("fetch", (url: string) => {
    requested.push(url);
    if (index === undefined) return Promise.reject(new Error("offline"));
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(index),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
  });
  const fresh = await import("../src/audio/sfx");
  return { play: fresh.playEvent, requested };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function peak(clip: Float32Array): number {
  return clip.reduce((loudest, value) => Math.max(loudest, Math.abs(value)), 0);
}

function rms(clip: Float32Array): number {
  return Math.sqrt(clip.reduce((sum, value) => sum + value * value, 0) / clip.length);
}

test("every event type the game knows has a designed sound", () => {
  expect([...SFX_TYPES].sort()).toEqual(EXPECTED.map(([type]) => type).sort());
});

test("each clip has the right length, a healthy level, no bad samples and silent ends", () => {
  for (const rate of RATES) {
    for (const [type, shortest, longest] of EXPECTED) {
      const clip = synthClip(type, rate);
      const label = `${type} at ${String(rate)}`;
      const seconds = clip.length / rate;
      expect(seconds, label).toBeGreaterThanOrEqual(shortest);
      expect(seconds, label).toBeLessThanOrEqual(longest);
      expect(clip.every((value) => Number.isFinite(value)), label).toBe(true);
      expect(peak(clip), label).toBeGreaterThanOrEqual(0.5);
      expect(peak(clip), label).toBeLessThanOrEqual(1);
      expect(rms(clip), label).toBeGreaterThan(0.03);
      expect(Math.abs(clip[0] ?? 1), label).toBeLessThan(0.01);
      expect(Math.abs(clip.at(-1) ?? 1), label).toBeLessThan(0.01);
    }
  }
});

test("two renders of a clip are identical, and no two event types share a clip", () => {
  const clips = EXPECTED.map(([type]) => synthClip(type, 44100));
  EXPECTED.forEach(([type], index) => {
    expect(synthClip(type, 44100), type).toEqual(clips[index]);
  });
  const fingerprints = clips.map((clip) => `${String(clip.length)}:${String(rms(clip))}`);
  expect(new Set(fingerprints).size).toBe(clips.length);
});

test("an unknown event type or a bad sample rate gives a usable clip instead of throwing", () => {
  const click = synthClip(UNKNOWN, 44100);
  expect(click.length / 44100).toBeLessThan(0.1);
  expect(click.every((value) => Number.isFinite(value))).toBe(true);
  expect(peak(click)).toBeGreaterThan(0);
  expect(peak(click)).toBeLessThan(0.5);

  for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 8000, 96000]) {
    const clip = synthClip("defended", rate);
    expect(clip.length, String(rate)).toBeGreaterThan(0);
    expect(clip.every((value) => Number.isFinite(value)), String(rate)).toBe(true);
    expect(peak(clip), String(rate)).toBeLessThanOrEqual(1);
  }
});

test("index.json only yields known event types, whatever it contains", () => {
  expect(listedClips([])).toEqual([]);
  expect(listedClips(["won", "enemyHit"])).toEqual(["enemyHit", "won"]);
  expect(listedClips(["won", "won", "../secret", 7, null, { type: "lost" }])).toEqual(["won"]);
  for (const junk of [null, undefined, "won", 3, { won: true }]) expect(listedClips(junk)).toEqual([]);
});

test("playing a sound where there is no audio does nothing", () => {
  expect(() => {
    playEvent({ type: "whiffed" });
    playEvent({ type: UNKNOWN } as CombatEvent);
  }).not.toThrow();
});

test("a listed clip file replaces the synthesised sound once it has loaded, and only listed files are requested", async () => {
  const { play, requested } = await inBrowser(["won", "../secret"]);
  play({ type: "won" });
  const context = FakeContext.latest;
  expect(context?.started.length).toBe(1);
  expect(context?.started[0]?.buffer).not.toBe(DECODED);

  await vi.advanceTimersByTimeAsync(1000);
  play({ type: "won" });
  play({ type: "whiffed" });
  play({ type: UNKNOWN } as CombatEvent);
  expect(context?.started.map((source) => source.buffer === DECODED)).toEqual([false, true, false]);
  expect(requested).toEqual(["/audio/sfx/index.json", "/audio/sfx/won.mp3"]);
});

test("repeated hits vary in pitch by at most four percent, and other sounds do not vary", async () => {
  const { play } = await inBrowser([]);
  for (let i = 0; i < 20; i++) play({ type: "enemyHit", move: "jab", damage: 1 });
  play({ type: "whiffed" });
  const rates = FakeContext.latest?.started.map((source) => source.playbackRate.value) ?? [];
  expect(rates.length).toBe(21);
  expect(new Set(rates.slice(0, 20)).size).toBeGreaterThan(1);
  for (const rate of rates) expect(Math.abs(rate - 1)).toBeLessThanOrEqual(0.04 + 1e-9);
  expect(rates[20]).toBe(1);
});

test("a suspended context is resumed, and a sound that waited too long is dropped", async () => {
  const { play } = await inBrowser(undefined);
  play({ type: "whiffed" });
  const context = FakeContext.latest;
  if (!context) throw new Error("no context was created");
  await vi.advanceTimersByTimeAsync(1000);
  expect(context.started.length).toBe(1);

  context.state = "suspended";
  play({ type: "whiffed" });
  await vi.advanceTimersByTimeAsync(50);
  expect(context.state).toBe("running");
  expect(context.started.length).toBe(2);

  context.state = "suspended";
  context.resumeDelayMs = 5000;
  play({ type: "whiffed" });
  await vi.advanceTimersByTimeAsync(6000);
  expect(context.started.length).toBe(2);
});

test("a browser whose audio fails to start stays silent", async () => {
  const { play } = await inBrowser([]);
  vi.stubGlobal("AudioContext", function broken() {
    throw new Error("no audio device");
  });
  expect(() => {
    play({ type: "won" });
    play({ type: "lost" });
  }).not.toThrow();
});
