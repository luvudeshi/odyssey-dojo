// Guards the sound over a long session: one audio context however many fights are played, no spoken clip left playing
// or held once its fight is gone, and nothing heard while the fight is paused or the tab is hidden.
// The fights here make the same calls FightScreen, EndScreen and App make, over stand-ins for the browser's own
// AudioContext, Audio element and document. Every module under src/audio is the real one.
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CombatEvent, EnemySpec } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";

/** How long every stand-in voice clip runs. */
const CLIP_MS = 1500;
const FIGHTS = 10;

/** A gain or a playback rate. What is scheduled on it is not looked at here. */
const fakeParam = () => ({
  value: 1,
  setValueAtTime: () => undefined,
  linearRampToValueAtTime: () => undefined,
  cancelScheduledValues: () => undefined,
  setTargetAtTime: () => undefined,
});

/** Just enough of an AudioContext for the effects, the music and a stop's ambience to play through it. */
class FakeContext {
  /** Every context the game has constructed. */
  static made: FakeContext[] = [];
  readonly sampleRate = 44100;
  readonly destination = {};
  readonly listeners: (() => void)[] = [];
  currentTime = 0;
  state = "running";
  /** How many sounds were started through this context. */
  started = 0;
  closed = false;

  constructor() {
    FakeContext.made.push(this);
  }

  createGain(): unknown {
    return { gain: fakeParam(), connect: (node: unknown) => node };
  }

  createBuffer(_channels: number, length: number): unknown {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }

  createBufferSource(): unknown {
    return {
      buffer: null, loop: false, loopStart: 0, loopEnd: 0,
      playbackRate: fakeParam(),
      connect: (node: unknown) => node,
      start: () => { this.started += 1; },
      stop: () => undefined,
    };
  }

  decodeAudioData(): Promise<unknown> {
    const data = new Float32Array(this.sampleRate).fill(0.1);
    return Promise.resolve({ numberOfChannels: 1, sampleRate: this.sampleRate, length: data.length, getChannelData: () => data });
  }

  addEventListener(_type: string, listener: () => void): void {
    this.listeners.push(listener);
  }

  private turn(state: string): Promise<void> {
    this.state = state;
    for (const listener of this.listeners) listener();
    return Promise.resolve();
  }

  resume(): Promise<void> {
    return this.turn("running");
  }

  suspend(): Promise<void> {
    return this.turn("suspended");
  }

  close(): Promise<void> {
    this.closed = true;
    return this.turn("closed");
  }
}

/** A stand-in audio element: it plays for CLIP_MS and then ends, and it knows whether its source was taken away. */
class FakeAudio {
  /** Every element that was asked to play, in order. The ones made only to fetch a clip ahead of time are not here. */
  static played: FakeAudio[] = [];
  volume = 1;
  playing = false;
  released = false;
  private src: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Map<string, () => void>();

  constructor(readonly url: string) {
    this.src = url;
  }

  play(): Promise<void> {
    FakeAudio.played.push(this);
    this.playing = true;
    this.timer = setTimeout(() => {
      this.playing = false;
      this.listeners.get("ended")?.();
    }, CLIP_MS);
    return Promise.resolve();
  }

  pause(): void {
    clearTimeout(this.timer);
    this.playing = false;
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }

  load(): void {
    if (this.src === "") this.released = true;
  }
}

const heard = (): string[] => FakeAudio.played.filter((audio) => audio.playing).map((audio) => audio.url);
const held = (): string[] => FakeAudio.played.filter((audio) => !audio.released).map((audio) => audio.url);
const startedClips = (word: string): number => FakeAudio.played.filter((audio) => audio.url.includes(word)).length;

/** The page's visibility, as the browser's `document` reports it. */
function fakeTab() {
  const listeners: (() => void)[] = [];
  const tab = {
    hidden: false,
    addEventListener: (type: string, listener: () => void): void => {
      if (type === "visibilitychange") listeners.push(listener);
    },
  };
  const show = (seen: boolean): void => {
    tab.hidden = !seen;
    for (const listener of listeners) listener();
  };
  return { tab, show };
}

/** Runs effects the way React does for one component: again when a dependency changed, with the old cleanup first. */
function hooks() {
  let slots: { deps: readonly unknown[]; cleanup: (() => void) | undefined }[] = [];
  let next = 0;
  const useEffect = (effect: () => (() => void) | undefined, deps: readonly unknown[]): void => {
    const slot = slots[next];
    if (!slot || deps.some((dep, index) => dep !== slot.deps[index])) {
      slot?.cleanup?.();
      slots[next] = { deps, cleanup: effect() };
    }
    next += 1;
  };
  const render = (component: () => void): void => {
    next = 0;
    component();
  };
  const unmount = (): void => {
    for (const slot of slots) slot.cleanup?.();
    slots = [];
  };
  return { useEffect, render, unmount };
}

