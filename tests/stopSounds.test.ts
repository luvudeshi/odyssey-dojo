// Guards the sound of the later quest stops: the table matches the enemies and the committed clips, a stop the table
// does not know stays silent, and playing never throws whatever the browser's audio does.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { listedStopClips, playStopEvent, startStopAmbience, stopClipLevel, stopStopAmbience, stopVolumes } from "../src/audio/stopAudio";
import { STOP_SOUNDS, stopAmbience, stopClipFor, stopClipKey, stopClips } from "../src/audio/stopSounds";
import type { CombatEvent, EnemyAttack, EnemySpec } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";

type StopAudio = typeof import("../src/audio/stopAudio");

const FOLDER = "public/audio/stops";
const MAX_BYTES = 400_000;
/** Enemies with no entry on purpose: their fight keeps the sounds it has. */
const KEEPS_USUAL_SOUNDS = ["polyphemus"];

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

function enemy(id: string): EnemySpec {
  return must(ENEMIES.find((spec) => spec.id === id));
}

function attack(enemyId: string, attackId: string): EnemyAttack {
  return must(enemy(enemyId).attacks.find((candidate) => candidate.id === attackId));
}

function telegraph(enemyId: string, attackId: string): CombatEvent {
  return { type: "telegraph", attack: attack(enemyId, attackId) };
}

function playerHit(enemyId: string, attackId: string): CombatEvent {
  const landed = attack(enemyId, attackId);
  return { type: "playerHit", attack: landed, damage: landed.damage };
}

const ENEMY_HIT: CombatEvent = { type: "enemyHit", move: "jab", damage: 5, quality: 1 };

/** One event of every type, for an enemy. */
function everyEvent(enemyId: string): readonly CombatEvent[] {
  const spec = enemy(enemyId);
  const [first] = spec.attacks;
  const [weakSpot] = spec.weakSpots;
  return [
    { type: "telegraph", attack: first },
    { type: "defended", attack: first },
    { type: "playerHit", attack: first, damage: first.damage },
    { type: "opening", weakSpot, move: "jab" },
    ENEMY_HIT,
    { type: "phaseChanged", index: 1, name: "next" },
    { type: "finished", move: "jab" },
    { type: "powerUnleashed", damage: 10 },
    { type: "whiffed" },
    { type: "won" },
    { type: "lost" },
  ];
}

/** Every clip the table names, as index.json lists them. */
function tableClips(): readonly string[] {
  return Object.keys(STOP_SOUNDS)
    .flatMap((enemyId) => stopClips(enemyId).map((clip) => stopClipKey(enemyId, clip)))
    .sort();
}

/** The clips of one stop in the committed index. */
function indexed(enemyId: string): readonly string[] {
  return tableClips().filter((key) => key.startsWith(`${enemyId}/`));
}

// ---- The table ----

test("every enemy has an entry in the table, or is left out on purpose", () => {
  const ids = ENEMIES.map((spec) => spec.id);
  expect(ids.length).toBeGreaterThanOrEqual(6);
  for (const id of ids) expect(Object.hasOwn(STOP_SOUNDS, id), id).toBe(!KEEPS_USUAL_SOUNDS.includes(id));
  for (const id of [...Object.keys(STOP_SOUNDS), ...KEEPS_USUAL_SOUNDS]) expect(ids, id).toContain(id);
});

test("every attack the table names is an attack of that enemy", () => {
  for (const [enemyId, sounds] of Object.entries(STOP_SOUNDS)) {
    const attacks = enemy(enemyId).attacks.map((candidate) => candidate.id);
    for (const attackId of [...Object.keys(sounds.telegraph), ...Object.keys(sounds.playerHit)]) {
      expect(attacks, `${enemyId} ${attackId}`).toContain(attackId);
    }
  }
});

