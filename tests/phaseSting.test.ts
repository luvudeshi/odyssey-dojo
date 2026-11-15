// Guards the sound of a phase change: a war horn over a drum hit, both levelled, the horn loud as it comes in and low
// under Athena's phase line, in every fight; a stop's own phase sound (Scylla's howl, the suitors' jeer) plays over
// the horn in place of the drum; and nothing here stops or delays her line. No browser: a fake audio context and a
// fake audio element record what starts, through what gain, and in what order. Every module under src/audio is real.
import { existsSync, readFileSync, statSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ATHENA_TARGET_LUFS, groupOf, listedClips as listedRows, playbackDb } from "../server/tools/levelRules";
import {
  CUE_CLIPS, CUE_LOUDNESS, CUE_PEAK, cueGain, DEFEND_GAIN, isPhaseChange, listedCues, PHASE_CLIP, PHASE_DRUM_CLIP, PHASE_DRUM_GAIN,
  PHASE_FALL_SECONDS, PHASE_GAIN, PHASE_HOLD_SECONDS, PHASE_SHAPE, PHASE_TAIL, UNLOCK_GAIN,
} from "../src/audio/cues";
import { STOP_SOUNDS } from "../src/audio/stopSounds";
import type { CombatEvent } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";

const RATE = 44100;
const FOLDER = "public/audio/sfx";
const DOC = "docs/audio-levels.md";
/** A mono clip on two speakers is this much louder than ffmpeg reads the mono file (ITU-R BS.1770 adds the channels' power). */
const MONO_ON_TWO_SPEAKERS_LU = 3;
/** music.ts: DUCK 0.5, the dip under a spoken line. */
const MUSIC_DIP_DB = 6;

/** A clip of `seconds` at one steady size. */
function tone(size: number, seconds: number): Float32Array {
  const clip = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < clip.length; i++) clip[i] = i % 2 === 0 ? size : -size;
  return clip;
}

/** What each clip file decodes to: its size and its length. A file not listed is one second at 0.1. */
const SHAPES: Readonly<Record<string, readonly [size: number, seconds: number]>> = {
  "sfx/phaseSting": [0.2, 1.6],
  "sfx/phaseChanged": [0.03, 1.5],
};
/** The gain that brings each of those to the cue loudness. */
const HORN_LEVEL = CUE_LOUDNESS / 0.2;
const DRUM_LEVEL = CUE_LOUDNESS / 0.03;

/** Everything the fakes saw, in the order it happened: "buffer <clip>" for a sound through the context, "voice <clip>" for a spoken one. */
let order: string[] = [];

/** One change scheduled on a gain: to this value, at this time, and for a glide its time constant. */
interface Step {
  readonly how: "set" | "target" | "ramp";
  readonly value: number;
  readonly at: number;
  readonly constant?: number;
}

interface FakeParam {
  value: number;
  /** What was scheduled on it, in order. */
  readonly scheduled: Step[];
  setValueAtTime(value: number, at: number): void;
  setTargetAtTime(value: number, at: number, constant: number): void;
  linearRampToValueAtTime(value: number, at: number): void;
  cancelScheduledValues(at: number): void;
}

interface FakeGain {
  readonly gain: FakeParam;
  to: unknown;
  connect(node: unknown): unknown;
}

interface FakeBuffer {
  readonly name: string;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly duration: number;
  readonly length: number;
  getChannelData(): Float32Array;
}

interface FakeSource {
  buffer: unknown;
  level: FakeGain | null;
  offset: number | undefined;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  readonly playbackRate: { value: number };
  connect(node: FakeGain): FakeGain;
  start(when?: number, offset?: number): void;
  stop(): void;
}

function fakeParam(): FakeParam {
  const scheduled: Step[] = [];
  return {
    value: 1,
    scheduled,
    setValueAtTime: (value, at) => { scheduled.push({ how: "set", value, at }); },
    setTargetAtTime: (value, at, constant) => { scheduled.push({ how: "target", value, at, constant }); },
    linearRampToValueAtTime: (value, at) => { scheduled.push({ how: "ramp", value, at }); },
    cancelScheduledValues: () => undefined,
  };
}

