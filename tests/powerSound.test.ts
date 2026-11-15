// The sound of each god's power: which clip the powerUnleashed event plays while the power-ready banner is in the fight,
// and that the usual sound plays whenever the god's own cannot. The audio is a stand-in: nothing here is heard.
import { existsSync, readFileSync, statSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { playbackDb } from "../server/tools/levelRules";
import { POWER_CLIPS } from "../server/tools/powerClips";
import { GOD_IDS } from "../src/ai/gods/gods";
import type { GodId } from "../src/ai/gods/gods";
import type { PowerReadyProps } from "../src/ai/power/PowerReady";
import { leadSilence, listedPowerClips, POWER_GAIN, POWER_LOUDNESS, POWER_PEAK } from "../src/audio/powerSound";
import type { CombatEvent } from "../src/core/types";

// The banner is called as a plain function here, so its effects run at once and their clean-ups are kept for the test to run.
const mounted = vi.hoisted(() => ({ cleanups: [] as (() => void)[] }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => (() => void) | undefined) => {
    const cleanup = effect();
    if (cleanup) mounted.cleanups.push(cleanup);
  },
  useRef: <T>(value: T) => ({ current: value }),
}));

const FOLDER = "public/audio/power";
const POWER: CombatEvent = { type: "powerUnleashed", damage: 36 };
const USUAL = "/audio/sfx/powerUnleashed.mp3";
const clipOf = (god: string): string => `/audio/power/${god}.mp3`;
/** The stand-in clips are 1,000 samples a second: 100 ms of silence, then a steady 0.25. */
const RATE = 1000;
const LEAD = 100;
const SIZE = 0.25;

interface FakeGain {
  readonly gain: { value: number };
  connect(node: unknown): unknown;
}

interface Started {
  /** The file the buffer was decoded from. */
  readonly url: string;
  readonly gain: number;
  readonly offset: number;
}

interface Browser {
  /** Every URL asked for, in order. */
  readonly requested: string[];
  /** Every sound started, in order. */
  readonly started: Started[];
  /** The one audio context, once the game has made it. */
  context(): { state: string };
  readonly sfx: typeof import("../src/audio/sfx");
  readonly power: typeof import("../src/audio/powerSound");
  readonly settings: typeof import("../src/settings/store");
  /** Mounts the banner the way the fight does and returns its unmount. */
  mount(god: GodId | null): () => void;
  /** Lets every pending fetch and decode finish. */
  settle(): Promise<void>;
}

interface Options {
  /** What public/audio/power/index.json holds. */
  readonly index?: unknown;
  /** True when the request for that index fails. */
  readonly offline?: boolean;
  /** Clip files that are not there. A test may empty the list later: the files are there from then on. */
  readonly missing?: readonly string[];
  /** The state the audio context starts in. */
  readonly state?: string;
}

