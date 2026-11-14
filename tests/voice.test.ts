// Athena's voice: which line each combat event calls for, and that lines never overlap or get stuck.
import { afterEach, expect, test, vi } from "vitest";
import { ATHENA_LINES } from "../src/audio/athenaLines";
import { audioPlayer, createVoice, lineFor, parseClipIndex, playVoice, speakLine } from "../src/audio/voice";
import type { ClipAudio } from "../src/audio/voice";
import { startFight, step } from "../src/combat/engine";
import type { CombatEvent, EnemyAttack, EnemySpec, FightingStyle, WeakSpot } from "../src/core/types";
import { enemy as polyphemus } from "../src/enemies/defs/polyphemus";
import { enemy as scylla } from "../src/enemies/defs/scylla";
import { ENEMIES } from "../src/enemies/registry";

const ALL_IDS = ATHENA_LINES.map((line) => line.id);
const attack: EnemyAttack = { id: "grab", name: "Grab", telegraphMs: 1600, damage: 20, counter: "duck" };
const weakSpot: WeakSpot = { id: "eye", label: "his one eye", position: [0, 4, 1], moves: ["jab"] };

const telegraph: CombatEvent = { type: "telegraph", attack };
const opening: CombatEvent = { type: "opening", weakSpot, move: "jab" };
const enemyHit: CombatEvent = { type: "enemyHit", move: "jab", damage: 10, quality: 1 };
const playerHit: CombatEvent = { type: "playerHit", attack, damage: 20 };

const style: FightingStyle = { id: "s", name: "S", blurb: "", strikes: ["jab", "cross", "hook", "overhead_strike"] };
const STEP_MS = 50;

/** A voice whose clips are recorded instead of played; `end` finishes the clip started most recently. */
function fakeVoice(available: readonly string[] = ALL_IDS) {
  const started: string[] = [];
  const stopped: string[] = [];
  /** Starts and stops in the order they happened, as "start:<id>" and "stop:<id>". */
  const order: string[] = [];
  const ends: (() => void)[] = [];
  const voice = createVoice({
    available: (id) => available.includes(id),
    play: (id, done) => {
      started.push(id);
      order.push(`start:${id}`);
      ends.push(done);
      return () => {
        stopped.push(id);
        order.push(`stop:${id}`);
      };
    },
    random: () => 0,
  });
  return { voice, started, stopped, order, end: (index = ends.length - 1) => ends[index]?.() };
}

/** A stand-in audio element: records calls in order and lets the test fire "ended" or "error". */
function fakeAudio(play: () => Promise<void>) {
  const listeners = new Map<string, () => void>();
  const urls: string[] = [];
  /** "play <url>" and "pause <url>" in the order they happened. */
  const calls: string[] = [];
  const open = (url: string): ClipAudio => {
    urls.push(url);
    return {
      play: () => {
        calls.push(`play ${url}`);
        return play();
      },
      pause: () => {
        calls.push(`pause ${url}`);
      },
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
    };
  };
  const paused = (): number => calls.filter((call) => call.startsWith("pause")).length;
  return { open, urls, calls, fire: (type: "ended" | "error") => listeners.get(type)?.(), paused };
}

function audioVoice(play: () => Promise<void>) {
  const audio = fakeAudio(play);
  const voice = createVoice({ available: () => true, play: audioPlayer(audio.open), random: () => 0 });
  return { voice, audio };
}

function words(id: string): number {
  return (ATHENA_LINES.find((line) => line.id === id)?.text ?? "").split(/\s+/).filter(Boolean).length;
}

/**
 * A whole fight through the real engine, with every clip lasting msPerWord per word of its line.
 * The player defends every attack and strikes strikeAfterMs into each opening.
 * Returns the calls the fight asked for and the lines the voice spoke.
 */
