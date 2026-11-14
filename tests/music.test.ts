// Guards the background music: scenes start, crossfade and stop as asked, loops join cleanly, and nothing ever throws.
import { existsSync, readFileSync, statSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { duckMusic, listedScenes, seamLoop, startMusic, stopMusic } from "../src/audio/music";

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
  readonly playbackRate = { value: 1 };

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

function decoded(): FakeBuffer {
  const channels = [0, 1].map(() => {
    const data = new Float32Array(RATE * SECONDS).fill(0.5);
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
    return FakeContext.corrupt ? Promise.reject(new Error("not audio")) : Promise.resolve(decoded());
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

/** The gain a source fades through, and the one gain all music shares after it. */
function fader(source: FakeSource): FakeParam {
  return must(source.to).gain;
}

function bus(source: FakeSource): FakeParam {
  return (must(source.to).to as FakeGain).gain;
}

afterEach(() => {
  FakeContext.latest = null;
  FakeContext.locked = false;
  FakeContext.refuses = false;
  FakeContext.corrupt = false;
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
  bus(menu).setTargetAtTime = () => {
    throw new Error("invalid state");
  };
  expect(() => {
    music.startMusic("fight");
    music.duckMusic(true);
  }).not.toThrow();
  // The clip that would not stop does not keep the next scene from starting.
  expect(context().music.length).toBe(2);
  expect(() => {
    music.stopMusic();
  }).not.toThrow();
});

test("music sits well under the effects, and dips further while a line is spoken", async () => {
  const { music, voice } = await inBrowser(["fight"]);
  music.startMusic("fight");
  await loaded();
  const fight = must(context().music[0]);
  const base = bus(fight).value;
  // Effects play through a gain of 0.5, and the quietest of them at half of that.
  expect(base * must(fader(fight).events[1]).value).toBeLessThan(0.25);

  let finish: () => void = () => undefined;
  const athena = voice.createVoice({
    available: () => true,
    play: (_id, done) => {
      finish = done;
      return () => undefined;
    },
    random: () => 0,
  });
  context().currentTime = 4;
  expect(athena.speak("fight_start")).toBe(true);
  const dip = must(bus(fight).events.at(-1));
  expect(dip.kind).toBe("target");
  expect(dip.time).toBe(4);
  expect(dip.value).toBeLessThan(base * 0.75);
  expect(dip.value).toBeGreaterThan(0);

  context().currentTime = 6;
  finish();
  expect(bus(fight).events.at(-1)).toEqual({ kind: "target", value: base, time: 6 });
});