/** A fresh copy of the audio modules in a fake browser. */
async function inBrowser({ index = [...GOD_IDS], offline = false, missing = [], state: initial = "running" }: Options = {}): Promise<Browser> {
  const requested: string[] = [];
  const started: Started[] = [];
  const files = new Map<ArrayBuffer, string>();
  class FakeContext {
    static latest: FakeContext | null = null;
    readonly sampleRate = RATE;
    readonly destination = {};
    state = initial;
    constructor() {
      FakeContext.latest = this;
    }
    createGain(): FakeGain {
      return { gain: { value: 1 }, connect: (node: unknown) => node };
    }
    createBuffer(_channels: number, length: number): unknown {
      return { length, getChannelData: () => new Float32Array(length) };
    }
    createBufferSource(): unknown {
      let level: FakeGain | null = null;
      const source = {
        buffer: null as { url: string } | null,
        playbackRate: { value: 1 },
        connect: (node: FakeGain) => {
          level = node;
          return node;
        },
        start: (_when = 0, offset = 0) => {
          started.push({ url: source.buffer?.url ?? "", gain: level?.gain.value ?? Number.NaN, offset });
        },
      };
      return source;
    }
    decodeAudioData(bytes: ArrayBuffer): Promise<unknown> {
      const data = new Float32Array(RATE).fill(SIZE);
      data.fill(0, 0, LEAD);
      return Promise.resolve({ url: files.get(bytes), numberOfChannels: 1, sampleRate: RATE, duration: 1, getChannelData: () => data });
    }
    resume(): Promise<void> {
      return new Promise(() => undefined);
    }
    suspend(): Promise<void> {
      return Promise.resolve();
    }
    addEventListener(): void {
      // The stop sounds listen for state changes; nothing here changes state by itself.
    }
  }
  vi.useFakeTimers();
  vi.resetModules();
  mounted.cleanups.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("fetch", (url: string) => {
    requested.push(url);
    const body = (json: unknown): unknown => {
      const bytes = new ArrayBuffer(8);
      files.set(bytes, url);
      return { ok: true, status: 200, json: () => Promise.resolve(json), arrayBuffer: () => Promise.resolve(bytes) };
    };
    if (url === "/audio/sfx/index.json") return Promise.resolve(body(["powerUnleashed", "whiffed"]));
    if (url === "/audio/power/index.json") return offline ? Promise.reject(new Error("offline")) : Promise.resolve(body(index));
    if (missing.includes(url)) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve(body(null));
  });
  const sfx = await import("../src/audio/sfx");
  const power = await import("../src/audio/powerSound");
  const settings = await import("../src/settings/store");
  const { PowerReady } = await import("../src/ai/power/PowerReady");
  const settle = async (): Promise<void> => {
    for (let turn = 0; turn < 50; turn++) await Promise.resolve();
  };
  const mount = (god: GodId | null): (() => void) => {
    const props: PowerReadyProps = { god, power: 0, keyboard: true, phase: "defend" };
    const before = mounted.cleanups.length;
    expect(PowerReady(props)).toBeNull();
    const own = mounted.cleanups.slice(before);
    return () => {
      for (const cleanup of own) cleanup();
    };
  };
  return {
    requested, started, sfx, power, settings, mount, settle,
    context: () => {
      if (FakeContext.latest === null) throw new Error("no audio context was made");
      return FakeContext.latest;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the power-ready banner chooses the sound of the power", () => {
  test.each(GOD_IDS)("%s: the power plays that god's clip, once, and not the usual sound", async (god) => {
    const { mount, settle, sfx, started, requested } = await inBrowser();
    mount(god);
    await settle();
    // Only this god's clip is fetched, never all six.
    expect(requested.filter((url) => url.startsWith("/audio/power/")).sort()).toEqual([clipOf(god), "/audio/power/index.json"].sort());
    sfx.playEvent(POWER);
    expect(started.map((sound) => sound.url)).toEqual([clipOf(god)]);
    sfx.playEvent(POWER);
    expect(started.map((sound) => sound.url)).toEqual([clipOf(god), clipOf(god)]);
  });

  test("the six gods play six different files", async () => {
    const heard: string[] = [];
    for (const god of GOD_IDS) {
      const { mount, settle, sfx, started } = await inBrowser();
      mount(god);
      await settle();
      sfx.playEvent(POWER);
      heard.push(...started.map((sound) => sound.url));
    }
    expect(heard).toHaveLength(6);
    expect(new Set(heard).size).toBe(6);
  });

  test("with no god the power plays Athena's clip, as the banner says she lends her aegis", async () => {
    const { mount, settle, sfx, power, started } = await inBrowser();
    mount(null);
    expect(power.heldPowerSound()).toBe("athena");
    await settle();
    sfx.playEvent(POWER);
    expect(started.map((sound) => sound.url)).toEqual([clipOf("athena")]);
  });

  test("unmounting gives the usual power sound back", async () => {
    const { mount, settle, sfx, power, started } = await inBrowser();
    const unmount = mount("zeus");
    await settle();
    expect(power.heldPowerSound()).toBe("zeus");
    unmount();
    expect(power.heldPowerSound()).toBeNull();
    sfx.playEvent(POWER);
    expect(started.map((sound) => sound.url)).toEqual([USUAL]);
  });

  test("a banner that unmounts late does not silence the one mounted after it", async () => {
    const { mount, settle, sfx, power, started } = await inBrowser();
    const first = mount("zeus");
    const second = mount("apollo");
    await settle();
    first();
    expect(power.heldPowerSound()).toBe("apollo");
    sfx.playEvent(POWER);
    expect(started.map((sound) => sound.url)).toEqual([clipOf("apollo")]);
    second();
    expect(power.heldPowerSound()).toBeNull();
  });

  test("every other event keeps its usual sound while a god is held", async () => {
    const { mount, settle, sfx, started } = await inBrowser();
    mount("poseidon");
    await settle();
    sfx.playEvent({ type: "whiffed" });
    expect(started.map((sound) => sound.url)).toEqual(["/audio/sfx/whiffed.mp3"]);
  });
});

describe("the usual power sound plays whenever the god's own cannot", () => {
  test("a clip file that is missing", async () => {
    const { mount, settle, sfx, started } = await inBrowser({ missing: [clipOf("hermes")] });
    mount("hermes");
    await settle();
    expect(() => { sfx.playEvent(POWER); }).not.toThrow();
    expect(started.map((sound) => sound.url)).toEqual([USUAL]);
  });

  test("a god the index does not list: the file is not asked for", async () => {
    const { mount, settle, sfx, started, requested } = await inBrowser({ index: ["zeus"] });
    mount("artemis");
    await settle();
    sfx.playEvent(POWER);
    expect(started.map((sound) => sound.url)).toEqual([USUAL]);
    expect(requested).not.toContain(clipOf("artemis"));
  });

  test.each<[string, Options]>([["cannot be fetched", { offline: true }], ["is not a list", { index: { zeus: true } }]])("an index that %s", async (_what, options) => {
    const { mount, settle, sfx, started } = await inBrowser(options);
    mount("zeus");
    await settle();
    expect(() => { sfx.playEvent(POWER); }).not.toThrow();
    expect(started.map((sound) => sound.url)).toEqual([USUAL]);
  });

  test("a clip that has not loaded yet, and the god's own once it has", async () => {
    const { mount, settle, sfx, started } = await inBrowser();
    // The usual effects are loaded before the banner mounts, as they are by the time a fight starts.
    sfx.sharedAudioContext();
    await settle();
    mount("apollo");
    sfx.playEvent(POWER);
    await settle();
    sfx.playEvent(POWER);
    expect(started.map((sound) => sound.url)).toEqual([USUAL, clipOf("apollo")]);
  });

  test("a failed clip is asked for again only after ten seconds, and plays once it loads", async () => {
    const missing = [clipOf("zeus")];
    const { mount, settle, sfx, started, requested } = await inBrowser({ missing });
    mount("zeus");
    await settle();
    const asked = (): number => requested.filter((url) => url === clipOf("zeus")).length;
    expect(asked()).toBe(1);
    sfx.playEvent(POWER);
    await settle();
    expect(asked()).toBe(1);
    // The file is there now.
    missing.length = 0;
    vi.advanceTimersByTime(10_001);
    sfx.playEvent(POWER);
    await settle();
    expect(asked()).toBe(2);
    sfx.playEvent(POWER);
    expect(started.map((sound) => sound.url)).toEqual([USUAL, USUAL, clipOf("zeus")]);
  });

  test("audio that is not running: nothing of the god's is started", async () => {
    const { mount, settle, sfx, power, started, context } = await inBrowser({ state: "suspended" });
    mount("zeus");
    await settle();
    expect(context().state).toBe("suspended");
    expect(power.playPowerSound()).toBe(false);
    expect(() => { sfx.playEvent(POWER); }).not.toThrow();
    expect(started.filter((sound) => sound.url === clipOf("zeus"))).toEqual([]);
  });

  test("no audio at all: holding and playing do nothing and do not throw", async () => {
    const { mount, sfx, power, started } = await inBrowser();
    vi.stubGlobal("AudioContext", undefined);
    const unmount = mount("zeus");
    expect(power.playPowerSound()).toBe(false);
    expect(() => { sfx.playEvent(POWER); }).not.toThrow();
    expect(() => { unmount(); }).not.toThrow();
    expect(started).toEqual([]);
  });
});

describe("how the clip is played", () => {
  test("it starts past its silence, levelled to its loudness, a little over the hit sounds, and follows the effects volume", async () => {
    const { mount, settle, sfx, settings, started } = await inBrowser();
    settings.setSettings({ sfxVolume: 1 });
    mount("zeus");
    await settle();
    sfx.playEvent(POWER);
    settings.setSettings({ sfxVolume: 0.5 });
    sfx.playEvent(POWER);
    settings.setSettings({ sfxVolume: 1 });
    const level = POWER_LOUDNESS / SIZE;
    expect(started[0]?.offset).toBeCloseTo(LEAD / RATE);
    expect(started[0]?.gain).toBeCloseTo(level * POWER_GAIN);
    expect(started[1]?.gain).toBeCloseTo(level * POWER_GAIN * 0.5);
    // The effects and the stop events play through 0.5.
    expect(POWER_GAIN).toBeGreaterThan(0.5);
    // No clip can pass full scale at the output.
    expect(POWER_GAIN * POWER_PEAK).toBeLessThan(0.7);
  });

  test("the silence before a clip is measured to its first sound in any channel, and at most half a second", () => {
    const clip = (lead: number, length = 2000): Float32Array => new Float32Array(length).fill(0.5).fill(0, 0, lead);
    expect(leadSilence([clip(0)], 1000)).toBe(0);
    expect(leadSilence([clip(265)], 1000)).toBeCloseTo(0.265);
    expect(leadSilence([clip(400), clip(120)], 1000)).toBeCloseTo(0.12);
    expect(leadSilence([clip(900)], 1000)).toBe(0.5);
    // Under -50 dBFS is silence.
    expect(leadSilence([new Float32Array(2000).fill(0.002).fill(0.5, 300)], 1000)).toBeCloseTo(0.3);
    expect(leadSilence([new Float32Array(100)], 1000)).toBe(0);
    expect(leadSilence([], 1000)).toBe(0);
    expect(leadSilence([clip(10)], 0)).toBe(0);
  });

  test("an index.json is read as a list of names, and anything else as empty", () => {
    expect(listedPowerClips(["zeus", 3, null, "apollo"])).toEqual(["zeus", "apollo"]);
    expect(listedPowerClips({ zeus: true })).toEqual([]);
    expect(listedPowerClips(null)).toEqual([]);
  });
});

describe("the clips in the repository", () => {
  test("there is one clip for each god, and index.json lists exactly those", () => {
    const listed = JSON.parse(readFileSync(`${FOLDER}/index.json`, "utf8")) as unknown;
    expect(listed).toEqual([...GOD_IDS].sort());
    for (const god of GOD_IDS) {
      expect(existsSync(`${FOLDER}/${god}.mp3`), god).toBe(true);
      // At 128 kbps a clip of 1.2 to 2.2 seconds is 19 KB to 36 KB.
      const bytes = statSync(`${FOLDER}/${god}.mp3`).size;
      expect(bytes, god).toBeGreaterThan(15_000);
      expect(bytes, god).toBeLessThan(40_000);
    }
  });

  test("the tool has one prompt for each god, each 1.2 to 2.2 seconds long, and no two alike", () => {
    expect(Object.keys(POWER_CLIPS).sort()).toEqual([...GOD_IDS].sort());
    for (const [god, { prompt, seconds }] of Object.entries(POWER_CLIPS)) {
      expect(prompt.length, god).toBeGreaterThan(20);
      expect(seconds, god).toBeGreaterThanOrEqual(1.2);
      expect(seconds, god).toBeLessThanOrEqual(2.2);
    }
    expect(new Set(Object.values(POWER_CLIPS).map(({ prompt }) => prompt)).size).toBe(GOD_IDS.length);
  });

  test("the levels doc works out what playback adds from the same numbers the game plays by", () => {
    // Quiet enough that the loudness decides, then loud enough that the peak does.
    expect(playbackDb("power/zeus.mp3", POWER_LOUDNESS / 2, 0.3)).toBeCloseTo(20 * Math.log10(2 * POWER_GAIN));
    expect(playbackDb("power/zeus.mp3", POWER_LOUDNESS / 2, 0.9)).toBeCloseTo(20 * Math.log10((POWER_PEAK / 0.9) * POWER_GAIN));
  });
});