/** Just enough of an AudioContext to record what starts, through what gain, with what scheduled on that gain. */
class FakeContext {
  static latest: FakeContext | null = null;
  /** While true the browser holds audio back the way it does before a click or a key: resume() just waits. */
  static locked = false;
  /** While true a gain will not take a schedule, as a broken or very old browser would not. */
  static noSchedules = false;
  readonly sampleRate = RATE;
  readonly destination = { output: true };
  readonly started: FakeSource[] = [];
  readonly listeners: (() => void)[] = [];
  currentTime = 12.5;
  state = FakeContext.locked ? "suspended" : "running";

  constructor() {
    FakeContext.latest = this;
  }

  createGain(): FakeGain {
    const gain = fakeParam();
    if (FakeContext.noSchedules) gain.setTargetAtTime = () => { throw new Error("not supported"); };
    const node: FakeGain = { gain, to: null, connect: (next) => { node.to = next; return next; } };
    return node;
  }

  createBuffer(_channels: number, length: number): unknown {
    const data = new Float32Array(length);
    return { name: "synthesised", length, getChannelData: () => data };
  }

  createBufferSource(): FakeSource {
    const source: FakeSource = {
      buffer: null, level: null, offset: undefined, loop: false, loopStart: 0, loopEnd: 0,
      playbackRate: { value: 1 },
      connect: (node) => { source.level = node; return node; },
      start: (_when, offset) => {
        source.offset = offset;
        this.started.push(source);
        order.push(`buffer ${(source.buffer as FakeBuffer).name}`);
      },
      stop: () => undefined,
    };
    return source;
  }

  decodeAudioData(bytes: ArrayBuffer): Promise<FakeBuffer> {
    const name = new TextDecoder().decode(bytes);
    const [size, seconds] = SHAPES[name] ?? [0.1, 1];
    const data = tone(size, seconds);
    return Promise.resolve({ name, numberOfChannels: 1, sampleRate: RATE, duration: seconds, length: data.length, getChannelData: () => data });
  }

  addEventListener(_type: string, listener: () => void): void {
    this.listeners.push(listener);
  }

  /** As in a browser, the state changes a moment after the call, not inside it. */
  resume(): Promise<void> {
    if (FakeContext.locked) return new Promise(() => undefined);
    return Promise.resolve().then(() => {
      this.state = "running";
      for (const listener of this.listeners) listener();
    });
  }

  suspend(): Promise<void> {
    this.state = "suspended";
    return Promise.resolve();
  }

  /** The clips started so far that are not a stop's ambience, by name. */
  names(): readonly string[] {
    return this.started.filter((source) => !source.loop).map((source) => (source.buffer as FakeBuffer).name);
  }

  /** The source that played this clip. */
  sourceOf(name: string): FakeSource {
    const found = this.started.find((source) => (source.buffer as FakeBuffer).name === name);
    if (!found) throw new Error(`${name} was not started`);
    return found;
  }
}

/** A stand-in audio element for the voice: it plays for two seconds and then ends. */
class FakeAudio {
  static played: FakeAudio[] = [];
  volume = 1;
  playing = false;
  /** True once something stopped it before its end. */
  cut = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Map<string, () => void>();

  constructor(readonly url: string) {}

  play(): Promise<void> {
    FakeAudio.played.push(this);
    order.push(`voice ${this.url.replace("/audio/", "").replace(".mp3", "")}`);
    this.playing = true;
    this.timer = setTimeout(() => {
      this.playing = false;
      this.listeners.get("ended")?.();
    }, 2000);
    return Promise.resolve();
  }