function coachedFight(enemy: EnemySpec, strikeAfterMs: number, msPerWord: number) {
  const asked: string[] = [];
  const spoken: string[] = [];
  let now = 0;
  let clip: { readonly endsAt: number; readonly done: () => void } | null = null;
  const voice = createVoice({
    available: () => true,
    play: (id, done) => {
      spoken.push(id);
      clip = { endsAt: now + words(id) * msPerWord, done };
      return () => {
        clip = null;
      };
    },
    random: () => 0,
  });
  let state = startFight(enemy, 7);
  for (let tick = 0; tick < 5000 && state.phase.kind !== "won" && state.phase.kind !== "lost"; tick += 1) {
    now += STEP_MS;
    const playing = clip as { readonly endsAt: number; readonly done: () => void } | null;
    if (playing && now >= playing.endsAt) {
      clip = null;
      playing.done();
    }
    const phase = state.phase;
    const held = new Set(phase.kind === "defend" ? [phase.attack.counter] : []);
    const ready = (phase.kind === "strike" || phase.kind === "finisher") && phase.totalMs - phase.msLeft >= strikeAfterMs;
    const struck = ready ? [{ move: phase.move, quality: 1, player: 0 as const }] : [];
    const result = step(state, enemy, style, { held, struck }, STEP_MS);
    state = result.state;
    for (const event of result.events) {
      if (event.type === "telegraph" || event.type === "opening") asked.push(lineFor(event, () => 0) ?? "");
    }
    voice.handle(result.events);
  }
  return { asked, spoken, outcome: state.phase.kind };
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

test("praise and warnings arriving while a line plays are skipped, then the voice is free again", () => {
  const { voice, started, stopped, end } = fakeVoice();
  voice.handle([enemyHit]);
  voice.handle([playerHit]);
  expect(voice.speak("praise_2")).toBe(false);
  expect(started).toEqual(["praise_1"]);
  expect(stopped).toEqual([]);

  end();
  voice.handle([playerHit]);
  expect(started).toEqual(["praise_1", "warn_1"]);
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

test("a new call replaces a call that is still playing: the old one is for a beat that has passed", () => {
  const { voice, started, stopped, order } = fakeVoice();
  voice.handle([telegraph]);
  voice.handle([{ type: "defended", attack }, opening]);
  expect(started).toEqual(["call_duck", "call_jab"]);
  expect(stopped).toEqual(["call_duck"]);
  expect(order).toEqual(["start:call_duck", "stop:call_duck", "start:call_jab"]);
});

test("the line playing is stopped before the next one starts, so two are never heard together", () => {
  const { voice, order } = fakeVoice();
  voice.handle([enemyHit]);
  voice.handle([telegraph]);
  voice.handle([{ type: "won" }]);
  expect(order).toEqual(["start:praise_1", "stop:praise_1", "start:call_duck", "stop:call_duck", "start:win"]);
});

test("a call stops praise, and the result stops a call", () => {
  const { voice, started, stopped } = fakeVoice();
  voice.handle([enemyHit]);
  voice.handle([telegraph]);
  expect(started).toEqual(["praise_1", "call_duck"]);
  expect(stopped).toEqual(["praise_1"]);

  voice.handle([{ type: "won" }]);
  expect(started).toEqual(["praise_1", "call_duck", "win"]);
  expect(stopped).toEqual(["praise_1", "call_duck"]);
});

test("a loss is as urgent as a win: it beats the warning in its own frame and stops a call", () => {
  const frame = fakeVoice();
  frame.voice.handle([playerHit, { type: "lost" }]);
  expect(frame.started).toEqual(["loss"]);

  const { voice, order } = fakeVoice();
  voice.handle([telegraph]);
  voice.handle([{ type: "lost" }]);
  expect(order).toEqual(["start:call_duck", "stop:call_duck", "start:loss"]);
});

test("the result is not cut off by praise, warnings, phase lines or another result", () => {
  for (const result of ["won", "lost"] as const) {
    const { voice, started, stopped } = fakeVoice();
    voice.handle([{ type: result }]);
    voice.handle([enemyHit]);
    voice.handle([playerHit]);
    voice.handle([{ type: "won" }]);
    voice.handle([{ type: "lost" }]);
    expect(voice.speak("phase_1")).toBe(false);
    expect(started).toHaveLength(1);
    expect(stopped).toEqual([]);
  }
});

test("a call or fight start heard over the result belongs to the next fight and replaces it", () => {
  const { voice, started, stopped } = fakeVoice();
  voice.handle([{ type: "won" }]);
  voice.handle([telegraph]);
  expect(started).toEqual(["win", "call_duck"]);
  expect(stopped).toEqual(["win"]);

  const retry = fakeVoice();
  retry.voice.handle([{ type: "lost" }]);
  expect(retry.voice.speak("fight_start")).toBe(true);
  expect(retry.order).toEqual(["start:loss", "stop:loss", "start:fight_start"]);
});

test("fight start and phase lines replace praise and warnings, and are not refused behind them", () => {
  const { voice, order } = fakeVoice();
  voice.handle([enemyHit]);
  expect(voice.speak("phase_1")).toBe(true);
  expect(order).toEqual(["start:praise_1", "stop:praise_1", "start:phase_1"]);

  const start = fakeVoice();
  start.voice.handle([playerHit]);
  expect(start.voice.speak("fight_start")).toBe(true);
  expect(start.started).toEqual(["warn_1", "fight_start"]);
});

test("fight start and phase lines yield to calls and are not cut off by praise, warnings or each other", () => {
  const { voice, started, stopped } = fakeVoice();
  expect(voice.speak("phase_2")).toBe(true);
  voice.handle([enemyHit]);
  voice.handle([playerHit]);
  expect(voice.speak("fight_start")).toBe(false);
  expect(started).toEqual(["phase_2"]);

  voice.handle([telegraph]);
  expect(started).toEqual(["phase_2", "call_duck"]);
  expect(stopped).toEqual(["phase_2"]);
  expect(voice.speak("phase_1")).toBe(false);
  expect(voice.speak("fight_start")).toBe(false);
});

test("a phase change is announced once the fight is past its first phase", () => {
  expect(lineFor({ type: "phaseChanged", index: 0, name: "The Cave" }, () => 0)).toBeNull();
  expect(lineFor({ type: "phaseChanged", index: 1, name: "The Club" }, () => 0)).toBe("phase_1");
  expect(lineFor({ type: "phaseChanged", index: 2, name: "Blinded" }, () => 0)).toBe("phase_2");
  expect(lineFor({ type: "finished", move: "stake_thrust" }, () => 0)).toBeNull();
});

test("a move with no call of its own gets the general call, so a new move is never met with silence", () => {
  const { voice, started } = fakeVoice();
  voice.handle([{ type: "telegraph", attack: { ...attack, counter: "some_new_defense" } }]);
  voice.handle([{ type: "opening", weakSpot, move: "some_new_strike" }]);
  expect(started).toEqual(["call_any_defend", "call_any_strike"]);
});

test("the finishing move is called when it begins and again when its window runs out, but not on every frame", () => {
  const { voice, started } = fakeVoice();
  const finisher = { kind: "finisher", move: "stake_thrust", msLeft: 6000, totalMs: 6000 } as const;
  voice.handle([enemyHit], finisher);
  voice.handle([], finisher);
  voice.handle([], finisher);
  expect(started).toEqual(["call_stake_thrust"]);
  voice.handle([{ type: "whiffed" }], finisher);
  expect(started).toEqual(["call_stake_thrust", "call_stake_thrust"]);
  voice.handle([{ type: "won" }], { kind: "won" });
  expect(started.at(-1)).toBe("win");
});

test("every call of a real fight is spoken, however slowly the clips play or the player strikes", () => {
  for (const enemy of [polyphemus, scylla]) {
    for (const msPerWord of [300, 400]) {
      for (const strikeAfterMs of [0, 700, 1500]) {
        const { asked, spoken, outcome } = coachedFight(enemy, strikeAfterMs, msPerWord);
        const label = `${enemy.id} ${String(msPerWord)}ms/word strike after ${String(strikeAfterMs)}ms`;
        expect(outcome, label).toBe("won");
        expect(asked.length, label).toBeGreaterThan(8);
        expect(spoken.filter((id) => id.startsWith("call_")), label).toEqual(asked);
        expect(spoken.at(-1), label).toBe("win");
      }
    }
  }
});

test("every defend call fits inside the telegraph it announces", () => {
  for (const enemy of ENEMIES) {
    for (const each of enemy.attacks) {
      expect(words(`call_${each.counter}`), `${enemy.id}/${each.id}`).toBeGreaterThan(0);
      expect(words(`call_${each.counter}`) * 350, `${enemy.id}/${each.id}`).toBeLessThanOrEqual(each.telegraphMs);
    }
  }
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
  voice.handle([enemyHit]);
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
  expect(voice.speak("praise_1")).toBe(false);
  expect(audio.urls).toEqual(["/audio/athena/call_duck.mp3"]);

  audio.fire("ended");
  expect(voice.speak("praise_1")).toBe(true);
  expect(audio.urls).toEqual(["/audio/athena/call_duck.mp3", "/audio/athena/praise_1.mp3"]);
  expect(audio.paused()).toBe(0);
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
  expect(audio.calls).toEqual([
    "play /audio/athena/praise_1.mp3",
    "pause /audio/athena/praise_1.mp3",
    "play /audio/athena/call_duck.mp3",
  ]);
  expect(voice.speak("praise_2")).toBe(false);

  vi.advanceTimersByTime(10_000);
  expect(audio.calls.at(-1)).toBe("pause /audio/athena/call_duck.mp3");
  expect(audio.paused()).toBe(2);
  expect(voice.speak("praise_2")).toBe(true);
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
  expect(urls).toEqual([]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  // Listed clips are fetched ahead of time, so the first call is not late.
  expect(urls).toEqual(["/audio/athena/call_duck.mp3"]);
  expect(voice.speak("win")).toBe(false);
  expect(voice.speak("call_duck")).toBe(true);
  expect(urls).toEqual(["/audio/athena/call_duck.mp3", "/audio/athena/call_duck.mp3"]);
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

test("an index answered with an error status is not trusted, whatever its body says", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const opened = vi.fn();
  vi.stubGlobal("Audio", opened);
  vi.stubGlobal("fetch", () => Promise.resolve({ ok: false, json: () => Promise.resolve(["win"]) }));

  const voice = createVoice();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(voice.speak("win")).toBe(false);
  expect(opened).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
});

test("the shared voice is silent, not broken, where there is no audio", () => {
  expect(() => {
    playVoice([telegraph, { type: "won" }]);
  }).not.toThrow();
  expect(speakLine("fight_start")).toBe(false);
});
