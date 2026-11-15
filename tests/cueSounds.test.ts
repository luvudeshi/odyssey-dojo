// Guards the unlock chime and the defend sounds: which clip a defend plays, how loud, what happens when a clip is
// missing, and that playUnlock is safe to call at any time. No browser: a small fake audio context records what starts.
import { existsSync, readFileSync, statSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { groupOf, playbackDb } from "../server/tools/levelRules";
import type { DecodedClip } from "../src/audio/cues";
import {
  CUE_CLIPS, CUE_LOUDNESS, CUE_PEAK, cueLevel, DEFEND_CLIPS, DEFEND_GAIN, defendClip, defendKind, leadSilence, listedCues,
  prepareCue, UNLOCK_CLIP, UNLOCK_GAIN,
} from "../src/audio/cues";
import { stopClipLevel } from "../src/audio/stopAudio";
import type { CombatEvent } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";
import { burstKind } from "../src/render/effects/defendTiming";

const RATE = 44100;
const FOLDER = "public/audio/sfx";
/** No clip here may be bigger than this on disk: they are a second or less. */
const MAX_BYTES = 24_000;

/** A clip of `seconds` at one steady size, after `lead` seconds of silence. */
function tone(size: number, seconds: number, lead = 0): Float32Array {
  const clip = new Float32Array(Math.round((lead + seconds) * RATE));
  for (let i = Math.round(lead * RATE); i < clip.length; i++) clip[i] = i % 2 === 0 ? size : -size;
  return clip;
}

function defended(counter: string): CombatEvent {
  return { type: "defended", attack: { id: "swing", name: "Swing", telegraphMs: 900, damage: 10, counter } };
}

describe("which sound a defend gets", () => {
  test("a block, a dodge to either side, a duck and a jump each have their own clip, and nothing else has one", () => {
    expect(defendClip("block")).toBe("defendBlock");
    expect(defendClip("dodge_left")).toBe("defendDodge");
    expect(defendClip("dodge_right")).toBe("defendDodge");
    expect(defendClip("duck")).toBe("defendDuck");
    expect(defendClip("jump")).toBe("defendJump");
    for (const other of ["jab", "", "Block", "dodge", "__proto__", "constructor"]) expect(defendClip(other), other).toBeNull();
    expect(new Set(Object.values(DEFEND_CLIPS)).size).toBe(4);
    expect(CUE_CLIPS).toEqual([UNLOCK_CLIP, ...Object.values(DEFEND_CLIPS)]);
  });

  test("every defend move in the game, and every attack's counter, has a sound, split the way the bursts are", () => {
    const defends = [...MOVES.values()].filter((move) => move.kind === "defend").map((move) => move.id);
    const counters = ENEMIES.flatMap((enemy) => enemy.attacks.map((attack) => attack.counter));
    expect(defends.length).toBeGreaterThanOrEqual(5);
    expect(counters.length).toBeGreaterThan(10);
    for (const move of [...defends, ...counters]) {
      expect(defendClip(move), move).not.toBeNull();
      expect(defendKind(move), move).toBe(burstKind(move));
    }
    for (const move of MOVES.values()) if (move.kind !== "defend") expect(defendClip(move.id), move.id).toBeNull();
  });

  test("index.json only yields these clips, whatever it contains", () => {
    expect(listedCues([])).toEqual([]);
    expect(listedCues(["won", "defendDuck", "unlock", "defendDuck", "../secret", 7, null])).toEqual(["unlock", "defendDuck"]);
    for (const junk of [null, undefined, "unlock", 3, { unlock: true }]) expect(listedCues(junk)).toEqual([]);
  });
});

describe("how loud a clip is played", () => {
  test("a clip is brought to one loudness, never past the peak ceiling and never raised more than twelve times", () => {
    expect(cueLevel([tone(0.06, 0.3)])).toBeCloseTo(CUE_LOUDNESS / 0.06);
    expect(cueLevel([tone(0.5, 0.3)])).toBeCloseTo(CUE_LOUDNESS / 0.5);
    // One loud sample holds the whole clip down.
    const spiky = tone(0.02, 0.3);
    spiky[100] = 1;
    expect(cueLevel([spiky])).toBeCloseTo(CUE_PEAK);
    expect(cueLevel([tone(0.001, 0.3)])).toBe(12);
    // The silence at each end is not part of the loudness.
    expect(cueLevel([tone(0.06, 0.3, 0.2)])).toBeCloseTo(CUE_LOUDNESS / 0.06);
    for (const empty of [[], [new Float32Array(0)], [new Float32Array(500)]]) expect(cueLevel(empty)).toBe(1);
  });

  test("it is the level the stop events get, so the doc's numbers hold for both", () => {
    const stereo = [tone(0.2, 0.4, 0.1), tone(0.05, 0.5)];
    for (const clip of [[tone(0.06, 0.3)], [tone(0.7, 0.2, 0.05)], [tone(0.004, 0.3)], stereo]) {
      expect(cueLevel(clip)).toBeCloseTo(stopClipLevel(clip, CUE_LOUDNESS, CUE_PEAK), 5);
    }
  });

  test("the silence a clip starts with is found, up to half a second", () => {
    expect(leadSilence([tone(0.3, 0.2, 0.195)], RATE)).toBeCloseTo(0.195, 3);
    expect(leadSilence([tone(0.3, 0.2)], RATE)).toBe(0);
    // The first sound in either channel counts.
    expect(leadSilence([tone(0.3, 0.2, 0.3), tone(0.3, 0.2, 0.1)], RATE)).toBeCloseTo(0.1, 3);
    expect(leadSilence([tone(0.3, 0.2, 0.8)], RATE)).toBe(0.5);
    expect(leadSilence([new Float32Array(100)], RATE)).toBe(0);
    for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(leadSilence([tone(0.3, 0.2, 0.1)], rate)).toBe(0);
  });

  test("a buffer that cannot be read still plays, as it is", () => {
    const broken = { numberOfChannels: 1, sampleRate: RATE, duration: 1, getChannelData: (): Float32Array => { throw new Error("detached"); } };
    expect(prepareCue(broken)).toEqual({ buffer: broken, level: 1, offset: 0 });
    const odd = {} as DecodedClip;
    expect(prepareCue(odd)).toEqual({ buffer: odd, level: 1, offset: 0 });
  });

  test("the level tool knows these clips are levelled, and lists them apart from the event clips", () => {
    // Brought to RMS 0.12 and then through the clip's gain, unless the peak would pass 0.9.
    expect(playbackDb("sfx/defendDuck.mp3", 0.06, 0.3)).toBeCloseTo(20 * Math.log10(2 * DEFEND_GAIN));
    expect(playbackDb("sfx/defendBlock.mp3", 0.06, 0.9)).toBeCloseTo(20 * Math.log10(DEFEND_GAIN));
    expect(playbackDb("sfx/unlock.mp3", 0.06, 0.3)).toBeCloseTo(20 * Math.log10(2 * UNLOCK_GAIN));
    expect(playbackDb("sfx/defended.mp3", 0.06, 0.3)).toBeCloseTo(20 * Math.log10(0.8 * 0.5));
    for (const name of CUE_CLIPS) expect(groupOf(`sfx/${name}.mp3`), name).toBe("sfx (unlock and defends)");
    expect(groupOf("sfx/defended.mp3")).toBe("sfx");
    expect(groupOf("stops/circe/unlock.mp3")).toBe("stops (events)");
  });
});

describe("the files", () => {
  test("every clip is in the folder, small, and named in index.json", () => {
    const index: unknown = JSON.parse(readFileSync(`${FOLDER}/index.json`, "utf8"));
    expect(listedCues(index)).toEqual(CUE_CLIPS);
    for (const name of CUE_CLIPS) {
      const file = `${FOLDER}/${name}.mp3`;
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size, file).toBeGreaterThan(2000);
      expect(statSync(file).size, file).toBeLessThanOrEqual(MAX_BYTES);
    }
    // The single sound they stand in for is still there for a defend with no clip of its own.
    expect(index).toContain("defended");
  });
});