test("every stop in the table has an ambience, a sound for an attack, for being hit and for hitting", () => {
  for (const [enemyId, sounds] of Object.entries(STOP_SOUNDS)) {
    expect(stopAmbience(enemyId), enemyId).toBe(sounds.ambience);
    expect(Object.keys(sounds.telegraph).length, enemyId).toBeGreaterThan(0);
    expect(Object.keys(sounds.playerHit).length, enemyId).toBeGreaterThan(0);
    expect(sounds.events.enemyHit, enemyId).toBeTypeOf("string");
    // The ambience is not also used as an event sound.
    expect(stopClips(enemyId).filter((clip) => clip === sounds.ambience), enemyId).toHaveLength(1);
    for (const clip of stopClips(enemyId)) expect(clip, enemyId).toMatch(/^[a-z]+$/);
  }
});

test("the table picks a stop's sound by enemy id, by attack id and by event", () => {
  expect(stopClipFor("circe", telegraph("circe", "wand_left"))).toBe("wand");
  expect(stopClipFor("circe", playerHit("circe", "spell"))).toBe("squeal");
  expect(stopClipFor("circe", { type: "finished", move: "overhead_strike" })).toBe("defeat");
  expect(stopClipFor("sirens", telegraph("sirens", "song"))).toBe("note");
  expect(stopClipFor("scylla", { type: "phaseChanged", index: 1, name: "Six Heads" })).toBe("howl");
  expect(stopClipFor("charybdis", telegraph("charybdis", "undertow"))).toBe("gulp");
  expect(stopClipFor("suitors", telegraph("suitors", "sword_rush"))).toBe("sword");
  expect(stopClipFor("suitors", ENEMY_HIT)).toBe("hurt");
  // An attack or an event the stop has no sound of its own for keeps the usual one.
  expect(stopClipFor("circe", telegraph("circe", "cup"))).toBeNull();
  expect(stopClipFor("circe", playerHit("circe", "cup"))).toBeNull();
  expect(stopClipFor("circe", { type: "won" })).toBeNull();
  // An attack of another enemy is not this stop's.
  expect(stopClipFor("circe", telegraph("sirens", "song"))).toBeNull();
});

test("an enemy the table does not know has no ambience and no event sound", () => {
  for (const id of ["polyphemus", "nobody", "", "constructor", "toString", "__proto__", "hasOwnProperty"]) {
    expect(stopAmbience(id), id).toBeNull();
    expect(stopClips(id), id).toEqual([]);
    for (const event of everyEvent("polyphemus")) expect(stopClipFor(id, event), `${id} ${event.type}`).toBeNull();
  }
  // Nor does an attack named like something every object has.
  const odd: CombatEvent = { type: "telegraph", attack: { ...attack("circe", "cup"), id: "constructor" } };
  expect(stopClipFor("circe", odd)).toBeNull();
});

// ---- The committed clips ----

test("every clip in the table is listed, on disk, credited and under 400 KB, and no other clip is listed or on disk", () => {
  const named = tableClips();
  expect(named.length).toBeGreaterThanOrEqual(15);
  const index: unknown = JSON.parse(readFileSync(`${FOLDER}/index.json`, "utf8"));
  expect(listedStopClips(index)).toEqual(named);
  const onDisk = readdirSync(FOLDER, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => readdirSync(`${FOLDER}/${entry.name}`).map((file) => `${entry.name}/${file}`))
    .sort();
  expect(onDisk).toEqual(named.map((key) => `${key}.mp3`));
  const credits = readFileSync("CREDITS.md", "utf8");
  for (const key of named) {
    const file = `${FOLDER}/${key}.mp3`;
    expect(existsSync(file), file).toBe(true);
    const { size } = statSync(file);
    expect(size, file).toBeGreaterThan(2_000);
    expect(size, file).toBeLessThanOrEqual(MAX_BYTES);
    expect(credits, file).toContain(`\`${file}\``);
  }
});