  pause(): void {
    if (this.playing) this.cut = true;
    clearTimeout(this.timer);
    this.playing = false;
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  removeAttribute(): void { /* the voice lets go of the element's source */ }

  load(): void { /* nothing to load */ }
}

interface Browser {
  readonly sfx: typeof import("../src/audio/sfx");
  readonly voice: typeof import("../src/audio/voice");
  readonly settings: typeof import("../src/settings/store");
  readonly stops: typeof import("../src/audio/stopAudio");
  /** Every address asked for. */
  readonly requested: string[];
}

/**
 * Loads the audio modules afresh into a fake browser that serves the clip lists in public/audio. `missing` are effect
 * clips left out of the effects list, as if their files were not there.
 */
async function inBrowser(missing: readonly string[] = []): Promise<Browser> {
  const requested: string[] = [];
  FakeContext.latest = null;
  vi.useFakeTimers();
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("fetch", (url: string) => {
    requested.push(url);
    if (!url.endsWith(".json")) {
      const name = url.replace("/audio/", "").replace(".mp3", "");
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(name).buffer) });
    }
    const file = `public${url}`;
    if (!existsSync(file)) return Promise.resolve({ ok: false, status: 404 });
    const listed = JSON.parse(readFileSync(file, "utf8")) as unknown[];
    const kept = url === "/audio/sfx/index.json" ? listed.filter((name) => !missing.includes(String(name))) : listed;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(kept) });
  });
  const sfx = await import("../src/audio/sfx");
  const voice = await import("../src/audio/voice");
  const settings = await import("../src/settings/store");
  const stops = await import("../src/audio/stopAudio");
  return { sfx, voice, settings, stops, requested };
}

/** The context the game made, once its clip files have had time to load, with nothing counted as started yet. */
async function loadedContext(wake: () => void): Promise<FakeContext> {
  wake();
  await vi.advanceTimersByTimeAsync(50);
  const context = FakeContext.latest;
  if (!context) throw new Error("no context was created");
  context.started.length = 0;
  order = [];
  return context;
}

function phase(index: number, name = "The Club"): CombatEvent {
  return { type: "phaseChanged", index, name };
}

const HIT: CombatEvent = { type: "enemyHit", move: "cross", damage: 12, quality: 1 };