interface FakeBuffer {
  readonly name: string;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly duration: number;
  getChannelData(): Float32Array;
}

interface FakeGain {
  readonly gain: { value: number };
  to: unknown;
  connect(node: unknown): unknown;
}

interface FakeSource {
  buffer: unknown;
  level: FakeGain | null;
  offset: number | undefined;
  readonly playbackRate: { value: number };
  connect(node: FakeGain): FakeGain;
  start(when?: number, offset?: number): void;
}

/**
 * What each clip file decodes to: its size, its length, the silence it starts with, and the size of one loud sample
 * at its start (0 for none). A file not listed is 0.1 s at 0.3.
 */
const SHAPES: Readonly<Record<string, readonly [size: number, seconds: number, lead: number, spike: number]>> = {
  unlock: [0.24, 1, 0, 0],
  // A clang: quiet on average, with one sample at the ceiling.
  defendBlock: [0.05, 0.5, 0, 0.9],
  defendDodge: [0.06, 0.3, 0.2, 0],
  defendDuck: [0.03, 0.4, 0.1, 0],
  defendJump: [0.001, 0.3, 0.05, 0],
};

/** Just enough of an AudioContext to record what starts, through what gain and from where in the clip. */
class FakeContext {
  static latest: FakeContext | null = null;
  /** While true the browser holds audio back the way it does before a click or a key: resume() just waits. */
  static locked = false;
  readonly sampleRate = RATE;
  readonly destination = { output: true };
  readonly started: FakeSource[] = [];
  state = FakeContext.locked ? "suspended" : "running";