function enemyCalled(id: string): EnemySpec {
  const found = ENEMIES.find((each) => each.id === id);
  if (!found) throw new Error(`no enemy ${id}`);
  return found;
}

/** Loads the audio modules afresh into a fake browser that serves the clip lists in public/audio. */
async function openGame() {
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const { tab, show } = fakeTab();
  const fightHooks = hooks();
  vi.stubGlobal("document", tab);
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("fetch", (url: string) => {
    if (!url.endsWith(".json")) return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    const file = `public${url}`;
    if (!existsSync(file)) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(readFileSync(file, "utf8")) as unknown) });
  });
  vi.doMock("react", async (original) => ({ ...(await original<typeof import("react")>()), useEffect: fightHooks.useEffect }));
  const sfx = await import("../src/audio/sfx");
  const music = await import("../src/audio/music");
  const voice = await import("../src/audio/voice");
  const story = await import("../src/audio/storyVoice");
  const { useStopAudio } = await import("../src/audio/useStopAudio");
  // App: menu music on every screen but the fight.
  music.startMusic("menu");
  await vi.advanceTimersByTimeAsync(500);

  let enemy = enemyCalled("circe");
  let over = false;
  let pausedByMenu = false;
  const draw = (): void => {
    fightHooks.render(() => { useStopAudio(enemy.id, pausedByMenu || over); });
  };

  /** FightScreen mounting, or its fight starting again with a new seed. */
  const startFight = (id: string): void => {
    enemy = enemyCalled(id);
    over = false;
    pausedByMenu = false;
    music.startMusic("fight");
    voice.speakLine("fight_start");
    draw();
  };

  return {
    show,
    voice,
    startFight,
    /** A click on a stop of the quest map: App asks for Homer's line before it, and the fight screen mounts. */
    enter(id: string): void {
      void story.speakNarration(id, "before");
      startFight(id);
    },
    /** React's dev build mounting the fight screen a second time: every cleanup runs, then every effect again. */
    mountAgain(): void {
      fightHooks.unmount();
      startFight(enemy.id);
    },
    /** The fight screen going, with nobody stopping the story first. */
    unmount(): void {
      fightHooks.unmount();
    },
    /** One frame of FightScreen's loop with these events. */
    frame(events: readonly CombatEvent[]): void {
      for (const event of events) {
        sfx.playEvent(event);
        if (event.type === "won") music.startMusic("win");
        if (event.type === "lost") music.startMusic("loss");
        if (event.type === "phaseChanged" && event.index > 0) void story.speakMonsterTaunt(enemy.id);
      }
      voice.playVoice(events);
      if (events.some((event) => event.type === "won" || event.type === "lost")) {
        over = true;
        // EndScreen mounts inside the fight and asks for Homer's line; its effect runs before the fight's own.
        void story.speakResult(enemy.id, events.some((event) => event.type === "won"));
        draw();
      }
    },
    /** The pause menu opening or closing. */
    pause(on: boolean): void {
      pausedByMenu = on;
      if (on) music.pauseMusic();
      else music.resumeMusic();
      draw();
    },
    /** The same fight starting over, from the pause menu or the result: FightScreen's main effect runs again. */
    restart(): void {
      story.stopStory();
      if (pausedByMenu) music.resumeMusic();
      startFight(enemy.id);
    },
    /** Leaving the fight for the quest map: EndScreen and FightScreen unmount, then App asks for the menu music. */
    leave(): void {
      story.stopStory();
      if (pausedByMenu) music.resumeMusic();
      fightHooks.unmount();
      music.startMusic("menu");
    },
  };
}

type Game = Awaited<ReturnType<typeof openGame>>;