test("index.json only yields names, whatever it contains", () => {
  expect(listedStopClips([])).toEqual([]);
  expect(listedStopClips(["circe/wand", 7, null, { clip: "x" }, "scylla/snap"])).toEqual(["circe/wand", "scylla/snap"]);
  for (const junk of [null, undefined, "circe/wand", 3, { "circe/wand": true }]) expect(listedStopClips(junk)).toEqual([]);
});

// ---- Loudness ----

test("a clip is brought to its loudness, but never so far that its loudest sample passes the ceiling", () => {
  const steady = (amplitude: number): Float32Array => new Float32Array(1000).fill(amplitude);
  // A steady clip has the same RMS as its amplitude.
  expect(stopClipLevel([steady(0.01), steady(0.01)], 0.1, 0.9)).toBeCloseTo(10, 5);
  expect(stopClipLevel([steady(0.5)], 0.1, 0.9)).toBeCloseTo(0.2, 5);
  // Mostly quiet with one loud crack: the crack decides.
  const crack = steady(0.01);
  crack[500] = 0.5;
  const level = stopClipLevel([crack], 0.1, 0.9);
  expect(level).toBeCloseTo(0.9 / 0.5, 5);
  expect(level * 0.5).toBeLessThanOrEqual(0.9 + 1e-9);
  // Nothing to measure: left as it is.
  expect(stopClipLevel([new Float32Array(1000)], 0.1, 0.9)).toBe(1);
  expect(stopClipLevel([], 0.1, 0.9)).toBe(1);
  expect(stopClipLevel([new Float32Array(0)], 0.1, 0.9)).toBe(1);
});

test("until the settings store is on main, both volumes are full", () => {
  expect(stopVolumes()).toEqual({ music: 1, sfx: 1 });
});

// ---- Playback, in a fake browser ----

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
    if (FakeContext.jammed) throw new Error("cannot start");
    this.started = { when, offset };
  }

  stop(when = 0): void {
    this.stopped = when;
  }
}

/** Every decoded clip is 10 seconds of steady sound at a low sample rate, with a little silence at each end like an MP3. */
const RATE = 1000;
const SECONDS = 10;
const PADDING = 20;
const AMPLITUDE = 0.25;

function decoded(): FakeBuffer {
  const channels = [0, 1].map(() => {
    const data = new Float32Array(RATE * SECONDS).fill(AMPLITUDE);
    data.fill(0, 0, PADDING);
    data.fill(0, data.length - PADDING);
    return data;
  });
  return { numberOfChannels: 2, sampleRate: RATE, getChannelData: (index) => channels[index] ?? new Float32Array(0) };
}

/** Just enough of an AudioContext to record what gets played. */
class FakeContext {
  static latest: FakeContext | null = null;
  /** While true the browser holds audio back the way it does before a click. */
  static locked = false;
  /** Makes every clip fail to decode. */
  static corrupt = false;
  /** Makes every source refuse to start. */
  static jammed = false;
  /** Makes the browser refuse to make a context at all. */
  static broken = false;
  readonly sampleRate = 44100;
  readonly destination = {};
  readonly sources: FakeSource[] = [];
  readonly listeners: (() => void)[] = [];
  currentTime = 0;
  state = FakeContext.locked ? "suspended" : "running";

  constructor() {
    if (FakeContext.broken) throw new Error("no audio device");
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
    if (FakeContext.locked) return new Promise(() => undefined);
    this.unlock();
    return Promise.resolve();
  }

  /** What a click does: audio starts running and the context says so. */
  unlock(): void {
    this.state = "running";
    for (const listener of this.listeners) listener();
  }

  /** The sources that were started. */
  get heard(): FakeSource[] {
    return this.sources.filter((source) => source.started !== null);
  }
}

interface Browser {
  readonly audio: StopAudio;
  /** Every URL asked for under /audio/stops. */
  readonly requested: string[];
}

/**
 * Loads a fresh copy of the stop audio into a fake browser. `index` is what public/audio/stops/index.json holds
 * (undefined: the request fails; null: the file is not there), and `missing` lists clips whose files are not there.
 */