  constructor() {
    FakeContext.latest = this;
  }

  createGain(): FakeGain {
    const node: FakeGain = { gain: { value: 1 }, to: null, connect: (next) => { node.to = next; return next; } };
    return node;
  }

  createBuffer(_channels: number, length: number): unknown {
    const data = new Float32Array(length);
    return { name: "synthesised", length, getChannelData: () => data };
  }

  createBufferSource(): FakeSource {
    const source: FakeSource = {
      buffer: null,
      level: null,
      offset: undefined,
      playbackRate: { value: 1 },
      connect: (node) => { source.level = node; return node; },
      start: (_when, offset) => { source.offset = offset; this.started.push(source); },
    };
    return source;
  }

  decodeAudioData(bytes: ArrayBuffer): Promise<FakeBuffer> {
    const name = new TextDecoder().decode(bytes);
    const [size, seconds, lead, spike] = SHAPES[name] ?? [0.3, 0.1, 0, 0];
    const data = tone(size, seconds, lead);
    if (spike > 0) data[Math.round(lead * RATE)] = spike;
    return Promise.resolve({ name, numberOfChannels: 1, sampleRate: RATE, duration: data.length / RATE, getChannelData: () => data });
  }

  resume(): Promise<void> {
    if (FakeContext.locked) return new Promise(() => undefined);
    this.state = "running";
    return Promise.resolve();
  }

  /** The names of the clips started so far. */
  names(): readonly string[] {
    return this.started.map((source) => (source.buffer as FakeBuffer).name);
  }
}

interface Browser {
  readonly sfx: typeof import("../src/audio/sfx");
  readonly settings: typeof import("../src/settings/store");
  readonly requested: string[];
}

/**
 * Loads a fresh copy of the sound module into a fake browser whose index.json has the given content. `slow` is how
 * long each clip file takes to arrive, in milliseconds; `missing` are files that answer 404.
 */
async function inBrowser(index: unknown, options: { readonly slow?: number; readonly missing?: readonly string[] } = {}): Promise<Browser> {
  const requested: string[] = [];
  vi.useFakeTimers();
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("fetch", async (url: string) => {
    requested.push(url);
    const name = url.split("/").at(-1)?.replace(".mp3", "") ?? "";
    if (url.endsWith(".mp3") && options.slow !== undefined) await new Promise((resolve) => setTimeout(resolve, options.slow));
    if (options.missing?.includes(name)) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: () => Promise.resolve(index), arrayBuffer: () => Promise.resolve(new TextEncoder().encode(name).buffer) };
  });
  const sfx = await import("../src/audio/sfx");
  const settings = await import("../src/settings/store");
  return { sfx, settings, requested };
}

/** The context the game made, once its clip files have had time to load. */
async function loadedContext(wake: () => void): Promise<FakeContext> {
  wake();
  await vi.advanceTimersByTimeAsync(50);
  const context = FakeContext.latest;
  if (!context) throw new Error("no context was created");
  context.started.length = 0;
  return context;
}

const EVERYTHING = ["defended", ...CUE_CLIPS];

