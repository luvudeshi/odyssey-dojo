// The game's sound as one stream for a call (src/audio/soundOut.ts): nothing is made or connected until the stream is
// asked for, every sound path is on it once it is, the player's own sound is not touched, and stopping takes it all off.
// The browser is a stand-in that keeps every connection made in the audio graph: nothing here is heard. Every module
// under src/audio is the real one, and the clip lists are the ones in public/audio.
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CombatEvent, EnemySpec } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";

/** How long every stand-in spoken clip runs. */
const CLIP_MS = 1500;

const fakeParam = () => ({
  value: 1,
  setValueAtTime: () => undefined,
  linearRampToValueAtTime: () => undefined,
  cancelScheduledValues: () => undefined,
  setTargetAtTime: () => undefined,
});

class FakeTrack {
  readyState = "live";
  stop(): void {
    this.readyState = "ended";
  }
}

/** A MediaStream: the one a stream node gives, or the copy of what an audio element plays. */
class FakeStream {
  private readonly listeners = new Map<string, Set<() => void>>();
  constructor(readonly tracks: FakeTrack[] = []) {}
  getAudioTracks(): FakeTrack[] {
    return [...this.tracks];
  }
  getTracks(): FakeTrack[] {
    return [...this.tracks];
  }
  addEventListener(type: string, listener: () => void): void {
    const known = this.listeners.get(type) ?? new Set();
    known.add(listener);
    this.listeners.set(type, known);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  /** The browser adding the track once the clip's file has been read. `quietly` is a browser that sends no event for it. */
  add(track: FakeTrack, quietly = false): void {
    this.tracks.push(track);
    if (!quietly) for (const listener of [...(this.listeners.get("addtrack") ?? [])]) listener();
  }
  listening(): number {
    return [...this.listeners.values()].reduce((sum, each) => sum + each.size, 0);
  }
}

type Kind = "speakers" | "gain" | "source" | "streamOut" | "streamIn" | "limit";

/** Any node of the audio graph. It tells its context about every connection. */
class FakeNode {
  readonly gain = fakeParam();
  readonly playbackRate = fakeParam();
  /** A compressor's settings. */
  readonly threshold = fakeParam();
  readonly knee = fakeParam();
  readonly ratio = fakeParam();
  readonly attack = fakeParam();
  readonly release = fakeParam();
  buffer: { readonly url: string } | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  /** A stream node's stream. */
  stream: FakeStream | null = null;
  constructor(readonly kind: Kind, readonly context: FakeContext, readonly serial: number) {}
  connect(to: FakeNode): FakeNode {
    this.context.edges.push([this, to]);
    this.context.connected.push([this, to]);
    return to;
  }
  disconnect(to?: FakeNode): void {
    const mine = (edge: readonly [FakeNode, FakeNode]): boolean => edge[0] === this && (to === undefined || edge[1] === to);
    if (to !== undefined && !this.context.edges.some(mine)) throw new Error("not connected");
    this.context.edges = this.context.edges.filter((edge) => !mine(edge));
  }
  start(): void {
    this.context.started.push(this);
  }
  stop(): void {
    // Nothing here needs a sound to stop.
  }
}

/** Just enough of an AudioContext for every sound path, with the connections kept. */
class FakeContext {
  static made: FakeContext[] = [];
  readonly sampleRate = 1000;
  readonly currentTime = 0;
  state = "running";
  private serial = 0;
  /** The connections that stand now, and every one that was ever made. */
  edges: (readonly [FakeNode, FakeNode])[] = [];
  readonly connected: (readonly [FakeNode, FakeNode])[] = [];
  readonly started: FakeNode[] = [];
  readonly streamOutputs: FakeNode[] = [];
  readonly streamSources: FakeNode[] = [];
  readonly destination = this.node("speakers");