/** A short fight against this enemy up to its result, with a pause in the middle. */
async function playFight(game: Game, id: string, won: boolean): Promise<void> {
  const enemy = enemyCalled(id);
  const [attack] = enemy.attacks;
  const [weakSpot] = enemy.weakSpots;
  if (!attack || !weakSpot) throw new Error(`${id} has no attack or weak spot`);
  game.startFight(id);
  await vi.advanceTimersByTimeAsync(400);
  game.frame([{ type: "telegraph", attack }]);
  await vi.advanceTimersByTimeAsync(300);
  game.frame([{ type: "defended", attack }, { type: "opening", weakSpot, move: "cross" }]);
  await vi.advanceTimersByTimeAsync(300);
  game.frame([{ type: "enemyHit", move: "cross", damage: 12, quality: 1 }]);
  game.frame([{ type: "phaseChanged", index: 1, name: enemy.phases[1]?.name ?? "Second" }]);
  await vi.advanceTimersByTimeAsync(200);
  game.pause(true);
  await vi.advanceTimersByTimeAsync(500);
  game.pause(false);
  game.frame([{ type: "telegraph", attack }]);
  await vi.advanceTimersByTimeAsync(200);
  game.frame([{ type: "playerHit", attack, damage: attack.damage }, { type: "whiffed" }]);
  await vi.advanceTimersByTimeAsync(200);
  game.frame([{ type: "finished", move: "cross" }, { type: won ? "won" : "lost" }]);
  await vi.advanceTimersByTimeAsync(300);
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeContext.made = [];
  FakeAudio.played = [];
});