afterEach(() => {
  FakeContext.locked = false;
  FakeContext.noSchedules = false;
  FakeContext.latest = null;
  FakeAudio.played = [];
  order = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("which events are a change of phase", () => {
  test("a later phase is, and the phase a fight starts in is not", () => {
    expect(isPhaseChange(phase(1))).toBe(true);
    expect(isPhaseChange(phase(2))).toBe(true);
    expect(isPhaseChange(phase(0))).toBe(false);
    expect(isPhaseChange(HIT)).toBe(false);
    for (const odd of [{}, { type: "phaseChanged" }, { type: "phaseChanged", index: "1" }, { type: "phaseChanged", index: Number.NaN }, { type: "won", index: 1 }]) {
      expect(isPhaseChange(odd), JSON.stringify(odd)).toBe(false);
    }
  });
});

describe("how loud the two sounds are", () => {
  test("each clip of the levelled set has its own gain, and an unknown name has none", () => {
    expect(cueGain(PHASE_CLIP)).toBe(PHASE_GAIN);
    expect(cueGain(PHASE_DRUM_CLIP)).toBe(PHASE_DRUM_GAIN);
    expect(cueGain("unlock")).toBe(UNLOCK_GAIN);
    for (const defend of ["defendBlock", "defendDodge", "defendDuck", "defendJump"]) expect(cueGain(defend), defend).toBe(DEFEND_GAIN);
    for (const other of ["defended", "", "__proto__", "constructor", "phasesting"]) expect(cueGain(other), other).toBe(1);
    expect(CUE_CLIPS).toContain(PHASE_CLIP);
    expect(CUE_CLIPS).toContain(PHASE_DRUM_CLIP);
    expect(new Set(CUE_CLIPS).size).toBe(CUE_CLIPS.length);
  });

  test("the horn comes in loud for a moment and then sits at less than half, well inside its own length", () => {
    expect(PHASE_SHAPE).toEqual({ holdSeconds: PHASE_HOLD_SECONDS, tail: PHASE_TAIL, fallSeconds: PHASE_FALL_SECONDS });
    expect(PHASE_HOLD_SECONDS).toBeGreaterThanOrEqual(0.15);
    expect(PHASE_HOLD_SECONDS).toBeLessThanOrEqual(0.5);
    expect(PHASE_TAIL).toBeGreaterThan(0.2);
    expect(PHASE_TAIL).toBeLessThanOrEqual(0.5);
    expect(PHASE_FALL_SECONDS).toBeGreaterThan(0.02);
    expect(PHASE_FALL_SECONDS).toBeLessThanOrEqual(0.15);
    // Neither sound can clip by itself: a levelled clip peaks at 0.9 at most before its gain.
    expect(PHASE_GAIN).toBeLessThanOrEqual(1);
    expect(PHASE_DRUM_GAIN).toBeLessThanOrEqual(1);
  });

  test("the level tool counts both as levelled clips, at their own gains", () => {
    expect(playbackDb("sfx/phaseSting.mp3", 0.06, 0.3)).toBeCloseTo(20 * Math.log10(2 * PHASE_GAIN));
    expect(playbackDb("sfx/phaseSting.mp3", 0.24, 1)).toBeCloseTo(20 * Math.log10(0.5 * PHASE_GAIN));
    expect(playbackDb("sfx/phaseChanged.mp3", 0.03, 0.2)).toBeCloseTo(20 * Math.log10(4 * PHASE_DRUM_GAIN));
    expect(groupOf("sfx/phaseSting.mp3")).toBe(groupOf("sfx/unlock.mp3"));
    expect(groupOf("sfx/phaseChanged.mp3")).toBe(groupOf("sfx/unlock.mp3"));
    expect(groupOf("sfx/enemyHit.mp3")).toBe("sfx");
  });

  test("by the doc's measurements the horn is over the fight music and under Athena, and the drum is heard", () => {
    // The rows are what levelClips.ts measured the last time it was run. After a change to a gain, run it with --doc.
    const rows = listedRows(readFileSync(DOC, "utf8"));
    const heard = (path: string): number => {
      const row = rows.find((each) => each.path === path);
      if (!row) throw new Error(`${path} has no row in ${DOC}`);
      return row.lufs + row.playDb;
    };
    // Her lines are mono files and the browser sends a mono file to both speakers at full level. ffmpeg reads a mono
    // file 3 LU lower than it reads the same sound on two channels, and the effects and the music are stereo files.
    const athena = ATHENA_TARGET_LUFS + MONO_ON_TWO_SPEAKERS_LU;
    const horn = heard("sfx/phaseSting.mp3");
    const tail = horn + 20 * Math.log10(PHASE_TAIL);
    // As it comes in: at least 6 LU over the fight and boss music at full, and at least 3 LU under her lines.
    for (const music of ["music/fight.mp3", "music/boss.mp3"]) expect(horn - heard(music), music).toBeGreaterThanOrEqual(6);
    expect(athena - horn).toBeGreaterThanOrEqual(3);
    // Under her line: at least 9 LU under her, and still over the music, which dips by 6 dB while she speaks.
    expect(athena - tail).toBeGreaterThanOrEqual(9);
    for (const music of ["music/fight.mp3", "music/boss.mp3"]) expect(tail - (heard(music) - MUSIC_DIP_DB), music).toBeGreaterThanOrEqual(3);
    // The drum used to play 9 LU under the fight music. Levelled, it is over it, and still under the horn.
    expect(heard("sfx/phaseChanged.mp3")).toBeGreaterThan(heard("music/fight.mp3"));
    expect(heard("sfx/phaseChanged.mp3")).toBeLessThan(horn);
  });
});

describe("the files", () => {
  test("the horn is in the folder, small, named in index.json, credited, and the generator knows how to make it", () => {
    const index: unknown = JSON.parse(readFileSync(`${FOLDER}/index.json`, "utf8"));
    expect(listedCues(index)).toEqual(CUE_CLIPS);
    for (const name of [PHASE_CLIP, PHASE_DRUM_CLIP]) {
      const file = `${FOLDER}/${name}.mp3`;
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size, file).toBeGreaterThan(8000);
      // Between one and 1.8 seconds at 128 kbps.
      expect(statSync(file).size, file).toBeLessThanOrEqual(30_000);
    }
    expect(readFileSync("CREDITS.md", "utf8")).toContain("`phaseSting.mp3`");
    expect(readFileSync("server/tools/genClips.ts", "utf8")).toMatch(/^ {2}phaseSting: \["/m);
  });

  test("the stops that had a phase sound of their own still name it", () => {
    expect(STOP_SOUNDS.scylla?.events.phaseChanged).toBe("howl");
    expect(STOP_SOUNDS.suitors?.events.phaseChanged).toBe("jeer");
    const stops: unknown = JSON.parse(readFileSync("public/audio/stops/index.json", "utf8"));
    expect(stops).toContain("scylla/howl");
    expect(stops).toContain("suitors/jeer");
  });
});

describe("a change of phase in a fight", () => {
  test("plays the horn and then the drum, each levelled, straight to the output, and each file is asked for once", async () => {
    const { sfx, requested } = await inBrowser();
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    expect(requested.filter((url) => url === "/audio/sfx/phaseSting.mp3").length).toBe(1);
    expect(requested.filter((url) => url === "/audio/sfx/phaseChanged.mp3").length).toBe(1);

    sfx.playEvent(phase(1));
    expect(context.names()).toEqual(["sfx/phaseSting", "sfx/phaseChanged"]);
    const horn = context.sourceOf("sfx/phaseSting");
    const drum = context.sourceOf("sfx/phaseChanged");
    expect(horn.level?.gain.value).toBeCloseTo(HORN_LEVEL * PHASE_GAIN);
    expect(drum.level?.gain.value).toBeCloseTo(DRUM_LEVEL * PHASE_DRUM_GAIN);
    for (const source of [horn, drum]) {
      expect(source.level?.to).toBe(context.destination);
      expect(source.offset).toBe(0);
      expect(source.playbackRate.value).toBe(1);
    }
  });

  test("the horn starts at full and is told to drop to its tail after the hold; the drum is left as it is", async () => {
    const { sfx } = await inBrowser();
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    sfx.playEvent(phase(2, "Blinded"));
    const full = HORN_LEVEL * PHASE_GAIN;
    const [first, second, ...rest] = context.sourceOf("sfx/phaseSting").level?.gain.scheduled ?? [];
    expect(rest).toEqual([]);
    expect(first?.how).toBe("set");
    expect(first?.value).toBeCloseTo(full);
    expect(first?.at).toBeCloseTo(context.currentTime);
    expect(second?.how).toBe("target");
    expect(second?.value).toBeCloseTo(full * PHASE_TAIL);
    expect(second?.at).toBeCloseTo(context.currentTime + PHASE_HOLD_SECONDS);
    expect(second?.constant).toBeCloseTo(PHASE_FALL_SECONDS);
    expect(context.sourceOf("sfx/phaseChanged").level?.gain.scheduled).toEqual([]);
  });

  test("no sample of either leaves louder than the ceiling times its gain", async () => {
    const { sfx } = await inBrowser();
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    sfx.playEvent(phase(1));
    for (const [name, gain] of [["sfx/phaseSting", PHASE_GAIN], ["sfx/phaseChanged", PHASE_DRUM_GAIN]] as const) {
      const source = context.sourceOf(name);
      const peak = (source.buffer as FakeBuffer).getChannelData().reduce((top, value) => Math.max(top, Math.abs(value)), 0);
      expect(peak * (source.level?.gain.value ?? 0), name).toBeLessThanOrEqual(CUE_PEAK * gain + 1e-6);
    }
  });

  test("both follow the effects volume, and at zero nothing is heard", async () => {
    const { sfx, settings } = await inBrowser();
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    settings.setSettings({ sfxVolume: 0.5 });
    sfx.playEvent(phase(1));
    expect(context.sourceOf("sfx/phaseSting").level?.gain.value).toBeCloseTo(HORN_LEVEL * PHASE_GAIN * 0.5);
    expect(context.sourceOf("sfx/phaseSting").level?.gain.scheduled[1]?.value).toBeCloseTo(HORN_LEVEL * PHASE_GAIN * 0.5 * PHASE_TAIL);
    expect(context.sourceOf("sfx/phaseChanged").level?.gain.value).toBeCloseTo(DRUM_LEVEL * PHASE_DRUM_GAIN * 0.5);

    context.started.length = 0;
    settings.setSettings({ sfxVolume: 0 });
    sfx.playEvent(phase(2));
    for (const source of context.started) {
      expect(source.level?.gain.value).toBe(0);
      expect(source.level?.gain.scheduled.map((step) => step.value).every((value) => value === 0)).toBe(true);
    }
  });

  test("the phase a fight starts in gets the drum alone, and no other event gets the horn", async () => {
    const { sfx } = await inBrowser();
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    sfx.playEvent(phase(0, "The Cave"));
    expect(context.names()).toEqual(["sfx/phaseChanged"]);
    context.started.length = 0;
    const attack = { id: "swing", name: "Swing", telegraphMs: 900, damage: 10, counter: "duck" };
    const others: CombatEvent[] = [
      { type: "telegraph", attack }, { type: "defended", attack }, { type: "playerHit", attack, damage: 10 }, HIT,
      { type: "finished", move: "cross" }, { type: "powerUnleashed", damage: 30 }, { type: "whiffed" }, { type: "won" }, { type: "lost" },
    ];
    for (const event of others) sfx.playEvent(event);
    expect(context.names().length).toBe(others.length);
    expect(context.names()).not.toContain("sfx/phaseSting");
    expect(context.names()).not.toContain("sfx/phaseChanged");
  });

  test("with no horn file the drum plays alone, levelled; with no drum file the horn does; with neither it is silent", async () => {
    const noHorn = await inBrowser([PHASE_CLIP]);
    const first = await loadedContext(() => { noHorn.sfx.playEvent({ type: "whiffed" }); });
    expect(noHorn.requested).not.toContain("/audio/sfx/phaseSting.mp3");
    noHorn.sfx.playEvent(phase(1));
    expect(first.names()).toEqual(["sfx/phaseChanged"]);
    expect(first.sourceOf("sfx/phaseChanged").level?.gain.value).toBeCloseTo(DRUM_LEVEL * PHASE_DRUM_GAIN);

    const noDrum = await inBrowser([PHASE_DRUM_CLIP]);
    const second = await loadedContext(() => { noDrum.sfx.playEvent({ type: "whiffed" }); });
    noDrum.sfx.playEvent(phase(1));
    expect(second.names()).toEqual(["sfx/phaseSting"]);

    const neither = await inBrowser([PHASE_CLIP, PHASE_DRUM_CLIP]);
    const third = await loadedContext(() => { neither.sfx.playEvent({ type: "whiffed" }); });
    expect(() => { neither.sfx.playEvent(phase(1)); }).not.toThrow();
    expect(third.names()).toEqual([]);
  });

  test("a browser that will not take the horn's shape still plays it, at its starting gain", async () => {
    FakeContext.noSchedules = true;
    const { sfx } = await inBrowser();
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    expect(() => { sfx.playEvent(phase(1)); }).not.toThrow();
    expect(context.names()).toEqual(["sfx/phaseSting", "sfx/phaseChanged"]);
    expect(context.sourceOf("sfx/phaseSting").level?.gain.value).toBeCloseTo(HORN_LEVEL * PHASE_GAIN);
  });

  test("when a sound will not start, nothing throws and the fight goes on", async () => {
    const { sfx } = await inBrowser();
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    context.createBufferSource = () => { throw new Error("out of memory"); };
    expect(() => { sfx.playEvent(phase(1)); }).not.toThrow();
    expect(context.names()).toEqual([]);
  });

  test("in a hidden tab it is silent", async () => {
    const { sfx } = await inBrowser();
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    vi.stubGlobal("document", { hidden: true, addEventListener: () => undefined });
    sfx.playEvent(phase(1));
    expect(context.names()).toEqual([]);
  });

  test("with audio held back it plays as soon as the browser lets it, and never late", async () => {
    const { sfx } = await inBrowser();
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    // Suspended, and the browser starts it again at once when asked (a tab that was just shown again).
    context.state = "suspended";
    sfx.playEvent(phase(1));
    expect(context.names()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(context.names()).toEqual(["sfx/phaseSting", "sfx/phaseChanged"]);

    // Before any click or key the browser never starts it: nothing plays then, and nothing plays late afterwards.
    FakeContext.locked = true;
    const held = await inBrowser();
    held.sfx.playEvent(phase(1));
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeContext.latest?.started.length).toBe(0);
  });

  test("where there is no audio at all it does nothing", async () => {
    const real = await import("../src/audio/sfx");
    expect(() => { real.playEvent(phase(1)); }).not.toThrow();
    const { sfx } = await inBrowser();
    vi.stubGlobal("AudioContext", function broken() {
      throw new Error("no audio device");
    });
    expect(() => { sfx.playEvent(phase(1)); }).not.toThrow();
  });
});

describe("a stop with a phase sound of its own", () => {
  test("plays its sound over the horn, in place of the drum; a stop with none gets the horn and the drum", async () => {
    for (const [enemyId, own] of [["scylla", "stops/scylla/howl"], ["suitors", "stops/suitors/jeer"]] as const) {
      const { sfx, stops } = await inBrowser();
      // What useStopAudio does when the fight screen mounts.
      sfx.setEventOverride((event) => stops.playStopEvent(enemyId, event));
      const context = await loadedContext(() => { stops.startStopAmbience(enemyId); });
      sfx.playEvent(phase(1));
      expect(context.names(), enemyId).toEqual(["sfx/phaseSting", own]);
      // The stop's sound keeps its own path and level: through the stop's event bus, not straight out.
      expect(context.sourceOf(own).level?.to, enemyId).not.toBe(context.destination);
      expect(context.sourceOf("sfx/phaseSting").level?.gain.value, enemyId).toBeCloseTo(HORN_LEVEL * PHASE_GAIN);
    }

    for (const enemyId of ["circe", "sirens", "charybdis", "polyphemus"]) {
      const { sfx, stops } = await inBrowser();
      sfx.setEventOverride((event) => stops.playStopEvent(enemyId, event));
      // Polyphemus has no sounds of his own, so his stop makes no audio context: the first effect does.
      const context = await loadedContext(() => { stops.startStopAmbience(enemyId); sfx.playEvent({ type: "whiffed" }); });
      sfx.playEvent(phase(1));
      expect(context.names(), enemyId).toEqual(["sfx/phaseSting", "sfx/phaseChanged"]);
    }
  });

  test("whose clip has not arrived yet falls back to the drum, still under the horn", async () => {
    const { sfx } = await inBrowser();
    sfx.setEventOverride(() => false);
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    sfx.playEvent(phase(1));
    expect(context.names()).toEqual(["sfx/phaseSting", "sfx/phaseChanged"]);
  });

  test("the horn is started before the stop is asked, so a stop's sound that fails cannot take the horn with it", async () => {
    const { sfx } = await inBrowser();
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    const seen: string[][] = [];
    sfx.setEventOverride(() => { seen.push([...context.names()]); return true; });
    sfx.playEvent(phase(1));
    expect(seen).toEqual([["sfx/phaseSting"]]);
    expect(context.names()).toEqual(["sfx/phaseSting"]);
  });
});

describe("Athena's phase line", () => {
  /** One frame of FightScreen's loop: every event to the effects, then all of them to the voice. */
  function frame({ sfx, voice }: Browser, events: readonly CombatEvent[]): void {
    for (const event of events) sfx.playEvent(event);
    voice.playVoice(events);
  }

  test("starts in the same frame, after the horn, and is heard to its end", async () => {
    const browser = await inBrowser();
    await loadedContext(() => { browser.sfx.playEvent({ type: "whiffed" }); });
    FakeAudio.played = [];
    const name = ENEMIES[0]?.phases?.[1]?.name ?? "";
    frame(browser, [HIT, phase(1, name)]);
    expect(order).toEqual(["buffer sfx/enemyHit", "buffer sfx/phaseSting", "buffer sfx/phaseChanged", "voice athena/phase_1"]);
    const [line] = FakeAudio.played;
    expect(line?.playing).toBe(true);
    expect(line?.volume).toBe(1);
    expect(browser.voice.voicePlaying()).toBe("phase_1");
    // Nothing the horn does later touches the line: it runs its two seconds and ends by itself.
    await vi.advanceTimersByTimeAsync(1900);
    expect(line?.playing).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(line?.playing).toBe(false);
    expect(line?.cut).toBe(false);
    expect(FakeAudio.played.length).toBe(1);
  });

  test("is not held up or cut by a second phase change's horn either", async () => {
    const browser = await inBrowser();
    await loadedContext(() => { browser.sfx.playEvent({ type: "whiffed" }); });
    FakeAudio.played = [];
    frame(browser, [HIT, phase(1, ENEMIES[0]?.phases?.[1]?.name ?? "")]);
    await vi.advanceTimersByTimeAsync(2100);
    frame(browser, [HIT, phase(2, ENEMIES[0]?.phases?.[2]?.name ?? "")]);
    expect(order.filter((entry) => entry === "buffer sfx/phaseSting").length).toBe(2);
    expect(order.at(-1)).toBe("voice athena/phase_2");
    await vi.advanceTimersByTimeAsync(2100);
    expect(FakeAudio.played.map((audio) => audio.cut)).toEqual([false, false]);
  });
});
