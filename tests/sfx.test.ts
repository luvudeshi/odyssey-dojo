// Guards the built-in sound effects: every combat event has a clean, loud enough, repeatable clip of the right length.
import { afterEach, expect, test, vi } from "vitest";
import { listedClips, playEvent } from "../src/audio/sfx";
import { SFX_TYPES, startClip, synthClip } from "../src/audio/sfxSynth";
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
const SYNTH_MODULE = "../src/audio/sfxSynth";
const ATTACK = { id: "sweep", name: "Sweep", telegraphMs: 900, damage: 10, counter: "duck" };
/** The most samples a warm-up step may render: a few milliseconds of work even for the costliest clip. */
const LARGEST_SLICE = 5000;

interface FakeGain {
  readonly gain: { value: number };
  connect(node: unknown): unknown;
}

interface FakeSource {
  buffer: unknown;
  level: FakeGain | null;
  readonly playbackRate: { value: number };
  connect(node: FakeGain): FakeGain;
  start(): void;
}

/** The decoded clip file every fake context hands back. */
const DECODED = { decoded: true };

/** Just enough of an AudioContext to record what playEvent starts. */
class FakeContext {
  static latest: FakeContext | null = null;
  /** While true the browser holds audio back the way Safari does outside a user gesture: resume() just waits. */
  static locked = false;
  readonly sampleRate = 44100;
  readonly destination = {};
  readonly started: FakeSource[] = [];
  state = FakeContext.locked ? "suspended" : "running";
  resumeDelayMs = 0;

  constructor() {
    FakeContext.latest = this;
  }

  createGain(): FakeGain {
    return { gain: { value: 1 }, connect: (node: unknown) => node };
  }

  createBuffer(_channels: number, length: number): unknown {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }

  createBufferSource(): FakeSource {
    const source: FakeSource = {
      buffer: null,
      level: null,
      playbackRate: { value: 1 },
      connect: (node) => {
        source.level = node;
        return node;
      },
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
    if (FakeContext.locked) return new Promise(() => undefined);
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
  FakeContext.locked = false;
  vi.doUnmock(SYNTH_MODULE);
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

/** One second-order Butterworth high-pass over a clip. */
function highpass(clip: Float32Array, rate: number, hz: number): Float32Array {
  const angle = (2 * Math.PI * hz) / rate;
  const cos = Math.cos(angle);
  const alpha = Math.sin(angle) / Math.SQRT2;
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  return clip.map((x) => {
    const y = (((1 + cos) / 2) * (x - 2 * x1 + x2) + 2 * cos * y1 - (1 - alpha) * y2) / (1 + alpha);
    [x1, x2, y1, y2] = [x, x1, y, y1];
    return y;
  });
}

/** What is left of a clip above a frequency, cut steeply (24 dB per octave) the way a small speaker cuts bass. */
function above(clip: Float32Array, rate: number, hz: number): Float32Array {
  return highpass(highpass(clip, rate, hz), rate, hz);
}

/** The share of a clip's energy that lies above a frequency. */
function shareAbove(clip: Float32Array, rate: number, hz: number): number {
  return (rms(above(clip, rate, hz)) / rms(clip)) ** 2;
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

test("a clip rendered in slices of any size is the same clip", () => {
  for (const type of [...SFX_TYPES, UNKNOWN]) {
    const whole = synthClip(type, 44100);
    for (const slice of [4000, 1777, whole.length, Number.NaN, 0]) {
      const sliced = startClip(type, 44100);
      let steps = 1;
      while (!sliced.advance(slice)) steps++;
      const label = `${type} in slices of ${String(slice)}`;
      expect(steps, label).toBe(slice >= 1 ? Math.ceil(whole.length / slice) : whole.length);
      expect(sliced.advance(slice), label).toBe(true);
      expect(sliced.samples, label).toEqual(whole);
    }
  }
});

test("landing a hit sounds bright and taking one sounds dull, so the two cannot be confused", () => {
  for (const rate of RATES) {
    const landed = shareAbove(synthClip("enemyHit", rate), rate, 1000);
    const taken = shareAbove(synthClip("playerHit", rate), rate, 1000);
    expect(landed, String(rate)).toBeGreaterThan(0.3);
    expect(taken, String(rate)).toBeLessThan(0.05);
    expect(landed / taken, String(rate)).toBeGreaterThan(10);
  }
});

test("every clip keeps a good part of its energy where laptop speakers can play it", () => {
  for (const rate of RATES) {
    for (const [type] of EXPECTED) {
      expect(shareAbove(synthClip(type, rate), rate, 200), `${type} at ${String(rate)}`).toBeGreaterThan(0.4);
    }
  }
});

test("the defeat drone is still sounding well into its second half", () => {
  const clip = synthClip("lost", 44100);
  const window = (from: number, to: number): number => rms(clip.subarray(from * 44100, to * 44100));
  expect(window(0.8, 1.2) / window(0, 0.4)).toBeGreaterThan(0.3);
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
  // The synthesised clip is built once and reused, not rendered again for every hit.
  expect(new Set(FakeContext.latest?.started.slice(0, 20).map((source) => source.buffer)).size).toBe(1);
});

test("on small speakers the warning to defend and the defeat sound sit close to the hits in the mix", async () => {
  const { play } = await inBrowser([]);
  /** How loud a sound comes out once the bass is gone: the clip above 200 Hz, times its level in the mix. */
  const loudness = (event: CombatEvent): number => {
    play(event);
    const level = FakeContext.latest?.started.at(-1)?.level?.gain.value ?? 0;
    return level * rms(above(synthClip(event.type, 44100), 44100, 200));
  };
  const hit = Math.max(
    loudness({ type: "enemyHit", move: "jab", damage: 1 }),
    loudness({ type: "playerHit", attack: ATTACK, damage: 1 }),
  );
  expect(loudness({ type: "telegraph", attack: ATTACK }) / hit).toBeGreaterThan(0.5);
  expect(loudness({ type: "lost" }) / hit).toBeGreaterThan(0.5);
});

test("warm-up builds each clip once in small slices, and a sound needed early finishes the clip already begun", async () => {
  const begun: string[] = [];
  const slices: { readonly type: string; readonly count: number }[] = [];
  const sliced: typeof startClip = (type, sampleRate) => {
    begun.push(type);
    const clip = startClip(type, sampleRate);
    return {
      samples: clip.samples,
      advance: (count) => {
        slices.push({ type, count });
        return clip.advance(count);
      },
    };
  };
  vi.doMock(SYNTH_MODULE, () => ({ SFX_TYPES, synthClip, startClip: sliced }));
  const { play } = await inBrowser([]);

  play({ type: "whiffed" });
  expect(slices).toEqual([{ type: "whiffed", count: Number.POSITIVE_INFINITY }]);
  await vi.advanceTimersToNextTimerAsync();
  expect(slices.length).toBe(2);
  expect(slices[1]?.type).toBe("telegraph");
  expect(slices[1]?.count).toBeLessThanOrEqual(LARGEST_SLICE);
  expect(FakeContext.latest?.started.length).toBe(1);

  play({ type: "telegraph", attack: ATTACK });
  expect(FakeContext.latest?.started.length).toBe(2);
  expect(begun).toEqual(["whiffed", "telegraph"]);

  await vi.advanceTimersByTimeAsync(10000);
  expect([...begun].sort()).toEqual([...SFX_TYPES].sort());
  const warmUp = slices.filter(({ count }) => Number.isFinite(count));
  expect(Math.max(...warmUp.map(({ count }) => count))).toBeLessThanOrEqual(LARGEST_SLICE);
  expect(warmUp.filter(({ type }) => type === "won").length).toBeGreaterThanOrEqual((1.2 * 44100) / LARGEST_SLICE);

  const before = slices.length;
  for (const type of ["won", "lost", "whiffed"] as const) play({ type });
  expect(FakeContext.latest?.started.length).toBe(5);
  expect(begun.length).toBe(SFX_TYPES.length);
  expect(slices.length).toBe(before);
});

test("the first click or key press starts audio the browser was holding back, then stops listening", async () => {
  const listeners = new Map<string, () => void>();
  const { play } = await inBrowser([]);
  vi.stubGlobal("window", {
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    removeEventListener: (name: string, listener: () => void) =>
      listeners.get(name) === listener && listeners.delete(name),
  });
  FakeContext.locked = true;
  play({ type: "whiffed" });
  const context = FakeContext.latest;
  if (!context) throw new Error("no context was created");
  await vi.advanceTimersByTimeAsync(1000);
  expect(context.state).toBe("suspended");
  expect(context.started.length).toBe(0);
  expect([...listeners.keys()].sort()).toEqual(["keydown", "pointerdown"]);

  // A press the browser does not accept changes nothing, and the game keeps listening.
  listeners.get("pointerdown")?.();
  await vi.advanceTimersByTimeAsync(1000);
  expect(context.state).toBe("suspended");
  expect(listeners.size).toBe(2);

  FakeContext.locked = false;
  listeners.get("keydown")?.();
  await vi.advanceTimersByTimeAsync(50);
  expect(context.state).toBe("running");
  expect(listeners.size).toBe(0);
  play({ type: "whiffed" });
  expect(context.started.length).toBe(1);
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