afterEach(() => {
  vi.doUnmock("react");
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("ten fights, with restarts and map visits between them, are all played through one audio context", async () => {
  const game = await openGame();
  const stops = ["polyphemus", "circe", "sirens", "scylla", "charybdis", "suitors"];
  for (let fight = 0; fight < FIGHTS; fight++) {
    await playFight(game, stops[fight % stops.length] ?? "circe", fight % 3 !== 0);
    if (fight % 2 === 0) {
      // "Fight again" on the result, then that fight is left half way.
      game.restart();
      await vi.advanceTimersByTimeAsync(600);
    }
    game.leave();
    // The quest map and the next stop's intro.
    await vi.advanceTimersByTimeAsync(2500);
  }
  expect(FakeContext.made).toHaveLength(1);
  const [context] = FakeContext.made;
  expect(context?.closed).toBe(false);
  // The effects, the music and the stops' ambience really did play through it: far more sounds than fights.
  expect(context?.started).toBeGreaterThan(FIGHTS * 5);
  // And the voices spoke in every fight.
  expect(startedClips("fight_start")).toBeGreaterThanOrEqual(FIGHTS);
});

test("once a fight is left, none of its voice clips is playing and every audio element it used is let go", async () => {
  const game = await openGame();
  for (const won of [true, false]) {
    await playFight(game, "circe", won);
    // The result line is being spoken when the player leaves.
    expect(heard()).toEqual([won ? "/audio/athena/win.mp3" : "/audio/athena/loss.mp3"]);
    game.leave();
    expect(heard()).toEqual([]);
    expect(held()).toEqual([]);
    await vi.advanceTimersByTimeAsync(8000);
    // Nothing that was waiting (Homer's line behind Athena's) starts on the next screen either.
    expect(heard()).toEqual([]);
    expect(held()).toEqual([]);
  }
  expect(FakeAudio.played.length).toBeGreaterThan(6);
});

test("a clip that plays to its end is let go at once, without waiting for the fight to end", async () => {
  const game = await openGame();
  game.startFight("circe");
  expect(heard()).toEqual(["/audio/athena/fight_start.mp3"]);
  expect(held()).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(CLIP_MS + 10);
  expect(heard()).toEqual([]);
  expect(held()).toEqual([]);
});

test("pausing cuts the line being spoken and drops a taunt that was about to start; nothing starts while paused", async () => {
  const game = await openGame();
  const circe = enemyCalled("circe");
  const [attack] = circe.attacks;
  if (!attack) throw new Error("circe has no attack");
  game.startFight("circe");
  await vi.advanceTimersByTimeAsync(CLIP_MS + 100);
  // A phase change asks for a taunt, which waits a tick for Athena; the call is being spoken. Then the player pauses.
  game.frame([{ type: "phaseChanged", index: 1, name: circe.phases[1]?.name ?? "Second" }, { type: "telegraph", attack }]);
  expect(heard()).toHaveLength(1);
  game.pause(true);
  expect(heard()).toEqual([]);
  expect(held()).toEqual([]);
  await vi.advanceTimersByTimeAsync(6000);
  expect(heard()).toEqual([]);
  expect(startedClips("/taunts/")).toBe(0);

  // After the pause the monster can taunt again.
  game.pause(false);
  game.frame([{ type: "phaseChanged", index: 2, name: circe.phases[2]?.name ?? "Third" }]);
  await vi.advanceTimersByTimeAsync(4500);
  expect(startedClips("/taunts/")).toBe(1);
});

test("the end of a fight counts as paused, and the result line and Homer's line are still heard", async () => {
  const game = await openGame();
  await playFight(game, "circe", true);
  expect(heard()).toEqual(["/audio/athena/win.mp3"]);
  await vi.advanceTimersByTimeAsync(CLIP_MS);
  expect(heard()).toEqual(["/audio/narration/homer_after_circe.mp3"]);
  await vi.advanceTimersByTimeAsync(CLIP_MS + 200);
  expect(heard()).toEqual([]);
  expect(held()).toEqual([]);
});

test("hiding the tab stops the one context and the voices, nothing starts while it is hidden, and showing it carries on", async () => {
  const game = await openGame();
  const circe = enemyCalled("circe");
  const [attack] = circe.attacks;
  if (!attack) throw new Error("circe has no attack");
  game.startFight("circe");
  await vi.advanceTimersByTimeAsync(CLIP_MS + 100);
  game.frame([{ type: "telegraph", attack }]);
  const [context] = FakeContext.made;
  if (!context) throw new Error("no context was made");
  expect(context.state).toBe("running");
  expect(heard()).toHaveLength(1);

  game.show(false);
  expect(context.state).toBe("suspended");
  expect(heard()).toEqual([]);
  expect(held()).toEqual([]);

  // Whatever the game asks for while hidden stays silent and does not wake the context.
  const before = { started: context.started, clips: FakeAudio.played.length };
  game.frame([{ type: "enemyHit", move: "cross", damage: 12, quality: 1 }, { type: "won" }]);
  expect(game.voice.speakLine("fight_start")).toBe(false);
  await vi.advanceTimersByTimeAsync(8000);
  expect(context.state).toBe("suspended");
  expect(context.started).toBe(before.started);
  expect(FakeAudio.played).toHaveLength(before.clips);

  // Shown again: the same context runs, and the music that was asked for meanwhile starts.
  game.show(true);
  await vi.advanceTimersByTimeAsync(100);
  expect(context.state).toBe("running");
  expect(context.started).toBeGreaterThan(before.started);
  expect(FakeContext.made).toHaveLength(1);
});

// Homer's line before a stop plays as its fight opens. In these the fight screen's own cleanup does not stop the story:
// that is the change asked of FightScreen, without which the dev build cuts him 10 ms in.
const BEFORE_CIRCE = "/audio/narration/homer_before_circe.mp3";

test("the dev build mounts the fight twice and Homer's line before the stop plays through it, under the fight start and a call", async () => {
  const game = await openGame();
  const circe = enemyCalled("circe");
  const [attack] = circe.attacks;
  if (!attack) throw new Error("circe has no attack");
  game.enter("circe");
  expect(heard()).toEqual([BEFORE_CIRCE]);
  game.mountAgain();
  expect(heard()).toEqual([BEFORE_CIRCE]);
  await vi.advanceTimersByTimeAsync(CLIP_MS - 500);
  game.frame([{ type: "telegraph", attack }]);
  expect(heard()).toEqual([BEFORE_CIRCE]);
  // He ends on his own, nothing follows him, and the next call is spoken.
  await vi.advanceTimersByTimeAsync(600);
  expect(heard()).toEqual([]);
  expect(held()).toEqual([]);
  expect(startedClips("fight_start") + startedClips("call_")).toBe(0);
  game.frame([{ type: "telegraph", attack }]);
  expect(heard()).toHaveLength(1);
  expect(startedClips("call_")).toBe(1);
});

test("leaving the fight stops Homer's before-line: at once through App, and a tick later by any other door", async () => {
  const game = await openGame();
  game.enter("circe");
  game.mountAgain();
  await vi.advanceTimersByTimeAsync(300);
  // Quit to map: App stops the story, the fight screen unmounts.
  game.leave();
  expect(heard()).toEqual([]);
  expect(held()).toEqual([]);

  game.enter("circe");
  game.mountAgain();
  await vi.advanceTimersByTimeAsync(300);
  expect(heard()).toEqual([BEFORE_CIRCE]);
  game.unmount();
  await vi.advanceTimersByTimeAsync(0);
  expect(heard()).toEqual([]);
  expect(held()).toEqual([]);
  await vi.advanceTimersByTimeAsync(8000);
  expect(heard()).toEqual([]);
  expect(startedClips("homer_before_circe")).toBe(2);
});

test("a pause does not cut Homer's before-line, and a restart from the pause menu keeps it", async () => {
  const game = await openGame();
  game.enter("circe");
  game.mountAgain();
  await vi.advanceTimersByTimeAsync(300);
  game.pause(true);
  expect(heard()).toEqual([BEFORE_CIRCE]);
  game.pause(false);
  game.mountAgain();
  await vi.advanceTimersByTimeAsync(300);
  expect(heard()).toEqual([BEFORE_CIRCE]);
  expect(startedClips("homer_before_circe")).toBe(1);
  expect(startedClips("fight_start")).toBe(0);
});
