// Guards the background music: scenes start, crossfade and stop as asked, loops join cleanly, and nothing ever throws.
import { existsSync, readFileSync, statSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import {
  clipLevel, duckMusic, listedScenes, pauseMusic, resumeMusic, seamLoop, setMusicVolume, startMusic, stopMusic,
} from "../src/audio/music";

type Music = typeof import("../src/audio/music");
type VoiceModule = typeof import("../src/audio/voice");

interface ParamEvent {
  readonly kind: "set" | "ramp" | "cancel" | "target";
  readonly value: number;
  readonly time: number;
}

/** Records what was scheduled on a gain. */
class FakeParam {
  readonly events: ParamEvent[] = [];
  constructor(public value: number) {}

  setValueAtTime(value: number, time: number): void {
    this.events.push({ kind: "set", value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.events.push({ kind: "ramp", value, time });
  }

  cancelScheduledValues(time: number): void {
    this.events.push({ kind: "cancel", value: 0, time });
  }

  setTargetAtTime(value: number, time: number): void {
    this.events.push({ kind: "target", value, time });
  }
}

class FakeGain {
  readonly gain = new FakeParam(1);
  to: unknown = null;

  connect(node: unknown): unknown {
    this.to = node;
    return node;
  }
}

interface FakeBuffer {
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  getChannelData(index: number): Float32Array;
}

class FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  to: FakeGain | null = null;
  started: { readonly when: number; readonly offset: number } | null = null;
  stopped: number | null = null;
  readonly playbackRate = new FakeParam(1);

  connect(node: FakeGain): FakeGain {
    this.to = node;
    return node;
  }

  start(when = 0, offset = 0): void {
    this.started = { when, offset };
  }

  stop(when = 0): void {
    this.stopped = when;
  }
}

/** The decoded clips are 60 seconds of steady sound at a low sample rate, with a little silence at each end like an MP3. */
const RATE = 1000;
const SECONDS = 60;
const PADDING = 20;
const AMPLITUDE = 0.5;

function decoded(amplitude: number): FakeBuffer {
  const channels = [0, 1].map(() => {
    const data = new Float32Array(RATE * SECONDS).fill(amplitude);
    data.fill(0, 0, PADDING);
    data.fill(0, data.length - PADDING);
    return data;
  });
  return { numberOfChannels: 2, sampleRate: RATE, getChannelData: (index) => channels[index] ?? new Float32Array(0) };
}

/** Just enough of an AudioContext to record what the music schedules. */
class FakeContext {
  static latest: FakeContext | null = null;
  /** While true the browser holds audio back the way it does before a click: resume() does not start it. */
  static locked = false;
  /** How a held-back resume() ends: it waits forever, or it rejects. */
  static refuses = false;
  /** Makes every clip fail to decode. */
  static corrupt = false;
  /** How loud the decoded clips are. */
  static amplitude = AMPLITUDE;
  readonly sampleRate = 44100;
  readonly destination = {};
  readonly sources: FakeSource[] = [];
  readonly listeners: (() => void)[] = [];
  currentTime = 0;
  state = FakeContext.locked ? "suspended" : "running";

  constructor() {
    FakeContext.latest = this;
  }

  createGain(): FakeGain {
    return new FakeGain();
  }

  createBuffer(_channels: number, length: number): unknown {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  decodeAudioData(): Promise<FakeBuffer> {
    return FakeContext.corrupt ? Promise.reject(new Error("not audio")) : Promise.resolve(decoded(FakeContext.amplitude));
  }

  addEventListener(_type: string, listener: () => void): void {
    this.listeners.push(listener);
  }

  resume(): Promise<void> {
    if (FakeContext.locked) return FakeContext.refuses ? Promise.reject(new Error("not allowed")) : new Promise(() => undefined);
    this.unlock();
    return Promise.resolve();
  }

  /** What a click does: audio starts running and the context says so. */
  unlock(): void {
    this.state = "running";
    for (const listener of this.listeners) listener();
  }

  /** The music's sources. The combat sounds share this context, but none are played in these tests. */
  get music(): FakeSource[] {
    return this.sources.filter((source) => source.started !== null);
  }
}

interface Browser {
  readonly music: Music;
  readonly voice: VoiceModule;
  readonly requested: string[];
}

/**
 * Loads a fresh copy of the music module into a fake browser. `index` is what public/audio/music/index.json holds
 * (undefined: the request fails; null: the file is not there), and `missing` lists clips whose files are not there.
 */
async function inBrowser(index: unknown, missing: readonly string[] = []): Promise<Browser> {
  const requested: string[] = [];
  vi.useFakeTimers();
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("fetch", (url: string) => {
    requested.push(url);
    const ok = (body: unknown): Promise<unknown> =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    const notFound = Promise.resolve({ ok: false, status: 404 });
    if (url === "/audio/sfx/index.json") return ok([]);
    if (url === "/audio/music/index.json") {
      if (index === undefined) return Promise.reject(new Error("offline"));
      return index === null ? notFound : ok(index);
    }
    return missing.some((scene) => url === `/audio/music/${scene}.mp3`) ? notFound : ok(null);
  });
  const music = await import("../src/audio/music");
  const voice = await import("../src/audio/voice");
  return { music, voice, requested };
}

/** Lets the index and the clips finish loading. */
async function loaded(): Promise<void> {
  await vi.advanceTimersByTimeAsync(100);
}

function context(): FakeContext {
  if (!FakeContext.latest) throw new Error("no audio context was created");
  return FakeContext.latest;
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

/** The gain a source fades through. */
function fader(source: FakeSource): FakeParam {
  return must(source.to).gain;
}

/** The gain a loop goes through next, which drops while a line is spoken. */
function dip(loop: FakeSource): FakeParam {
  return (must(loop.to).to as FakeGain).gain;
}

/** The one gain all music shares at the end: after the dip for a loop, straight after the fader for a sting. */
function bus(source: FakeSource): FakeParam {
  const next = must(source.to).to as FakeGain;
  return (source.loop ? (next.to as FakeGain) : next).gain;
}

/** A stand-in for Athena that speaks when told and falls quiet when `finish` is called. */
function fakeVoice(voice: VoiceModule): { readonly athena: ReturnType<VoiceModule["createVoice"]>; readonly finish: () => void } {
  let done: () => void = () => undefined;
  const athena = voice.createVoice({
    available: () => true,
    play: (_id, finished) => {
      done = finished;
      return () => undefined;
    },
    random: () => 0,
  });
  return { athena, finish: () => { done(); } };
}

afterEach(() => {
  FakeContext.latest = null;
  FakeContext.locked = false;
  FakeContext.refuses = false;
  FakeContext.corrupt = false;
  FakeContext.amplitude = AMPLITUDE;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("index.json only yields known scenes, whatever it contains", () => {
  expect(listedScenes([])).toEqual([]);
  expect(listedScenes(["win", "menu"])).toEqual(["menu", "win"]);
  expect(listedScenes(["fight", "fight", "../secret", 7, null, { scene: "loss" }])).toEqual(["fight"]);
  for (const junk of [null, undefined, "menu", 3, { menu: true }]) expect(listedScenes(junk)).toEqual([]);
});

test("every scene has a committed clip that is listed and credited, and together they stay under 6 MB", () => {
  const folder = "public/audio/music";
  const index: unknown = JSON.parse(readFileSync(`${folder}/index.json`, "utf8"));
  expect(listedScenes(index)).toEqual(["menu", "fight", "win", "loss"]);
  const credits = readFileSync("CREDITS.md", "utf8");
  let bytes = 0;
  for (const scene of listedScenes(index)) {
    const file = `${folder}/${scene}.mp3`;
    expect(existsSync(file), file).toBe(true);
    expect(credits, file).toContain(file);
    bytes += statSync(file).size;
  }
  expect(bytes).toBeGreaterThan(100_000);
  expect(bytes).toBeLessThan(6_000_000);
});

test("where there is no audio at all, every call does nothing", () => {
  expect(() => {
    stopMusic();
    startMusic("menu");
    startMusic("fight");
    duckMusic(true);
    startMusic("notAScene" as string as "menu");
    duckMusic(false);
    setMusicVolume(0.5);
    pauseMusic();
    resumeMusic();
    stopMusic();
  }).not.toThrow();
});

test("a loop skips the silent ends and its last stretch runs into a copy of its first", () => {
  // Half a second of 0.5, then half a second of -0.25, with ten silent samples at each end, at 1000 samples a second.
  const clip = new Float32Array(1020);
  clip.fill(0.5, 10, 510);
  clip.fill(-0.25, 510, 1010);
  const before = clip.slice();
  const points = seamLoop([clip], 1000, 0.1);
  expect(points.start).toBeCloseTo(0.01, 6);
  expect(points.loopStart).toBeCloseTo(0.11, 6);
  expect(points.loopEnd).toBeCloseTo(1.01, 6);
  // Going into the join the sound is still the end of the clip; coming out of it, it is the sound the loop restarts on.
  expect(clip[910]).toBeCloseTo(-0.25, 1);
  expect(clip[1009]).toBeCloseTo(0.5, 1);
  expect(Math.abs((clip[1009] ?? 0) - (clip[110] ?? 0))).toBeLessThan(0.02);
  // Nothing outside the join is touched.
  expect(clip.subarray(0, 910)).toEqual(before.subarray(0, 910));
  expect(clip.subarray(1010)).toEqual(before.subarray(1010));
});

test("the level never dips or jumps across a join", () => {
  const left = new Float32Array(4000).fill(0.4);
  const right = new Float32Array(4000).fill(-0.4);
  seamLoop([left, right], 1000, 1);
  for (const channel of [left, right]) {
    const sizes = [...channel].map((value) => Math.abs(value));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0.4 - 1e-6);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(0.4 * Math.SQRT2 + 1e-6);
  }
});

test("a loop can be held to an exact length so music joins on the beat", () => {
  const clip = new Float32Array(6000).fill(0.5);
  const points = seamLoop([clip], 100, 0.5, 42);
  expect(points.loopEnd - points.loopStart).toBeCloseTo(42, 6);
  expect(points.loopEnd).toBeLessThanOrEqual(60);
  // A length the clip is too short for is ignored, and the whole clip loops.
  const short = seamLoop([new Float32Array(6000).fill(0.5)], 100, 0.5, 80);
  expect(short.loopEnd).toBeCloseTo(60, 6);
  expect(short.loopStart).toBeCloseTo(0.5, 6);
});

test("a clip that is empty, silent, tiny or malformed still gives usable loop points", () => {
  const whole = { start: 0, loopStart: 0, loopEnd: 0 };
  expect(seamLoop([], 44100, 1)).toEqual(whole);
  expect(seamLoop([new Float32Array(0)], 44100, 1)).toEqual(whole);
  expect(seamLoop([new Float32Array(500)], 44100, 1)).toEqual(whole);
  expect(seamLoop([new Float32Array(500).fill(0.5)], 0, 1)).toEqual(whole);
  for (const [seam, period] of [[1, 1], [0, 0], [-3, -3], [Number.NaN, Number.NaN], [Number.POSITIVE_INFINITY, 2]] as const) {
    const clip = new Float32Array(10).fill(0.5);
    const points = seamLoop([clip], 1000, seam, period);
    const label = `seam ${String(seam)}, period ${String(period)}`;
    expect(clip.every((value) => Number.isFinite(value)), label).toBe(true);
    expect(Object.values(points).every((value) => Number.isFinite(value)), label).toBe(true);
    expect(points.loopEnd, label).toBeGreaterThan(points.loopStart);
    expect(points.loopStart, label).toBeGreaterThanOrEqual(points.start);
  }
});

test("a clip's level is worked out from how loud the clip is", () => {
  const steady = (amplitude: number, length = 1000): Float32Array => new Float32Array(length).fill(amplitude);
  expect(clipLevel([steady(0.5), steady(0.5)], 0.1)).toBeCloseTo(0.2, 6);
  expect(clipLevel([steady(0.01)], 0.1)).toBeCloseTo(10, 4);
  // Silence at the ends is not counted.
  const padded = steady(0.5);
  padded.fill(0, 0, 400);
  padded.fill(0, 900);
  expect(clipLevel([padded], 0.1)).toBeCloseTo(0.2, 6);
  // A long clip is measured from a spread of its samples and comes out the same.
  expect(clipLevel([steady(0.25, 1_000_003)], 0.1)).toBeCloseTo(0.4, 4);
  // A near-silent clip is only raised so far, and nothing to measure or a bad target leaves the clip as it is.
  expect(clipLevel([steady(0.001)], 0.1)).toBe(12);
  expect(clipLevel([], 0.1)).toBe(1);
  expect(clipLevel([new Float32Array(0)], 0.1)).toBe(1);
  expect(clipLevel([new Float32Array(500)], 0.1)).toBe(1);
  for (const target of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(clipLevel([steady(0.5)], target)).toBe(1);
});

test("a quiet file and a loud file of the same scene come out equally loud", async () => {
  const heard: number[] = [];
  for (const amplitude of [0.01, 0.2, 0.9]) {
    FakeContext.amplitude = amplitude;
    const { music } = await inBrowser(["menu"]);
    music.startMusic("menu");
    await loaded();
    heard.push(must(fader(must(context().music[0])).events[1]).value * amplitude);
  }
  expect(heard[1]).toBeCloseTo(must(heard[0]), 6);
  expect(heard[2]).toBeCloseTo(must(heard[0]), 6);
  expect(must(heard[0])).toBeGreaterThan(0);
});

test("starting a scene loops its clip and fades it in over a second, and only listed clips are requested", async () => {
  const { music, requested } = await inBrowser(["menu", "fight", "../secret", 7]);
  music.startMusic("menu");
  expect(context().music.length).toBe(0);
  await loaded();

  const [source, ...others] = context().music;
  expect(others).toEqual([]);
  const menu = must(source);
  expect(menu.loop).toBe(true);
  expect(menu.started).toEqual({ when: 0, offset: PADDING / RATE });
  expect(menu.loopStart).toBeGreaterThan(PADDING / RATE);
  expect(menu.loopEnd).toBeCloseTo(SECONDS - PADDING / RATE, 6);
  expect(menu.stopped).toBeNull();
  const [from, to, ...rest] = fader(menu).events;
  expect(rest).toEqual([]);
  expect(from).toEqual({ kind: "set", value: 0, time: 0 });
  expect(to?.kind).toBe("ramp");
  expect(to?.time).toBeCloseTo(1, 6);
  expect(to?.value).toBeGreaterThan(0);
  expect([...requested].sort()).toEqual([
    "/audio/music/fight.mp3",
    "/audio/music/index.json",
    "/audio/music/menu.mp3",
    "/audio/sfx/index.json",
  ]);
});

test("the battle music is held to a whole number of its six-second phrases", async () => {
  const { music } = await inBrowser(["fight"]);
  music.startMusic("fight");
  await loaded();
  const fight = must(context().music[0]);
  const phrases = (fight.loopEnd - fight.loopStart) / 6;
  expect(phrases).toBeGreaterThanOrEqual(1);
  expect(phrases).toBeCloseTo(Math.round(phrases), 6);
});

test("changing scene fades the old clip out and the new one in over the same second", async () => {
  const { music } = await inBrowser(["menu", "fight", "win", "loss"]);
  music.startMusic("menu");
  await loaded();
  context().currentTime = 5;
  music.startMusic("fight");

  expect(context().music.length).toBe(2);
  const menu = must(context().music[0]);
  const fight = must(context().music[1]);
  const menuLevel = must(fader(menu).events[1]).value;
  expect(fader(menu).events.slice(2)).toEqual([
    { kind: "cancel", value: 0, time: 5 },
    { kind: "set", value: menuLevel, time: 5 },
    { kind: "ramp", value: 0, time: 6 },
  ]);
  expect(menu.stopped).toBeGreaterThanOrEqual(6);
  expect(menu.stopped).toBeLessThan(6.5);
  expect(fight.started?.when).toBe(5);
  expect(fight.loop).toBe(true);
  expect(fader(fight).events[0]).toEqual({ kind: "set", value: 0, time: 5 });
  expect(fader(fight).events[1]).toMatchObject({ kind: "ramp", time: 6 });
  expect(fight.stopped).toBeNull();

  // Cut off half way through its fade in, a clip fades out from the level it had reached, not from full.
  context().currentTime = 5.5;
  music.startMusic("loss");
  const fightLevel = must(fader(fight).events[1]).value;
  expect(fader(fight).events[3]).toEqual({ kind: "set", value: fightLevel / 2, time: 5.5 });
  expect(fader(fight).events[4]).toEqual({ kind: "ramp", value: 0, time: 6.5 });
  expect(context().music.length).toBe(3);
});

test("the win and loss stings play once from the top and come in at once", async () => {
  const { music } = await inBrowser(["fight", "win", "loss"]);
  music.startMusic("fight");
  await loaded();
  for (const scene of ["win", "loss"] as const) {
    context().currentTime += 10;
    music.startMusic(scene);
    const sting = must(context().music.at(-1));
    expect(sting.loop, scene).toBe(false);
    expect(sting.started, scene).toEqual({ when: context().currentTime, offset: 0 });
    expect(must(fader(sting).events[1]).time - context().currentTime, scene).toBeLessThan(0.2);
  }
  expect(context().music.length).toBe(3);
});

test("asking for the scene already wanted does not restart it", async () => {
  const { music } = await inBrowser(["menu", "fight", "win"]);
  // Before the clips have loaded, while they play, and for a sting that has already ended.
  for (let i = 0; i < 5; i++) music.startMusic("fight");
  await loaded();
  for (let i = 0; i < 5; i++) music.startMusic("fight");
  expect(context().music.length).toBe(1);
  expect(fader(must(context().music[0])).events.length).toBe(2);

  context().currentTime = 20;
  for (let i = 0; i < 5; i++) music.startMusic("win");
  context().currentTime = 60;
  for (let i = 0; i < 5; i++) music.startMusic("win");
  expect(context().music.length).toBe(2);
});

test("stopping fades the music out, and it can be started again", async () => {
  const { music } = await inBrowser(["menu", "fight"]);
  music.stopMusic();
  expect(FakeContext.latest).toBeNull();
  music.startMusic("fight");
  await loaded();
  context().currentTime = 8;
  music.stopMusic();
  music.stopMusic();

  const fight = must(context().music[0]);
  expect(fader(fight).events.at(-1)).toEqual({ kind: "ramp", value: 0, time: 9 });
  expect(fader(fight).events.length).toBe(5);
  expect(fight.stopped).toBeGreaterThanOrEqual(9);
  expect(context().music.length).toBe(1);

  context().currentTime = 12;
  music.startMusic("fight");
  expect(context().music.length).toBe(2);
  expect(must(context().music[1]).started?.when).toBe(12);
});

test("a scene whose file is missing is silent, and still ends the scene before it", async () => {
  const { music, requested } = await inBrowser(["menu", "fight", "win"], ["fight"]);
  music.startMusic("menu");
  await loaded();
  context().currentTime = 3;
  expect(() => {
    music.startMusic("fight");
  }).not.toThrow();
  await loaded();
  expect(context().music.length).toBe(1);
  expect(fader(must(context().music[0])).events.at(-1)).toEqual({ kind: "ramp", value: 0, time: 4 });
  expect(requested).toContain("/audio/music/fight.mp3");

  // A scene index.json does not list is never asked for, even though the game knows it.
  music.startMusic("loss");
  await loaded();
  expect(context().music.length).toBe(1);
  expect(requested).not.toContain("/audio/music/loss.mp3");

  music.startMusic("win");
  expect(context().music.length).toBe(2);
});

test("with no index.json, or one that cannot be read, there is no music and no error", async () => {
  for (const index of [undefined, null, "menu", { menu: true }]) {
    const { music, requested } = await inBrowser(index);
    music.startMusic("menu");
    await loaded();
    music.startMusic("fight");
    music.stopMusic();
    await loaded();
    expect(context().music.length).toBe(0);
    expect(requested.filter((url) => url.endsWith(".mp3"))).toEqual([]);
  }
});

test("a clip that will not decode is silent", async () => {
  FakeContext.corrupt = true;
  const { music } = await inBrowser(["menu", "fight"]);
  music.startMusic("menu");
  await loaded();
  music.startMusic("fight");
  await loaded();
  expect(context().music.length).toBe(0);
});

test("audio the browser holds back stays silent until a click, then plays the scene wanted by then", async () => {
  for (const refuses of [false, true]) {
    FakeContext.locked = true;
    FakeContext.refuses = refuses;
    const { music } = await inBrowser(["menu", "fight"]);
    music.startMusic("menu");
    await loaded();
    music.startMusic("fight");
    music.startMusic("menu");
    await loaded();
    expect(context().state).toBe("suspended");
    expect(context().music.length).toBe(0);

    FakeContext.locked = false;
    context().currentTime = 2;
    context().unlock();
    const [menu, ...others] = context().music;
    expect(others).toEqual([]);
    expect(must(menu).started?.when).toBe(2);
    expect(fader(must(menu)).events[1]).toMatchObject({ kind: "ramp", time: 3 });
    // A second report from the context does not start it twice.
    context().unlock();
    expect(context().music.length).toBe(1);
  }
});

test("a browser whose audio fails to start stays silent", async () => {
  const { music } = await inBrowser(["menu"]);
  vi.stubGlobal("AudioContext", function broken() {
    throw new Error("no audio device");
  });
  expect(() => {
    music.startMusic("menu");
    music.duckMusic(true);
    music.startMusic("fight");
    music.stopMusic();
  }).not.toThrow();
  await loaded();
});

test("a context that rejects what the music schedules does not break the caller", async () => {
  const { music } = await inBrowser(["menu", "fight"]);
  music.startMusic("menu");
  await loaded();
  const menu = must(context().music[0]);
  menu.stop = () => {
    throw new Error("invalid state");
  };
  for (const gain of [dip(menu), bus(menu)]) {
    gain.setTargetAtTime = () => {
      throw new Error("invalid state");
    };
  }
  menu.playbackRate.setValueAtTime = () => {
    throw new Error("invalid state");
  };
  expect(() => {
    music.duckMusic(true);
    music.setMusicVolume(0.3);
    music.pauseMusic();
    music.resumeMusic();
    music.startMusic("fight");
  }).not.toThrow();
  // The clip that would not stop does not keep the next scene from starting.
  expect(context().music.length).toBe(2);
  expect(() => {
    music.stopMusic();
  }).not.toThrow();
});

test("music sits well under the effects, and a loop dips further while a line is spoken", async () => {
  const { music, voice } = await inBrowser(["fight"]);
  music.startMusic("fight");
  await loaded();
  const fight = must(context().music[0]);
  // Effects play through a gain of 0.5, and the quietest of them at half of that. The fake clip's samples are all 0.5.
  expect(bus(fight).value * must(fader(fight).events[1]).value * AMPLITUDE).toBeLessThan(0.25 * AMPLITUDE);
  expect(dip(fight).value).toBe(1);

  const { athena, finish } = fakeVoice(voice);
  context().currentTime = 4;
  expect(athena.speak("fight_start")).toBe(true);
  const dipped = must(dip(fight).events.at(-1));
  expect(dipped.kind).toBe("target");
  expect(dipped.time).toBe(4);
  expect(dipped.value).toBeLessThan(0.75);
  expect(dipped.value).toBeGreaterThan(0);

  context().currentTime = 6;
  finish();
  expect(dip(fight).events.at(-1)).toEqual({ kind: "target", value: 1, time: 6 });

  // A line that is cut off by name lifts the dip too.
  context().currentTime = 8;
  expect(athena.speak("homer_title")).toBe(true);
  expect(dip(fight).events.at(-1)).toMatchObject({ value: dipped.value, time: 8 });
  context().currentTime = 9;
  athena.stop("homer_title");
  expect(dip(fight).events.at(-1)).toEqual({ kind: "target", value: 1, time: 9 });
});

test("the dip holds until everyone speaking over the music has finished", async () => {
  const { music } = await inBrowser(["fight"]);
  music.duckMusic(true);
  music.startMusic("fight");
  await loaded();
  const fight = must(context().music[0]);
  // A line that began before the music did is still dipped under.
  const low = dip(fight).value;
  expect(low).toBeLessThan(0.75);

  music.duckMusic(true, "narration");
  music.duckMusic(false);
  expect(must(dip(fight).events.at(-1)).value).toBe(low);
  music.duckMusic(false, "narration");
  expect(must(dip(fight).events.at(-1)).value).toBe(1);
  // Lifting a dip nobody asked for changes nothing.
  music.duckMusic(false, "nobody");
  expect(must(dip(fight).events.at(-1)).value).toBe(1);
});

test("a sting is not dipped under the voice, and both stings come out equally loud", async () => {
  const { music, voice } = await inBrowser(["fight", "win", "loss"]);
  music.startMusic("fight");
  await loaded();
  const fight = must(context().music[0]);
  const { athena } = fakeVoice(voice);
  // The result line and the sting start on the same combat event.
  expect(athena.speak("win")).toBe(true);
  music.startMusic("win");
  const win = must(context().music[1]);
  music.startMusic("loss");
  const loss = must(context().music[2]);

  // The loop goes through the dip; a sting goes straight to the shared gain, which the voice never moves.
  expect(must(fight.to).to).not.toBe(must(win.to).to);
  expect((must(fight.to).to as FakeGain).to).toBe(must(win.to).to);
  expect(must(loss.to).to).toBe(must(win.to).to);
  expect(dip(fight).events.length).toBe(1);
  expect(bus(win).events).toEqual([]);
  expect(bus(win).value).toBeGreaterThan(0);
  expect(must(fader(win).events[1]).value).toBe(must(fader(loss).events[1]).value);
});

test("the volume setting scales all music, is kept within 0 to 1, and applies to music started later", async () => {
  const { music } = await inBrowser(["fight", "win"]);
  music.setMusicVolume(0.5);
  music.startMusic("fight");
  await loaded();
  const fight = must(context().music[0]);
  const half = bus(fight).value;
  expect(half).toBeGreaterThan(0);

  context().currentTime = 3;
  music.setMusicVolume(1);
  expect(bus(fight).events.at(-1)).toEqual({ kind: "target", value: half * 2, time: 3 });
  music.setMusicVolume(7);
  expect(must(bus(fight).events.at(-1)).value).toBe(half * 2);
  music.setMusicVolume(Number.NaN);
  expect(bus(fight).events.length).toBe(2);
  music.setMusicVolume(-2);
  expect(must(bus(fight).events.at(-1)).value).toBe(0);
  music.setMusicVolume(0.5);
  expect(must(bus(fight).events.at(-1)).value).toBe(half);
  // The sting shares the same gain, so the setting reaches it too.
  music.startMusic("win");
  expect(bus(must(context().music[1]))).toBe(bus(fight));
});

test("pausing silences the music and holds its place; resuming carries on", async () => {
  const { music } = await inBrowser(["fight", "win"]);
  music.startMusic("fight");
  await loaded();
  const fight = must(context().music[0]);
  const full = bus(fight).value;

  context().currentTime = 10;
  music.pauseMusic();
  music.pauseMusic();
  expect(bus(fight).events).toEqual([{ kind: "target", value: 0, time: 10 }]);
  const [held, ...more] = fight.playbackRate.events;
  expect(more).toEqual([]);
  expect(held).toMatchObject({ kind: "set", value: 0 });
  expect(must(held).time).toBeGreaterThan(10);
  expect(must(held).time).toBeLessThan(11);
  expect(fight.stopped).toBeNull();

  context().currentTime = 30;
  music.resumeMusic();
  music.resumeMusic();
  expect(fight.playbackRate.events.slice(1)).toEqual([
    { kind: "cancel", value: 0, time: 30 },
    { kind: "set", value: 1, time: 30 },
  ]);
  expect(bus(fight).events.at(-1)).toEqual({ kind: "target", value: full, time: 30 });
  expect(context().music.length).toBe(1);
});

test("a scene asked for during a pause starts on resume, and music first asked for while paused waits too", async () => {
  const { music } = await inBrowser(["fight", "win"]);
  music.pauseMusic();
  music.startMusic("fight");
  await loaded();
  expect(context().music.length).toBe(0);
  context().currentTime = 2;
  music.resumeMusic();
  const fight = must(context().music[0]);
  expect(fight.started?.when).toBe(2);
  expect(bus(fight).events.at(-1)).toMatchObject({ kind: "target", time: 2 });
  expect(must(bus(fight).events.at(-1)).value).toBeGreaterThan(0);

  context().currentTime = 5;
  music.pauseMusic();
  music.startMusic("win");
  // The loop is let go, and the sting is held back so none of it is missed.
  expect(fader(fight).events.at(-1)).toEqual({ kind: "ramp", value: 0, time: 6 });
  expect(context().music.length).toBe(1);
  context().currentTime = 9;
  music.resumeMusic();
  expect(must(context().music[1]).started).toEqual({ when: 9, offset: 0 });
});