  constructor() {
    FakeContext.made.push(this);
  }
  protected node(kind: Kind): FakeNode {
    this.serial += 1;
    return new FakeNode(kind, this, this.serial);
  }
  createGain(): FakeNode {
    return this.node("gain");
  }
  createBufferSource(): FakeNode {
    return this.node("source");
  }
  createBuffer(_channels: number, length: number): unknown {
    const data = new Float32Array(length);
    return { url: "synthesised", length, getChannelData: () => data };
  }
  createMediaStreamDestination(): FakeNode {
    const node = this.node("streamOut");
    node.stream = new FakeStream([new FakeTrack()]);
    this.streamOutputs.push(node);
    return node;
  }
  createMediaStreamSource(stream: FakeStream): FakeNode {
    // The browser refuses a stream with no audio track.
    if (stream.getAudioTracks().length === 0) throw new Error("no audio track");
    const node = this.node("streamIn");
    node.stream = stream;
    this.streamSources.push(node);
    return node;
  }
  decodeAudioData(bytes: ArrayBuffer): Promise<unknown> {
    const data = new Float32Array(this.sampleRate).fill(0.25);
    return Promise.resolve({ url: fileNames.get(bytes) ?? "?", numberOfChannels: 1, sampleRate: this.sampleRate, duration: 1, length: data.length, getChannelData: () => data });
  }
  addEventListener(): void {
    // The music and the stop sounds listen for state changes; nothing here changes state by itself.
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    return Promise.resolve();
  }
}

/** A browser with a compressor, as every browser with Web Audio has: the stream gets its ceiling. */
class CeilingContext extends FakeContext {
  readonly limits: FakeNode[] = [];
  createDynamicsCompressor(): FakeNode {
    const node = this.node("limit");
    this.limits.push(node);
    return node;
  }
}

/** The file each fetched clip's bytes came from. */
const fileNames = new Map<ArrayBuffer, string>();

/** How the stand-in browser copies what an audio element plays. */
let copying: "yes" | "no" | "no event" = "yes";

/** A stand-in audio element: it plays for CLIP_MS and then ends. In Chrome and Edge it can give a copy of its sound. */
class FakeAudio {
  static made: FakeAudio[] = [];
  /** Every element that was asked to play, in order. */
  static played: FakeAudio[] = [];
  volume = 1;
  muted = false;
  playing = false;
  plays = 0;
  released = false;
  /** Every copy of this element's sound that was asked for. */
  readonly copies: FakeStream[] = [];
  captureStream?: () => FakeStream;
  private src: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(readonly url: string) {
    this.src = url;
    FakeAudio.made.push(this);
    if (copying !== "no") {
      this.captureStream = () => {
        // A clip that is already playing has its track at once.
        const copy = new FakeStream(this.playing ? [new FakeTrack()] : []);
        this.copies.push(copy);
        return copy;
      };
    }
  }
  emit(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
  play(): Promise<void> {
    this.plays += 1;
    FakeAudio.played.push(this);
    this.playing = true;
    for (const copy of this.copies) if (copy.getAudioTracks().length === 0) copy.add(new FakeTrack(), copying === "no event");
    this.emit("playing");
    this.timer = setTimeout(() => {
      this.playing = false;
      this.emit("ended");
    }, CLIP_MS);
    return Promise.resolve();
  }
  pause(): void {
    clearTimeout(this.timer);
    const was = this.playing;
    this.playing = false;
    if (was) this.emit("pause");
  }
  addEventListener(type: string, listener: () => void): void {
    const known = this.listeners.get(type) ?? new Set();
    known.add(listener);
    this.listeners.set(type, known);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  /** How many listeners of these kinds are still on the element. */
  listening(...types: string[]): number {
    return types.reduce((sum, type) => sum + (this.listeners.get(type)?.size ?? 0), 0);
  }
  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }
  load(): void {
    if (this.src === "") this.released = true;
  }
}

function enemyCalled(id: string): EnemySpec {
  const found = ENEMIES.find((each) => each.id === id);
  if (!found) throw new Error(`no enemy ${id}`);
  return found;
}

const settle = (ms = 50): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);

/** Loads the audio modules afresh into a fake browser that serves the clip lists in public/audio. With null the browser has no Web Audio. */
async function openGame(contextClass: typeof FakeContext | null = FakeContext) {
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  // The same dice every time, so two games play the same sounds.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.stubGlobal("document", { hidden: false, addEventListener: () => undefined });
  vi.stubGlobal("AudioContext", contextClass ?? undefined);
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("fetch", (url: string) => {
    if (url === "/api/speech") return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(["line"])) });
    if (!url.endsWith(".json")) {
      const bytes = new ArrayBuffer(8);
      fileNames.set(bytes, url);
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(bytes) });
    }
    const file = `public${url}`;
    if (!existsSync(file)) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(readFileSync(file, "utf8")) as unknown) });
  });
  const sfx = await import("../src/audio/sfx");
  const music = await import("../src/audio/music");
  const voice = await import("../src/audio/voice");
  const story = await import("../src/audio/storyVoice");
  const narration = await import("../src/audio/narration");
  const stops = await import("../src/audio/stopAudio");
  const power = await import("../src/audio/powerSound");
  const tap = await import("../src/audio/soundTap");
  const out = await import("../src/audio/soundOut");
  const circe = enemyCalled("circe");
  const wand = circe.attacks.find((attack) => attack.id === "wand_left");
  const [weakSpot] = circe.weakSpots;
  if (!wand || !weakSpot) throw new Error("circe has no wand or weak spot");

  /** The fight screen mounting on Circe's stop with Zeus as the god: music, her ambience, her own event sounds, his power. */
  const enter = async (): Promise<void> => {
    music.startMusic("fight");
    stops.startStopAmbience("circe");
    sfx.setEventOverride((event) => stops.playStopEvent("circe", event));
    power.holdPowerSound("zeus");
    await settle();
  };
  /** One frame of the fight with these events. */
  const frame = (events: readonly CombatEvent[]): void => {
    for (const event of events) sfx.playEvent(event);
    voice.playVoice(events);
  };
  /** A stretch of fight that uses every sound path. The spoken lines are left to run out. */
  const fight = async (): Promise<void> => {
    voice.speakLine("fight_start");
    await settle(CLIP_MS + 100);
    frame([{ type: "telegraph", attack: wand }]);
    await settle(CLIP_MS + 100);
    frame([{ type: "defended", attack: wand }, { type: "opening", weakSpot, move: "cross" }]);
    await settle(CLIP_MS + 100);
    frame([{ type: "enemyHit", move: "cross", damage: 12, quality: 1 }]);
    frame([{ type: "phaseChanged", index: 1, name: circe.phases?.[1]?.name ?? "Second" }]);
    void story.speakMonsterTaunt("circe");
    await settle(2 * CLIP_MS + 300);
    frame([{ type: "powerUnleashed", damage: 36 }, { type: "whiffed" }]);
    void narration.speakLine("homer", "Sing, Muse.");
    await settle(CLIP_MS + 100);
  };
  const context = (): FakeContext => {
    const [made] = FakeContext.made;
    if (!made) throw new Error("no audio context was made");
    return made;
  };
  return { sfx, music, voice, story, narration, stops, power, tap, out, enter, frame, fight, context, wand, weakSpot, circe };
}