afterEach(() => {
  FakeContext.locked = false;
  FakeContext.latest = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a defend in a fight", () => {
  test("plays the clip of what was done, levelled, from its first sound, straight to the output", async () => {
    const { sfx, requested } = await inBrowser(EVERYTHING);
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    expect([...requested].sort()).toEqual(["index.json", ...EVERYTHING.map((name) => `${name}.mp3`)].map((file) => `/audio/sfx/${file}`).sort());

    for (const move of ["block", "dodge_left", "dodge_right", "duck", "jump"]) sfx.playEvent(defended(move));
    expect(context.names()).toEqual(["defendBlock", "defendDodge", "defendDodge", "defendDuck", "defendJump"]);
    const [block, dodge, , duck, jump] = context.started;
    // The clang is held by its peak, the dodge and the duck are raised to the loudness, and the faint jump by twelve at most.
    expect(block?.level?.gain.value).toBeCloseTo((CUE_PEAK / 0.9) * DEFEND_GAIN);
    expect(dodge?.level?.gain.value).toBeCloseTo((CUE_LOUDNESS / 0.06) * DEFEND_GAIN);
    expect(duck?.level?.gain.value).toBeCloseTo((CUE_LOUDNESS / 0.03) * DEFEND_GAIN);
    expect(jump?.level?.gain.value).toBeCloseTo(12 * DEFEND_GAIN);
    expect(block?.offset).toBe(0);
    expect(dodge?.offset).toBeCloseTo(0.2, 3);
    expect(duck?.offset).toBeCloseTo(0.1, 3);
    for (const source of context.started) expect(source.level?.to).toBe(context.destination);
    // No sample leaves louder than the ceiling times the gain.
    for (const source of context.started) {
      const data = (source.buffer as FakeBuffer).getChannelData();
      const peak = data.reduce((top, value) => Math.max(top, Math.abs(value)), 0);
      expect(peak * (source.level?.gain.value ?? 0)).toBeLessThanOrEqual(CUE_PEAK * DEFEND_GAIN + 1e-6);
    }
  });

  test("follows the effects volume", async () => {
    const { sfx, settings } = await inBrowser(EVERYTHING);
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    settings.setSettings({ sfxVolume: 0.5 });
    sfx.playEvent(defended("duck"));
    expect(context.started[0]?.level?.gain.value).toBeCloseTo((CUE_LOUDNESS / 0.03) * DEFEND_GAIN * 0.5);
  });

  test("with no clip of its own plays the one defended sound, and with no files at all the built-in one", async () => {
    const some = await inBrowser(["defended", "defendBlock", "defendDuck"], { missing: ["defendDuck"] });
    const context = await loadedContext(() => { some.sfx.playEvent({ type: "whiffed" }); });
    expect(some.requested).not.toContain("/audio/sfx/defendDodge.mp3");
    for (const move of ["block", "dodge_left", "duck", "jump", "somersault"]) some.sfx.playEvent(defended(move));
    expect(context.names()).toEqual(["defendBlock", "defended", "defended", "defended", "defended"]);
    // The usual sound keeps its own level, through the effects' master gain.
    expect(context.started[1]?.level?.gain.value).toBeCloseTo(0.8);
    expect(context.started[1]?.level?.to).not.toBe(context.destination);

    const none = await inBrowser(undefined);
    const bare = await loadedContext(() => { none.sfx.playEvent({ type: "whiffed" }); });
    none.sfx.playEvent(defended("block"));
    expect(bare.names()).toEqual(["synthesised"]);
  });

  test("played before its clip has arrived plays the usual sound, and its own once it is there", async () => {
    const { sfx } = await inBrowser(EVERYTHING, { slow: 400 });
    sfx.playEvent(defended("block"));
    const context = FakeContext.latest;
    expect(context?.names()).toEqual(["synthesised"]);
    await vi.advanceTimersByTimeAsync(500);
    sfx.playEvent(defended("block"));
    expect(context?.names()).toEqual(["synthesised", "defendBlock"]);
  });

  test("a defend event with no attack on it is dropped without a sound or an error", async () => {
    const { sfx } = await inBrowser(EVERYTHING);
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    expect(() => { sfx.playEvent({ type: "defended" } as CombatEvent); }).not.toThrow();
    expect(context.started.length).toBe(0);
  });
});