async function inBrowser(index: unknown, missing: readonly string[] = []): Promise<Browser> {
  const requested: string[] = [];
  vi.useFakeTimers();
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("fetch", (url: string) => {
    const ok = (body: unknown): Promise<unknown> =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    const notFound = Promise.resolve({ ok: false, status: 404 });
    if (!url.startsWith("/audio/stops/")) return url.endsWith("index.json") ? ok([]) : notFound;
    requested.push(url);
    if (url === "/audio/stops/index.json") {
      if (index === undefined) return Promise.reject(new Error("offline"));
      return index === null ? notFound : ok(index);
    }
    return missing.some((key) => url === `/audio/stops/${key}.mp3`) ? notFound : ok(null);
  });
  const audio = await import("../src/audio/stopAudio");
  return { audio, requested };
}

/** Lets the index and the clips finish loading. */
async function loaded(): Promise<void> {
  await vi.advanceTimersByTimeAsync(100);
}

function context(): FakeContext {
  return must(FakeContext.latest);
}

/** The gain a source goes through first, and the shared one after it. */
function level(source: FakeSource): FakeParam {
  return must(source.to).gain;
}

function bus(source: FakeSource): FakeParam {
  return (must(source.to).to as FakeGain).gain;
}

afterEach(() => {
  FakeContext.latest = null;
  FakeContext.locked = false;
  FakeContext.corrupt = false;
  FakeContext.jammed = false;
  FakeContext.broken = false;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("where there is no audio at all, every call does nothing and no event is taken", () => {
  expect(() => {
    stopStopAmbience();
    startStopAmbience("circe");
    startStopAmbience("nobody");
    startStopAmbience("circe");
    stopStopAmbience();
  }).not.toThrow();
  for (const event of everyEvent("circe")) expect(playStopEvent("circe", event)).toBe(false);
});

test("an enemy the table does not know stays silent and nothing is requested for it", async () => {
  const { audio, requested } = await inBrowser(tableClips());
  for (const id of ["polyphemus", "nobody", "constructor"]) {
    audio.startStopAmbience(id);
    for (const event of everyEvent("polyphemus")) expect(audio.playStopEvent(id, event), `${id} ${event.type}`).toBe(false);
  }
  audio.stopStopAmbience();
  await loaded();
  expect(requested).toEqual([]);
  expect(FakeContext.latest).toBeNull();
});

test("a stop's ambience fades in, loops past the silent ends of its file, and only that stop's clips are requested", async () => {
  const { audio, requested } = await inBrowser(tableClips());
  audio.startStopAmbience("circe");
  await loaded();
  expect(requested[0]).toBe("/audio/stops/index.json");
  expect(requested.slice(1).sort()).toEqual(indexed("circe").map((key) => `/audio/stops/${key}.mp3`));
  expect(indexed("circe").length).toBeGreaterThan(1);

  const [ambience, ...others] = context().heard;
  expect(others).toEqual([]);
  const loop = must(ambience);
  expect(loop.loop).toBe(true);
  expect(must(loop.started).offset).toBeCloseTo(PADDING / RATE, 6);
  expect(loop.loopStart).toBeGreaterThan(PADDING / RATE);
  expect(loop.loopEnd).toBeCloseTo(SECONDS - PADDING / RATE, 6);
  // Faded in from nothing to the level that brings the clip to its loudness, through the ambience's own quiet gain.
  expect(level(loop).events).toEqual([
    { kind: "set", value: 0, time: 0 },
    { kind: "ramp", value: expect.closeTo(0.08 / AMPLITUDE, 3) as number, time: 1 },
  ]);
  expect(bus(loop).value).toBeCloseTo(0.16, 6);

  // Asking again changes nothing.
  audio.startStopAmbience("circe");
  await loaded();
  expect(context().heard).toHaveLength(1);
  expect(requested).toHaveLength(1 + indexed("circe").length);
});

test("stopping fades the ambience out and stops it, and it can start again", async () => {
  const { audio } = await inBrowser(tableClips());
  audio.startStopAmbience("scylla");
  await loaded();
  const loop = must(context().heard[0]);
  context().currentTime = 5;
  audio.stopStopAmbience();
  expect(level(loop).events.at(-1)).toEqual({ kind: "ramp", value: 0, time: 6 });
  expect(loop.stopped).toBeGreaterThan(6);
  audio.stopStopAmbience();
  audio.startStopAmbience("scylla");
  expect(context().heard).toHaveLength(2);
  expect(must(context().heard[1]).stopped).toBeNull();
});

test("moving to another stop fades the old ambience out, starts the new one and requests the new stop's clips", async () => {
  const { audio, requested } = await inBrowser(tableClips());
  audio.startStopAmbience("sirens");
  await loaded();
  audio.startStopAmbience("charybdis");
  await loaded();
  const [old, next] = context().heard;
  expect(must(old).stopped).not.toBeNull();
  expect(must(next).stopped).toBeNull();
  expect(must(next).loop).toBe(true);
  expect(requested.filter((url) => url.includes("/charybdis/")).sort()).toEqual(indexed("charybdis").map((key) => `/audio/stops/${key}.mp3`));
  // The clips of the stop before were let go, so its events fall back to the usual sounds until it is loaded again.
  expect(audio.playStopEvent("charybdis", telegraph("charybdis", "spout"))).toBe(true);
});

test("a stop's event plays its own clip once loaded; anything else is left to the usual sounds", async () => {
  const { audio } = await inBrowser(tableClips());
  // The first call only starts the loading, so the usual sound plays this once.
  expect(audio.playStopEvent("circe", telegraph("circe", "wand_left"))).toBe(false);
  await loaded();
  expect(context().heard).toEqual([]);

  expect(audio.playStopEvent("circe", telegraph("circe", "wand_left"))).toBe(true);
  const wand = must(context().heard[0]);
  expect(wand.loop).toBe(false);
  expect(wand.playbackRate.value).toBe(1);
  expect(level(wand).value).toBeCloseTo(0.12 / AMPLITUDE, 3);
  expect(bus(wand).value).toBeCloseTo(0.5, 6);

  // Sounds that repeat a lot vary a little in pitch.
  expect(audio.playStopEvent("circe", playerHit("circe", "spell"))).toBe(true);
  expect(audio.playStopEvent("circe", ENEMY_HIT)).toBe(true);
  for (const source of context().heard.slice(1)) expect(Math.abs(source.playbackRate.value - 1)).toBeLessThanOrEqual(0.04);

  expect(audio.playStopEvent("circe", telegraph("circe", "cup"))).toBe(false);
  expect(audio.playStopEvent("circe", { type: "defended", attack: attack("circe", "cup") })).toBe(false);
  expect(audio.playStopEvent("circe", { type: "won" })).toBe(false);
  expect(context().heard).toHaveLength(3);
});

test("every sound the table gives a stop plays once that stop is loaded", async () => {
  for (const enemyId of Object.keys(STOP_SOUNDS)) {
    const { audio } = await inBrowser(tableClips());
    audio.startStopAmbience(enemyId);
    await loaded();
    const spec = enemy(enemyId);
    const events: CombatEvent[] = [...everyEvent(enemyId)];
    for (const each of spec.attacks) events.push(telegraph(enemyId, each.id), playerHit(enemyId, each.id));
    for (const event of events) {
      const before = context().heard.length;
      const took = audio.playStopEvent(enemyId, event);
      expect(took, `${enemyId} ${event.type}`).toBe(stopClipFor(enemyId, event) !== null);
      expect(context().heard.length - before, `${enemyId} ${event.type}`).toBe(took ? 1 : 0);
    }
  }
});

test("a clip that index.json does not list is never requested, and its event keeps the usual sound", async () => {
  const { audio, requested } = await inBrowser(["circe/ambience", "circe/squeal", "sirens/note", 7, "circe/unused"]);
  audio.startStopAmbience("circe");
  await loaded();
  expect(requested.sort()).toEqual(["/audio/stops/circe/ambience.mp3", "/audio/stops/circe/squeal.mp3", "/audio/stops/index.json"]);
  expect(audio.playStopEvent("circe", telegraph("circe", "wand_left"))).toBe(false);
  expect(audio.playStopEvent("circe", playerHit("circe", "wand_left"))).toBe(true);
});

test("a missing file, a missing index, no network and a file that is not audio all mean silence, not an error", async () => {
  const cases: readonly (() => Promise<Browser>)[] = [
    () => inBrowser(tableClips(), indexed("circe")),
    () => inBrowser(null),
    () => inBrowser(undefined),
    () => inBrowser({ circe: ["ambience"] }),
    () => {
      FakeContext.corrupt = true;
      return inBrowser(tableClips());
    },
  ];
  for (const open of cases) {
    const { audio } = await open();
    expect(() => {
      audio.startStopAmbience("circe");
    }).not.toThrow();
    await loaded();
    for (const event of everyEvent("circe")) expect(audio.playStopEvent("circe", event)).toBe(false);
    audio.stopStopAmbience();
    expect(context().heard).toEqual([]);
  }
});

test("one missing file does not silence the rest of the stop", async () => {
  const { audio } = await inBrowser(tableClips(), ["circe/ambience"]);
  audio.startStopAmbience("circe");
  await loaded();
  expect(context().heard).toEqual([]);
  expect(audio.playStopEvent("circe", telegraph("circe", "spell"))).toBe(true);
});

test("while the browser holds audio back nothing plays and no event is taken; the ambience starts once it is allowed", async () => {
  FakeContext.locked = true;
  const { audio } = await inBrowser(tableClips());
  audio.startStopAmbience("suitors");
  await loaded();
  expect(context().heard).toEqual([]);
  expect(audio.playStopEvent("suitors", telegraph("suitors", "sword_rush"))).toBe(false);
  FakeContext.locked = false;
  context().unlock();
  expect(context().heard).toHaveLength(1);
  expect(must(context().heard[0]).loop).toBe(true);
  expect(audio.playStopEvent("suitors", telegraph("suitors", "sword_rush"))).toBe(true);
});

test("a browser that cannot make or start audio is handled without an error", async () => {
  FakeContext.broken = true;
  const first = await inBrowser(tableClips());
  expect(() => {
    first.audio.startStopAmbience("circe");
    first.audio.refreshStopVolume();
    first.audio.stopStopAmbience();
  }).not.toThrow();
  expect(first.audio.playStopEvent("circe", ENEMY_HIT)).toBe(false);
  expect(first.requested).toEqual([]);

  FakeContext.broken = false;
  FakeContext.jammed = true;
  const second = await inBrowser(tableClips());
  second.audio.startStopAmbience("circe");
  await loaded();
  expect(second.audio.playStopEvent("circe", ENEMY_HIT)).toBe(false);
  expect(() => {
    second.audio.stopStopAmbience();
  }).not.toThrow();
});

test("an event or an enemy id that is not what it should be is refused without an error", async () => {
  const { audio } = await inBrowser(tableClips());
  audio.startStopAmbience("circe");
  await loaded();
  const broken = [{ type: "telegraph" }, { type: "playerHit", attack: null }, { type: "noSuchEvent" }, {}, null, undefined];
  for (const event of broken) expect(audio.playStopEvent("circe", event as unknown as CombatEvent)).toBe(false);
  for (const id of [undefined, null, 7, {}]) {
    expect(audio.playStopEvent(id as string, ENEMY_HIT)).toBe(false);
    expect(() => {
      audio.startStopAmbience(id as string);
    }).not.toThrow();
  }
});
