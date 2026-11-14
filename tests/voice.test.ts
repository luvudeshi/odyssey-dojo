// Athena's voice: which line each combat event calls for, and that lines never overlap or get stuck.
import { afterEach, expect, test, vi } from "vitest";
import { ATHENA_LINES } from "../src/audio/athenaLines";
import { audioPlayer, createVoice, lineFor, parseClipIndex, playVoice, speakLine } from "../src/audio/voice";
import type { ClipAudio } from "../src/audio/voice";
import type { CombatEvent, EnemyAttack, WeakSpot } from "../src/core/types";

const ALL_IDS = ATHENA_LINES.map((line) => line.id);
const attack: EnemyAttack = { id: "grab", name: "Grab", telegraphMs: 1600, damage: 20, counter: "duck" };
const weakSpot: WeakSpot = { id: "eye", label: "his one eye", position: [0, 4, 1], moves: ["jab"] };

const telegraph: CombatEvent = { type: "telegraph", attack };
const opening: CombatEvent = { type: "opening", weakSpot, move: "jab" };
const enemyHit: CombatEvent = { type: "enemyHit", move: "jab", damage: 10 };
const playerHit: CombatEvent = { type: "playerHit", attack, damage: 20 };

/** A voice whose clips are recorded instead of played; `end` finishes the clip started most recently. */
function fakeVoice(available: readonly string[] = ALL_IDS) {
  const started: string[] = [];
  const stopped: string[] = [];
  const ends: (() => void)[] = [];
  const voice = createVoice({
    available: (id) => available.includes(id),
    play: (id, done) => {
      started.push(id);
      ends.push(done);
      return () => {
        stopped.push(id);
      };
    },
    random: () => 0,
  });
  return { voice, started, stopped, end: (index = ends.length - 1) => ends[index]?.() };
}

/** A stand-in audio element: records calls and lets the test fire "ended" or "error". */
function fakeAudio(play: () => Promise<void>) {
  const listeners = new Map<string, () => void>();
  const urls: string[] = [];
  let paused = 0;
  const open = (url: string): ClipAudio => {
    urls.push(url);
    return {
      play,
      pause: () => {
        paused += 1;
      },
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
    };
  };
  return { open, urls, fire: (type: "ended" | "error") => listeners.get(type)?.(), paused: () => paused };
}

function audioVoice(play: () => Promise<void>) {
  const audio = fakeAudio(play);
  const voice = createVoice({ available: () => true, play: audioPlayer(audio.open), random: () => 0 });
  return { voice, audio };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("every combat event maps to its line, and the rest to none", () => {
  const first = (): number => 0;
  expect(lineFor(telegraph, first)).toBe("call_duck");
  expect(lineFor(opening, first)).toBe("call_jab");
  expect(lineFor(enemyHit, first)).toBe("praise_1");
  expect(lineFor(playerHit, first)).toBe("warn_1");
  expect(lineFor({ type: "won" }, first)).toBe("win");
  expect(lineFor({ type: "lost" }, first)).toBe("loss");
  expect(lineFor({ type: "defended", attack }, first)).toBeNull();
  expect(lineFor({ type: "whiffed" }, first)).toBeNull();
});

test("event types added later are ignored", () => {
  for (const type of ["phaseChanged", "finished", "somethingNew"]) {
    expect(lineFor({ type } as unknown as CombatEvent, () => 0)).toBeNull();
  }
});

test("praise and warnings follow the random source and stay in range at its edges", () => {
  expect(lineFor(enemyHit, () => 0.5)).toBe("praise_2");
  expect(lineFor(enemyHit, () => 0.99)).toBe("praise_3");
  expect(lineFor(enemyHit, () => 1)).toBe("praise_1");
  expect(lineFor(playerHit, () => 0.5)).toBe("warn_2");
  expect(lineFor(playerHit, () => 0.99)).toBe("warn_3");
});

test("every line the mapping can produce for the current moves is in the script", () => {
  for (const move of ["block", "duck", "dodge_left", "dodge_right", "jab", "cross", "hook", "overhead_strike", "spear_thrust"]) {
    expect(ALL_IDS).toContain(lineFor({ type: "telegraph", attack: { ...attack, counter: move } }, () => 0));
    expect(ALL_IDS).toContain(lineFor({ type: "opening", weakSpot, move }, () => 0));
  }
});

test("a line arriving while another of the same urgency plays is skipped, then the voice is free again", () => {
  const { voice, started, stopped, end } = fakeVoice();
  voice.handle([telegraph]);
  voice.handle([opening]);
  expect(voice.speak("call_block")).toBe(false);
  expect(started).toEqual(["call_duck"]);
  expect(stopped).toEqual([]);

  end();
  voice.handle([opening]);
  expect(started).toEqual(["call_duck", "call_jab"]);
});

test("praise and warnings never cut in on a call or on each other", () => {
  const { voice, started, end } = fakeVoice();
  voice.handle([telegraph]);
  voice.handle([playerHit]);
  voice.handle([enemyHit]);
  expect(started).toEqual(["call_duck"]);

  end();
  voice.handle([enemyHit]);
  voice.handle([playerHit]);
  expect(started).toEqual(["call_duck", "praise_1"]);
});

test("a call stops praise, and the result stops a call; nothing stops the result", () => {
  const { voice, started, stopped } = fakeVoice();
  voice.handle([enemyHit]);
  voice.handle([telegraph]);
  expect(started).toEqual(["praise_1", "call_duck"]);
  expect(stopped).toEqual(["praise_1"]);

  voice.handle([{ type: "won" }]);
  expect(started).toEqual(["praise_1", "call_duck", "win"]);
  expect(stopped).toEqual(["praise_1", "call_duck"]);

  voice.handle([telegraph]);
  voice.handle([{ type: "lost" }]);
  expect(started).toEqual(["praise_1", "call_duck", "win"]);
});

test("one frame with several events speaks only the most urgent line", () => {
  const { voice, started, stopped } = fakeVoice();
  voice.handle([{ type: "defended", attack }, enemyHit, opening, playerHit]);
  expect(started).toEqual(["call_jab"]);

  expect(stopped).toEqual([]);

  const final = fakeVoice();
  final.voice.handle([enemyHit, { type: "won" }]);
  expect(final.started).toEqual(["win"]);
});

test("a stopped clip that reports its end late does not free the line that replaced it", () => {
  const { voice, started, end } = fakeVoice();
  voice.handle([enemyHit]);
  voice.handle([telegraph]);
  end(0);
  voice.handle([opening]);
  expect(started).toEqual(["praise_1", "call_duck"]);
});

test("an id missing from the index is never requested and does not block the next line", () => {
  const { voice, started } = fakeVoice(["call_jab"]);
  voice.handle([telegraph]);
  expect(voice.speak("fight_start")).toBe(false);
  expect(started).toEqual([]);

  voice.handle([opening]);
  expect(started).toEqual(["call_jab"]);
});

test("a missing clip for the urgent line does not let a lesser line from the same frame through", () => {
  const { voice, started } = fakeVoice(["praise_1"]);
  voice.handle([enemyHit, { type: "won" }]);
  expect(started).toEqual([]);
});

test("a player that throws is treated as a failed clip", () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  let fail = true;
  const started: string[] = [];
  const voice = createVoice({
    available: () => true,
    play: (id) => {
      if (fail) throw new Error("no audio");
      started.push(id);
      return () => undefined;
    },
    random: () => 0,
  });
  expect(voice.speak("call_duck")).toBe(false);
  fail = false;
  expect(voice.speak("call_jab")).toBe(true);
  expect(started).toEqual(["call_jab"]);
});