describe("the chime for an unlocked achievement", () => {
  test("plays the unlock clip once, levelled, straight to the output", async () => {
    const { sfx } = await inBrowser(EVERYTHING);
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    sfx.playUnlock();
    await vi.advanceTimersByTimeAsync(1);
    expect(context.names()).toEqual(["unlock"]);
    expect(context.started[0]?.level?.gain.value).toBeCloseTo((CUE_LOUDNESS / 0.24) * UNLOCK_GAIN);
    expect(context.started[0]?.level?.to).toBe(context.destination);
    expect(context.started[0]?.offset).toBe(0);
  });

  test("asked for twice at once is one chime, and a second later it plays again", async () => {
    const { sfx } = await inBrowser(EVERYTHING);
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    sfx.playUnlock();
    sfx.playUnlock();
    await vi.advanceTimersByTimeAsync(300);
    sfx.playUnlock();
    await vi.advanceTimersByTimeAsync(600);
    sfx.playUnlock();
    await vi.advanceTimersByTimeAsync(10);
    expect(context.names()).toEqual(["unlock"]);
    await vi.advanceTimersByTimeAsync(200);
    sfx.playUnlock();
    await vi.advanceTimersByTimeAsync(10);
    expect(context.names()).toEqual(["unlock", "unlock"]);
  });

  test("is the first sound the game makes: it starts audio, waits for its file, and plays", async () => {
    const { sfx, requested } = await inBrowser(EVERYTHING, { slow: 300 });
    sfx.playUnlock();
    const context = FakeContext.latest;
    expect(context?.started.length).toBe(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(context?.names()).toEqual(["unlock"]);
    expect(requested).toContain("/audio/sfx/unlock.mp3");
  });

  test("a file that takes over a second to arrive gives no late chime", async () => {
    const { sfx } = await inBrowser(EVERYTHING, { slow: 1500 });
    sfx.playUnlock();
    await vi.advanceTimersByTimeAsync(3000);
    expect(FakeContext.latest?.started.length).toBe(0);
    // The next notice finds it loaded.
    sfx.playUnlock();
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeContext.latest?.names()).toEqual(["unlock"]);
  });

  test("is silent with the effects volume at zero, and follows the volume otherwise", async () => {
    const { sfx, settings } = await inBrowser(EVERYTHING);
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    settings.setSettings({ sfxVolume: 0 });
    sfx.playUnlock();
    await vi.advanceTimersByTimeAsync(10);
    expect(context.started.length).toBe(0);
    // A muted call does not count as a chime: turning the sound up and asking again plays at once.
    settings.setSettings({ sfxVolume: 0.5 });
    sfx.playUnlock();
    await vi.advanceTimersByTimeAsync(10);
    expect(context.names()).toEqual(["unlock"]);
    expect(context.started[0]?.level?.gain.value).toBeCloseTo((CUE_LOUDNESS / 0.24) * UNLOCK_GAIN * 0.5);
  });

  test("is silent when the file is missing, not listed, or the folder cannot be read", async () => {
    for (const [index, missing] of [[EVERYTHING, ["unlock"]], [["defended"], []], [undefined, []], [{ unlock: true }, []]] as const) {
      const { sfx } = await inBrowser(index, { missing });
      const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
      expect(() => { sfx.playUnlock(); }).not.toThrow();
      await vi.advanceTimersByTimeAsync(2000);
      expect(context.started.length, JSON.stringify(index)).toBe(0);
    }
  });

  test("before any click or key it stays silent, does not sound late, and works once audio is allowed", async () => {
    FakeContext.locked = true;
    const { sfx } = await inBrowser(EVERYTHING);
    expect(() => { sfx.playUnlock(); }).not.toThrow();
    await vi.advanceTimersByTimeAsync(5000);
    const context = FakeContext.latest;
    expect(context?.state).toBe("suspended");
    expect(context?.started.length).toBe(0);

    FakeContext.locked = false;
    sfx.playUnlock();
    await vi.advanceTimersByTimeAsync(10);
    expect(context?.names()).toEqual(["unlock"]);
  });

  test("in a hidden tab it stays silent", async () => {
    const { sfx } = await inBrowser(EVERYTHING);
    const context = await loadedContext(() => { sfx.playEvent({ type: "whiffed" }); });
    vi.stubGlobal("document", { hidden: true, addEventListener: () => undefined });
    sfx.playUnlock();
    await vi.advanceTimersByTimeAsync(10);
    expect(context.started.length).toBe(0);
  });

  test("where there is no audio, or audio fails to start, it does nothing", async () => {
    const real = await import("../src/audio/sfx");
    expect(() => { real.playUnlock(); real.playUnlock(); }).not.toThrow();

    const { sfx } = await inBrowser(EVERYTHING);
    vi.stubGlobal("AudioContext", function broken() {
      throw new Error("no audio device");
    });
    expect(() => { sfx.playUnlock(); }).not.toThrow();

    const failing = await inBrowser(EVERYTHING);
    const context = await loadedContext(() => { failing.sfx.playEvent({ type: "whiffed" }); });
    context.createBufferSource = () => { throw new Error("out of memory"); };
    expect(() => { failing.sfx.playUnlock(); }).not.toThrow();
    await vi.advanceTimersByTimeAsync(10);
    expect(context.started.length).toBe(0);
  });
});