/** True when sound leaving `from` gets to `to` along the connections that stand now. */
function reaches(context: FakeContext, from: FakeNode, to: FakeNode): boolean {
  const seen = new Set<FakeNode>([from]);
  const queue = [from];
  for (let node = queue.shift(); node; node = queue.shift()) {
    if (node === to) return true;
    for (const [source, target] of context.edges) {
      if (source === node && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return false;
}

/** The sounds started from this file, newest last. */
const startedFrom = (context: FakeContext, file: string): FakeNode[] => context.started.filter((source) => source.buffer?.url === file);

function latest(context: FakeContext, file: string): FakeNode {
  const source = startedFrom(context, file).at(-1);
  if (!source) throw new Error(`nothing was started from ${file}`);
  return source;
}

/** The stream node the game made, the first unless another is asked for. */
function streamNode(context: FakeContext, index = 0): FakeNode {
  const node = context.streamOutputs[index];
  if (!node) throw new Error("no stream node was made");
  return node;
}

/** The copy of a spoken clip that was put on the stream first. */
function firstCopy(context: FakeContext): FakeNode {
  const [copy] = context.streamSources;
  if (!copy) throw new Error("no spoken clip was copied");
  return copy;
}

/** The audio element that was asked to play last. */
function lastPlayed(): FakeAudio {
  const audio = FakeAudio.played.at(-1);
  if (!audio) throw new Error("no line was spoken");
  return audio;
}

/** The stream node's part of the graph: the node itself, its ceiling, each copy of a spoken clip and the gain that copy goes through. */
function streamSide(context: FakeContext): Set<FakeNode> {
  const side = new Set<FakeNode>([...context.streamOutputs, ...context.streamSources]);
  // The ceiling and its trim are the stream's too.
  for (const [from, to] of context.connected) {
    if (from.kind === "limit") side.add(from).add(to);
    if (from.kind === "streamIn") side.add(to);
  }
  return side;
}

/** Every connection ever made between the game's own nodes, in order. A node is named by its kind and the order it was made in, leaving the stream's side out. */
function gameGraph(context: FakeContext): string[] {
  const side = streamSide(context);
  const names = new Map<FakeNode, string>();
  const order = [...new Set(context.connected.flat())].filter((node) => !side.has(node)).sort((a, b) => a.serial - b.serial);
  for (const [index, node] of order.entries()) names.set(node, node.kind === "speakers" ? "speakers" : `${node.kind} ${String(index)}${node.buffer ? ` ${node.buffer.url}` : ""}`);
  return context.connected.filter(([from, to]) => !side.has(from) && !side.has(to)).map(([from, to]) => `${names.get(from) ?? "?"} -> ${names.get(to) ?? "?"}`);
}

/** One file from each sound path that plays through the audio graph, and where it ends. */
const PATHS: readonly (readonly [path: string, file: string])[] = [
  ["an effect, through the effects' master", "/audio/sfx/opening.mp3"],
  ["a defend cue, straight to the speakers", "/audio/sfx/defendDodge.mp3"],
  ["the phase horn, straight to the speakers", "/audio/sfx/phaseSting.mp3"],
  ["the phase drum, straight to the speakers", "/audio/sfx/phaseChanged.mp3"],
  ["a stop's event sound, through its event bus", "/audio/stops/circe/wand.mp3"],
  ["a stop's ambience, through its ambience bus", "/audio/stops/circe/ambience.mp3"],
  ["a god's power, straight to the speakers", "/audio/power/zeus.mp3"],
];

beforeEach(() => {
  vi.useFakeTimers();
  FakeContext.made = [];
  FakeAudio.made = [];
  FakeAudio.played = [];
  fileNames.clear();
  copying = "yes";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a game that never asks for the stream", () => {
  test("loading the modules makes no audio context and no stream", async () => {
    await openGame();
    await settle();
    expect(FakeContext.made).toHaveLength(0);
  });

  test("a whole fight makes no stream node, copies no spoken clip and connects nothing but the game's own nodes", async () => {
    const game = await openGame();
    await game.enter();
    await game.fight();
    const context = game.context();
    expect(FakeContext.made).toHaveLength(1);
    expect(context.streamOutputs).toHaveLength(0);
    expect(context.streamSources).toHaveLength(0);
    expect(FakeAudio.played.length).toBeGreaterThan(3);
    expect(FakeAudio.made.flatMap((audio) => audio.copies)).toHaveLength(0);
    expect(FakeAudio.made.map((audio) => audio.listening("playing", "volumechange"))).toEqual(FakeAudio.made.map(() => 0));
    // Every path played, and each still ends at the speakers.
    for (const [, file] of PATHS) expect(reaches(context, latest(context, file), context.destination)).toBe(true);
    expect(reaches(context, latest(context, "/audio/music/fight.mp3"), context.destination)).toBe(true);
    // Nothing was ever taken apart.
    expect(context.edges).toEqual(context.connected);
  });

  test("the stream adds connections and changes none: the game's own graph is the same with it and without it", async () => {
    const plain = await openGame();
    await plain.enter();
    await plain.fight();
    const without = gameGraph(plain.context());

    FakeContext.made = [];
    const called = await openGame();
    expect(called.out.gameSoundStream()).not.toBeNull();
    await called.enter();
    await called.fight();
    const context = called.context();
    expect(context.streamOutputs).toHaveLength(1);
    expect(gameGraph(context)).toEqual(without);
    // And none of the game's own connections was taken away while the stream was live.
    const side = streamSide(context);
    expect(context.edges.filter(([from, to]) => !side.has(from) && !side.has(to))).toEqual(context.connected.filter(([from, to]) => !side.has(from) && !side.has(to)));
  });
});

describe("the stream, once asked for", () => {
  test("it is one stream with one live audio track, and asking again gives the same one", async () => {
    const game = await openGame();
    await game.enter();
    const stream = game.out.gameSoundStream() as unknown as FakeStream;
    expect(stream.getAudioTracks().map((track) => track.readyState)).toEqual(["live"]);
    expect(game.out.gameSoundStream()).toBe(stream);
    expect(game.out.gameSoundStream()).toBe(stream);
    expect(game.context().streamOutputs).toHaveLength(1);
    expect(game.context().streamOutputs[0]?.stream).toBe(stream);
    // Still the one audio context the whole game plays through.
    expect(FakeContext.made).toHaveLength(1);
  });

  test("asked for before anything has sounded, it makes the game's one audio context and later sounds are on it", async () => {
    const game = await openGame();
    expect(game.out.gameSoundStream()).not.toBeNull();
    expect(FakeContext.made).toHaveLength(1);
    await game.enter();
    await game.fight();
    const context = game.context();
    const output = streamNode(context);
    expect(FakeContext.made).toHaveLength(1);
    expect(reaches(context, latest(context, "/audio/sfx/opening.mp3"), output)).toBe(true);
  });

  test.each(PATHS)("%s, started after the stream was asked for, reaches the stream and the speakers", async (_path, file) => {
    const game = await openGame();
    await game.enter();
    game.out.gameSoundStream();
    const context = game.context();
    const before = startedFrom(context, file).length;
    // The ambience started with the fight; leaving and coming back starts it again.
    game.stops.stopStopAmbience();
    game.stops.startStopAmbience("circe");
    await game.fight();
    const output = streamNode(context);
    expect(startedFrom(context, file).length).toBeGreaterThan(before);
    const source = latest(context, file);
    expect(reaches(context, source, output)).toBe(true);
    expect(reaches(context, source, context.destination)).toBe(true);
  });

  test("the buses that were made before the stream was asked for join it: an effect and a stop's ambience already playing are on it", async () => {
    const game = await openGame();
    await game.enter();
    game.frame([{ type: "opening", weakSpot: game.weakSpot, move: "cross" }]);
    const context = game.context();
    const effect = latest(context, "/audio/sfx/opening.mp3");
    const ambience = latest(context, "/audio/stops/circe/ambience.mp3");
    expect(context.streamOutputs).toHaveLength(0);
    game.out.gameSoundStream();
    const output = streamNode(context);
    expect(reaches(context, effect, output)).toBe(true);
    expect(reaches(context, ambience, output)).toBe(true);
    expect(reaches(context, effect, context.destination)).toBe(true);
    expect(reaches(context, ambience, context.destination)).toBe(true);
  });

  test("a bus that says where it ends is on the stream, whether it says so before or after the stream is asked for (the line asked of music.ts)", async () => {
    const game = await openGame();
    await game.enter();
    const context = game.context();
    const early = context.createGain();
    early.connect(context.destination);
    game.tap.tapSound(early as unknown as AudioNode);
    game.out.gameSoundStream();
    const late = context.createGain();
    late.connect(context.destination);
    game.tap.tapSound(late as unknown as AudioNode);
    const output = streamNode(context);
    for (const bus of [early, late]) {
      expect(reaches(context, bus, output)).toBe(true);
      expect(reaches(context, bus, context.destination)).toBe(true);
    }
    game.out.stopGameSoundStream();
    for (const bus of [early, late]) {
      expect(reaches(context, bus, output)).toBe(false);
      expect(reaches(context, bus, context.destination)).toBe(true);
    }
  });
});

describe("the spoken clips on the stream", () => {
  test("a line that is already being spoken when the stream is asked for is copied onto it, at its own volume, and plays on", async () => {
    const game = await openGame();
    await game.enter();
    game.voice.speakLine("fight_start");
    const line = lastPlayed();
    expect(line.copies).toHaveLength(0);
    game.out.gameSoundStream();
    const context = game.context();
    const output = streamNode(context);
    expect(line.copies).toHaveLength(1);
    expect(context.streamSources.map((source) => source.stream)).toEqual(line.copies);
    const copy = firstCopy(context);
    expect(reaches(context, copy, output)).toBe(true);
    // The copy goes nowhere near the speakers, so the line is not heard twice.
    expect(reaches(context, copy, context.destination)).toBe(false);
    // The element was not touched: it plays on, once, as loud as it was.
    expect(line).toMatchObject({ playing: true, plays: 1, volume: 1, muted: false, released: false });
  });

  test("lines that start after the stream was asked for are copied onto it: Athena, a monster's taunt at its lower level, and a line written at run time", async () => {
    const game = await openGame();
    await game.enter();
    game.out.gameSoundStream();
    const context = game.context();
    const output = streamNode(context);
    const levelOf = (audio: FakeAudio): number | undefined => {
      const copy = context.streamSources.find((source) => source.stream === audio.copies[0]);
      return context.edges.find(([from]) => from === copy)?.[1].gain.value;
    };

    game.voice.speakLine("fight_start");
    const athena = lastPlayed();
    expect(athena.url).toBe("/audio/athena/fight_start.mp3");
    expect(levelOf(athena)).toBe(1);

    expect(game.voice.speakTaunt("circe")).toBe(true);
    const taunt = lastPlayed();
    expect(taunt.url).toContain("/audio/taunts/");
    expect(taunt.volume).toBeCloseTo(game.voice.TAUNT_VOLUME);
    expect(levelOf(taunt)).toBeCloseTo(game.voice.TAUNT_VOLUME);

    void game.narration.speakLine("homer", "Sing, Muse.");
    await settle();
    const written = lastPlayed();
    expect(written.url.startsWith("blob:")).toBe(true);
    expect(levelOf(written)).toBe(1);

    for (const audio of [athena, taunt, written]) {
      expect(audio.plays).toBe(1);
      expect(audio.copies).toHaveLength(1);
    }
    for (const copy of context.streamSources) {
      expect(reaches(context, copy, output)).toBe(true);
      expect(reaches(context, copy, context.destination)).toBe(false);
    }
  });

  test("the voice setting is what the copy is levelled by, and a change of the element's volume is followed", async () => {
    const game = await openGame();
    const settings = await import("../src/settings/store");
    settings.setSettings({ voiceVolume: 0.4 });
    await game.enter();
    game.out.gameSoundStream();
    game.voice.speakLine("fight_start");
    const context = game.context();
    const line = lastPlayed();
    const level = context.edges.find(([from]) => from === context.streamSources[0])?.[1];
    expect(level?.gain.value).toBeCloseTo(0.4);
    line.volume = 0.1;
    line.emit("volumechange");
    expect(level?.gain.value).toBeCloseTo(0.1);
    line.muted = true;
    line.emit("volumechange");
    expect(level?.gain.value).toBe(0);
  });

  test("a line that has ended or was cut off is taken off the stream and is no longer listened to", async () => {
    const game = await openGame();
    await game.enter();
    game.out.gameSoundStream();
    const context = game.context();
    game.voice.speakLine("fight_start");
    const first = lastPlayed();
    expect(context.edges.some(([from]) => from.kind === "streamIn")).toBe(true);
    await settle(CLIP_MS + 100);
    expect(first.released).toBe(true);
    expect(context.edges.some(([from]) => from.kind === "streamIn")).toBe(false);
    expect(first.listening("playing", "volumechange")).toBe(0);
    expect(first.copies[0]?.listening()).toBe(0);

    // Cut off by a newer line: the old one leaves, the new one is on.
    game.frame([{ type: "telegraph", attack: game.wand }]);
    const call = lastPlayed();
    game.frame([{ type: "phaseChanged", index: 1, name: game.circe.phases?.[1]?.name ?? "Second" }]);
    const phase = lastPlayed();
    expect(phase).not.toBe(call);
    expect(call.released).toBe(true);
    expect(call.listening("playing", "volumechange")).toBe(0);
    const live = context.edges.filter(([from]) => from.kind === "streamIn").map(([from]) => from.stream);
    expect(live).toEqual(phase.copies);
  });

  test("a copy whose track comes without an event is picked up when the clip starts sounding", async () => {
    copying = "no event";
    const game = await openGame();
    await game.enter();
    game.out.gameSoundStream();
    game.voice.speakLine("fight_start");
    const context = game.context();
    expect(context.streamSources).toHaveLength(1);
    expect(reaches(context, firstCopy(context), streamNode(context))).toBe(true);
  });

  test("a browser that cannot copy an element's sound leaves the voices alone: they play as ever, and the rest is still on the stream", async () => {
    copying = "no";
    const game = await openGame();
    await game.enter();
    expect(game.out.gameSoundStream()).not.toBeNull();
    await game.fight();
    const context = game.context();
    expect(context.streamSources).toHaveLength(0);
    expect(FakeAudio.played.length).toBeGreaterThan(3);
    expect(FakeAudio.played.every((audio) => audio.plays === 1 && audio.listening("playing", "volumechange") === 0)).toBe(true);
    expect(reaches(context, latest(context, "/audio/sfx/opening.mp3"), streamNode(context))).toBe(true);
  });

  test("no spoken clip is left on the books once it is over, with the stream or without", async () => {
    const game = await openGame();
    await game.enter();
    await game.fight();
    game.out.gameSoundStream();
    // Nothing of the fight before is copied now: every one of its lines was let go of.
    expect(FakeAudio.made.flatMap((audio) => audio.copies)).toHaveLength(0);
    await game.fight();
    await settle(3 * CLIP_MS);
    expect(game.context().edges.some(([from]) => from.kind === "streamIn")).toBe(false);
    expect(FakeAudio.played.every((audio) => audio.plays === 1)).toBe(true);
  });
});

describe("stopping the stream", () => {
  test("its track ends, every path is taken off it, and the speakers keep all of them", async () => {
    const game = await openGame();
    await game.enter();
    const stream = game.out.gameSoundStream() as unknown as FakeStream;
    game.voice.speakLine("fight_start");
    const line = lastPlayed();
    const context = game.context();
    const output = streamNode(context);
    const ambience = latest(context, "/audio/stops/circe/ambience.mp3");
    expect(reaches(context, ambience, output)).toBe(true);

    game.out.stopGameSoundStream();
    expect(stream.getAudioTracks().map((track) => track.readyState)).toEqual(["ended"]);
    expect(context.edges.filter(([, to]) => to === output)).toEqual([]);
    expect(context.edges.some(([from]) => from.kind === "streamIn")).toBe(false);
    expect(reaches(context, ambience, context.destination)).toBe(true);
    // The line that was being copied plays on.
    expect(line).toMatchObject({ playing: true, plays: 1, volume: 1, released: false });
    expect(line.listening("playing", "volumechange")).toBe(0);
  });

  test("sounds and lines that start afterwards go to the speakers only, and nothing more is made for a stream", async () => {
    const game = await openGame();
    await game.enter();
    game.out.gameSoundStream();
    game.out.stopGameSoundStream();
    const context = game.context();
    const played = FakeAudio.played.length;
    await game.fight();
    const output = streamNode(context);
    expect(context.streamOutputs).toHaveLength(1);
    expect(context.streamSources).toHaveLength(0);
    expect(FakeAudio.played.slice(played).flatMap((audio) => audio.copies)).toHaveLength(0);
    for (const [, file] of PATHS) {
      expect(reaches(context, latest(context, file), output)).toBe(false);
      expect(reaches(context, latest(context, file), context.destination)).toBe(true);
    }
  });

  test("stopping twice, or with no stream, does nothing; asking again afterwards gives a new live stream with every path on it", async () => {
    const game = await openGame();
    game.out.stopGameSoundStream();
    expect(FakeContext.made).toHaveLength(0);
    await game.enter();
    const first = game.out.gameSoundStream();
    game.out.stopGameSoundStream();
    game.out.stopGameSoundStream();
    const second = game.out.gameSoundStream() as unknown as FakeStream;
    expect(second).not.toBe(first);
    expect(second.getAudioTracks().map((track) => track.readyState)).toEqual(["live"]);
    const context = game.context();
    expect(context.streamOutputs).toHaveLength(2);
    await game.fight();
    for (const [, file] of PATHS) expect(reaches(context, latest(context, file), streamNode(context, 1))).toBe(true);
    for (const [, file] of PATHS) expect(reaches(context, latest(context, file), streamNode(context))).toBe(false);
  });

  test("a stream whose track the call stopped by itself is replaced the next time one is asked for", async () => {
    const game = await openGame();
    await game.enter();
    const first = game.out.gameSoundStream() as unknown as FakeStream;
    // LiveKit stops a published track when it is unpublished.
    for (const track of first.getAudioTracks()) track.stop();
    const second = game.out.gameSoundStream() as unknown as FakeStream;
    expect(second).not.toBe(first);
    expect(second.getAudioTracks().map((track) => track.readyState)).toEqual(["live"]);
    const context = game.context();
    expect(context.edges.filter(([, to]) => to === context.streamOutputs[0])).toEqual([]);
    game.frame([{ type: "opening", weakSpot: game.weakSpot, move: "cross" }]);
    expect(reaches(context, latest(context, "/audio/sfx/opening.mp3"), streamNode(context, 1))).toBe(true);
  });
});

describe("the ceiling on the stream", () => {
  const ceilingOf = (context: FakeContext): { limit: FakeNode; trim: FakeNode } => {
    const [limit] = (context as CeilingContext).limits;
    const trim = context.connected.find(([from]) => from === limit)?.[1];
    if (!limit || !trim) throw new Error("no ceiling was made");
    return { limit, trim };
  };

  test("a game that never asks for the stream makes no compressor", async () => {
    const game = await openGame(CeilingContext);
    await game.enter();
    await game.fight();
    expect((game.context() as CeilingContext).limits).toHaveLength(0);
    expect(game.context().streamOutputs).toHaveLength(0);
  });

  test("it is one compressor set as a ceiling, and its trim takes the compressor's own gain off again", async () => {
    const game = await openGame(CeilingContext);
    await game.enter();
    game.out.gameSoundStream();
    game.out.gameSoundStream();
    const context = game.context();
    expect((context as CeilingContext).limits).toHaveLength(1);
    const { limit, trim } = ceilingOf(context);
    expect(limit.threshold.value).toBe(game.tap.CEILING_DB);
    expect(limit.ratio.value).toBe(game.tap.CEILING_RATIO);
    expect(limit.knee.value).toBe(0);
    expect(game.tap.CEILING_DB).toBeLessThan(0);
    // The compressor's own gain is what it takes off a full-scale sound, to the power 0.6 (Web Audio): 1.9 dB * 0.6 here.
    const madeUp = (game.tap.CEILING_DB / game.tap.CEILING_RATIO - game.tap.CEILING_DB) * 0.6;
    expect(20 * Math.log10(trim.gain.value)).toBeCloseTo(-madeUp, 6);
    expect(20 * Math.log10(trim.gain.value)).toBeCloseTo(-1.14, 2);
    // Ceiling, trim, stream node, and nothing else: it never leads to the speakers.
    expect(context.edges.filter(([from]) => from === limit || from === trim).map(([, to]) => to)).toEqual([trim, streamNode(context)]);
    expect(reaches(context, limit, context.destination)).toBe(false);
  });

  test("every sound path and every spoken clip goes through it, and none joins the stream node itself", async () => {
    const game = await openGame(CeilingContext);
    await game.enter();
    game.voice.speakLine("fight_start");
    game.out.gameSoundStream();
    const context = game.context();
    const output = streamNode(context);
    const { limit, trim } = ceilingOf(context);
    game.stops.stopStopAmbience();
    game.stops.startStopAmbience("circe");
    await game.fight();
    for (const [, file] of PATHS) {
      const source = latest(context, file);
      expect(reaches(context, source, limit)).toBe(true);
      expect(reaches(context, source, output)).toBe(true);
      expect(reaches(context, source, context.destination)).toBe(true);
    }
    expect(context.streamSources.length).toBeGreaterThan(3);
    // Each copy of a spoken clip went through its own level into the ceiling, and nowhere else.
    for (const copy of context.streamSources) {
      const level = context.connected.find(([from]) => from === copy)?.[1];
      expect(context.connected.filter(([from]) => from === level).map(([, to]) => to)).toEqual([limit]);
    }
    // The only way into the stream node is the trim.
    expect(context.connected.filter(([, to]) => to === output).map(([from]) => from)).toEqual([trim]);
  });

  test("with it the game's own graph is still the one it has with no stream at all", async () => {
    const plain = await openGame(CeilingContext);
    await plain.enter();
    await plain.fight();
    const without = gameGraph(plain.context());

    FakeContext.made = [];
    const called = await openGame(CeilingContext);
    expect(called.out.gameSoundStream()).not.toBeNull();
    await called.enter();
    await called.fight();
    const context = called.context();
    expect((context as CeilingContext).limits).toHaveLength(1);
    expect(gameGraph(context)).toEqual(without);
    const side = streamSide(context);
    expect(context.edges.filter(([from, to]) => !side.has(from) && !side.has(to))).toEqual(context.connected.filter(([from, to]) => !side.has(from) && !side.has(to)));
  });

  test("stopping takes every path off it and lets it go; a new stream gets a new one", async () => {
    const game = await openGame(CeilingContext);
    await game.enter();
    game.out.gameSoundStream();
    game.voice.speakLine("fight_start");
    const context = game.context();
    const { limit } = ceilingOf(context);
    expect(context.edges.filter(([, to]) => to === limit).length).toBeGreaterThan(3);
    game.out.stopGameSoundStream();
    expect(context.edges.filter(([, to]) => to === limit)).toEqual([]);
    expect(context.edges.filter(([from]) => from === limit)).toEqual([]);
    expect(context.edges.some(([from]) => from.kind === "streamIn")).toBe(false);
    await game.fight();
    expect(context.edges.filter(([, to]) => to === limit)).toEqual([]);
    for (const [, file] of PATHS) expect(reaches(context, latest(context, file), context.destination)).toBe(true);

    game.out.gameSoundStream();
    expect((context as CeilingContext).limits).toHaveLength(2);
    game.frame([{ type: "opening", weakSpot: game.weakSpot, move: "cross" }]);
    expect(reaches(context, latest(context, "/audio/sfx/opening.mp3"), streamNode(context, 1))).toBe(true);
    expect(reaches(context, latest(context, "/audio/sfx/opening.mp3"), streamNode(context))).toBe(false);
  });

  test("a compressor that cannot be made: the sound joins the stream node itself", async () => {
    class NoCeilingContext extends CeilingContext {
      override createDynamicsCompressor(): FakeNode {
        throw new Error("no compressor");
      }
    }
    const game = await openGame(NoCeilingContext);
    await game.enter();
    expect(game.out.gameSoundStream()).not.toBeNull();
    const context = game.context();
    game.frame([{ type: "opening", weakSpot: game.weakSpot, move: "cross" }]);
    const master = context.connected.find(([, to]) => to === streamNode(context))?.[0];
    expect(master?.kind).toBe("gain");
    expect(reaches(context, latest(context, "/audio/sfx/opening.mp3"), streamNode(context))).toBe(true);
  });
});

describe("a browser without the audio the stream needs", () => {
  test("no Web Audio: the stream is null and nothing throws", async () => {
    const game = await openGame(null);
    expect(game.out.gameSoundStream()).toBeNull();
    expect(() => { game.out.stopGameSoundStream(); }).not.toThrow();
    expect(FakeContext.made).toHaveLength(0);
  });

  test("Web Audio that cannot make a stream: the stream is null and the game sounds as ever", async () => {
    class OldContext extends FakeContext {
      constructor() {
        super();
        Object.assign(this, { createMediaStreamDestination: undefined });
      }
    }
    const game = await openGame(OldContext);
    await game.enter();
    expect(game.out.gameSoundStream()).toBeNull();
    await game.fight();
    const context = game.context();
    expect(context.streamOutputs).toHaveLength(0);
    for (const [, file] of PATHS) expect(reaches(context, latest(context, file), context.destination)).toBe(true);
  });

  test("a stream node that throws when it is made: the stream is null, and a later ask tries again", async () => {
    let broken = true;
    class ShakyContext extends FakeContext {
      override createMediaStreamDestination(): FakeNode {
        if (broken) throw new Error("not now");
        return super.createMediaStreamDestination();
      }
    }
    const game = await openGame(ShakyContext);
    await game.enter();
    expect(game.out.gameSoundStream()).toBeNull();
    broken = false;
    expect(game.out.gameSoundStream()).not.toBeNull();
  });
});