test("dispose stops the current line and silences the voice", () => {
  const { voice, started, stopped } = fakeVoice();
  voice.handle([telegraph]);
  voice.dispose();
  voice.handle([{ type: "won" }]);
  expect(started).toEqual(["call_duck"]);
  expect(stopped).toEqual(["call_duck"]);
});

test("the audio player requests the clip's url and frees the voice when it ends", async () => {
  const { voice, audio } = audioVoice(() => Promise.resolve());
  expect(voice.speak("call_duck")).toBe(true);
  await Promise.resolve();
  expect(voice.speak("call_jab")).toBe(false);
  expect(audio.urls).toEqual(["/audio/athena/call_duck.mp3"]);

  audio.fire("ended");
  expect(voice.speak("call_jab")).toBe(true);
  expect(audio.urls).toEqual(["/audio/athena/call_duck.mp3", "/audio/athena/call_jab.mp3"]);
});

test("a play() rejected by the autoplay policy frees the voice", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const { voice, audio } = audioVoice(() => Promise.reject(new Error("NotAllowedError")));
  expect(voice.speak("call_duck")).toBe(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(warn).toHaveBeenCalledOnce();
  expect(voice.speak("call_jab")).toBe(true);
  expect(audio.urls).toHaveLength(2);
});

test("a clip that fails to load frees the voice", () => {
  const { voice, audio } = audioVoice(() => Promise.resolve());
  voice.speak("call_duck");
  audio.fire("error");
  expect(voice.speak("call_jab")).toBe(true);
});

test("a clip that never ends is given up on, and a pre-empted clip is paused", () => {
  vi.useFakeTimers();
  const { voice, audio } = audioVoice(() => Promise.resolve());
  voice.speak("praise_1");
  voice.speak("call_duck");
  expect(audio.paused()).toBe(1);
  expect(voice.speak("call_jab")).toBe(false);

  vi.advanceTimersByTime(10_000);
  expect(audio.paused()).toBe(2);
  expect(voice.speak("call_jab")).toBe(true);
});

test("the clip index accepts a list of ids and treats anything else as empty", () => {
  expect([...parseClipIndex(["win", "loss"])]).toEqual(["win", "loss"]);
  expect([...parseClipIndex(["win", 3, null])]).toEqual(["win"]);
  expect(parseClipIndex({ win: true }).size).toBe(0);
  expect(parseClipIndex("<!doctype html>").size).toBe(0);
  expect(parseClipIndex(undefined).size).toBe(0);
});

test("the default voice loads index.json once and only requests the clips it lists", async () => {
  const urls: string[] = [];
  class FakeAudio implements ClipAudio {
    constructor(url: string) {
      urls.push(url);
    }
    play(): Promise<void> {
      return Promise.resolve();
    }
    pause(): undefined {
      return undefined;
    }
    addEventListener(): undefined {
      return undefined;
    }
  }
  const fetched = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(["call_duck"]) }));
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("fetch", fetched);

  const voice = createVoice();
  expect(voice.speak("call_duck")).toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(voice.speak("win")).toBe(false);
  expect(voice.speak("call_duck")).toBe(true);
  expect(urls).toEqual(["/audio/athena/call_duck.mp3"]);
  expect(fetched.mock.calls).toEqual([["/audio/athena/index.json"]]);
  voice.dispose();
});

test("an index that cannot be loaded leaves the default voice silent", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const opened = vi.fn();
  vi.stubGlobal("Audio", opened);
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));

  const voice = createVoice();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(voice.speak("win")).toBe(false);
  expect(opened).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledOnce();
});

test("the shared voice is silent, not broken, where there is no audio", () => {
  expect(() => {
    playVoice([telegraph, { type: "won" }]);
  }).not.toThrow();
  expect(speakLine("fight_start")).toBe(false);
});
