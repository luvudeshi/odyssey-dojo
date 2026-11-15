// Plays what the table in stopSounds.ts lists: a stop's ambience, looped under its fight, and its own sound for a combat event.
// Clips come from public/audio/stops, and only the ones named in index.json there are requested, one stop at a time.
// A stop with no entry, a missing file, no audio or a blocked context means silence here, never an error.
// The loop join and the loudness measure are the music's (music.ts); the audio context is the one the effects use (sfx.ts).
import { log } from "../core/log";
import type { CombatEvent } from "../core/types";
import { getSettings, subscribeSettings } from "../settings/store";
import type { LoopPoints } from "./music";
import { clipLevel, seamLoop } from "./music";
import { sharedAudioContext } from "./sfx";
import { watchVoice } from "./voice";
import { stopAmbience, stopClipFor, stopClipKey, stopClips } from "./stopSounds";

const CLIP_DIR = "/audio/stops";
/** The ambience sits where the music does in the mix (music.ts plays through 0.16), and a little under the battle music. */
const AMBIENCE_GAIN = 0.16;
const AMBIENCE_LOUDNESS = 0.08;
/**
 * No ambience is raised so far that its loudest sample passes this before AMBIENCE_GAIN, which is 0.32 at the output.
 * Measured on the committed clips: all five reach their loudness (RMS 0.013 at the output) under it. Circe's fire comes
 * closest: a quiet bed where two pops in its 30 seconds pass 0.1 at the output (they peak at 0.21 and 0.32, where a hit
 * sound peaks at 0.24 to 0.45). The other four peak at 0.14 or less. Nobody has listened to how the pops sit in the mix.
 */
const AMBIENCE_PEAK = 2;
/** While a line is spoken the ambience dips to this share of itself, as the music does (music.ts DUCK). */
const DUCK = 0.5;
/** A stop's event sounds sit where the usual effects do (sfx.ts plays through 0.5). */
const EVENT_GAIN = 0.5;
const EVENT_LOUDNESS = 0.12;
const EVENT_PEAK = 0.9;
/** How long the join of an ambience loop is, and how long an ambience takes to fade in or out. */
const SEAM_SECONDS = 1.5;
const FADE_SECONDS = 1;
/** A faded-out ambience is stopped this long after its fade ends. */
const STOP_MARGIN_SECONDS = 0.05;
/** How fast a volume change takes hold (a time constant). */
const GLIDE_SECONDS = 0.05;
/** During a fight, clips that failed to load are asked for again no more often than this. */
const RETRY_MS = 10_000;
/** Events that repeat often enough to need a slightly different pitch each time, as in sfx.ts. */
const VARIED: ReadonlySet<string> = new Set(["enemyHit", "playerHit"]);
const RATE_SPREAD = 0.04;

export interface StopVolumes {
  /** Scales the ambience. 0 is silent, 1 is full. */
  readonly music: number;
  /** Scales the event sounds. */
  readonly sfx: number;
}

/** The one place the stop sounds read their volume: the ambience follows the music setting, the event sounds the effects setting. */
export function stopVolumes(): StopVolumes {
  const { musicVolume, sfxVolume } = getSettings();
  return { music: musicVolume, sfx: sfxVolume };
}

interface Rig {
  readonly context: AudioContext;
  readonly ambienceBus: GainNode;
  readonly eventBus: GainNode;
}

interface Clip {
  readonly buffer: AudioBuffer;
  /** The gain that brings this clip to its loudness. */
  readonly level: number;
  /** Null for a clip that plays once. */
  readonly loop: LoopPoints | null;
}

interface Playing {
  readonly enemyId: string;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly level: number;
  /** Context time the fade in began. */
  readonly since: number;
}

/** The loading of one stop's clips. */
interface Load {
  readonly enemyId: string;
  /** True while requests are out. */
  busy: boolean;
  /** When the index or one of the clips last failed to load, by the clock. Null when the last try got everything. */
  failedAt: number | null;
}

/** The loaded clips of one stop, by index name. */
const clips = new Map<string, Clip>();
/** Undefined until the first use; null where there is no audio. */
let rig: Rig | null | undefined;
/** What index.json lists. Asked for once, unless the request fails: then the next load asks again. */
let index: Promise<ReadonlySet<string> | null> | null = null;
/** The stop whose clips are loaded or on their way. */
let current: Load | null = null;
/** The stop whose ambience should be heard, and the one that is. */
let wanted: string | null = null;
let playing: Playing | null = null;
let applied: StopVolumes = { music: 1, sfx: 1 };
let speaking = false;
let paused = false;
let appliedTarget = AMBIENCE_GAIN;

/** The gain of the ambience bus: the music setting, halved under a spoken line, and nothing while the game is paused. */
export function ambienceGain(music: number, ducked: boolean, isPaused: boolean): number {
  return isPaused ? 0 : AMBIENCE_GAIN * music * (ducked ? DUCK : 1);
}

/** The clip names in an index.json. Anything malformed gives an empty list. */
export function listedStopClips(listed: unknown): readonly string[] {
  return Array.isArray(listed) ? listed.filter((name): name is string => typeof name === "string") : [];
}

/**
 * The gain that brings a clip to the RMS level `loudness` without its loudest sample passing `ceiling`.
 * A silent or empty clip gives 1.
 */
export function stopClipLevel(channels: readonly Float32Array[], loudness: number, ceiling: number): number {
  let peak = 0;
  for (const channel of channels) {
    for (const value of channel) {
      const size = Math.abs(value);
      if (size > peak) peak = size;
    }
  }
  const level = clipLevel(channels, loudness);
  return peak > 0 && ceiling > 0 ? Math.min(level, ceiling / peak) : level;
}

/** A volume setting as a number from 0 to 1. Anything that is not a number counts as full. */
function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function readVolumes(): StopVolumes {
  const { music, sfx } = stopVolumes();
  return { music: unit(music), sfx: unit(sfx) };
}

/** Brings both gains in line with the volume settings, if they changed. */
function applyVolumes({ context, ambienceBus, eventBus }: Rig): void {
  try {
    const next = readVolumes();
    const target = ambienceGain(next.music, speaking, paused);
    if (next.music === applied.music && next.sfx === applied.sfx && target === appliedTarget) return;
    applied = next;
    appliedTarget = target;
    ambienceBus.gain.setTargetAtTime(target, context.currentTime, GLIDE_SECONDS);
    eventBus.gain.setTargetAtTime(EVENT_GAIN * next.sfx, context.currentTime, GLIDE_SECONDS);
  } catch (error) {
    log("warn", "stops.volumeFailed", error);
  }
}

function prepare(buffer: AudioBuffer, ambience: boolean): Clip {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  if (!ambience) return { buffer, level: stopClipLevel(channels, EVENT_LOUDNESS, EVENT_PEAK), loop: null };
  const level = stopClipLevel(channels, AMBIENCE_LOUDNESS, AMBIENCE_PEAK);
  return { buffer, level, loop: seamLoop(channels, buffer.sampleRate, SEAM_SECONDS) };
}

/** Fades an ambience out and stops it once it is silent. */
function release({ context }: Rig, { source, gain, level, since }: Playing): void {
  try {
    const now = context.currentTime;
    const reached = level * Math.min(1, Math.max(0, (now - since) / FADE_SECONDS));
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(reached, now);
    gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    source.stop(now + FADE_SECONDS + STOP_MARGIN_SECONDS);
  } catch (error) {
    // The next ambience must still start, so one that will not stop is only reported.
    log("warn", "stops.stopFailed", error);
  }
}

function begin({ context, ambienceBus }: Rig, enemyId: string, { buffer, level, loop }: Clip): Playing {
  const now = context.currentTime;
  const source = context.createBufferSource();
  source.buffer = buffer;
  if (loop) {
    source.loop = true;
    source.loopStart = loop.loopStart;
    source.loopEnd = loop.loopEnd;
  }
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(level, now + FADE_SECONDS);
  source.connect(gain).connect(ambienceBus);
  source.start(now, loop?.start ?? 0);
  return { enemyId, source, gain, level, since: now };
}

/** Brings what is heard in line with the wanted ambience. Safe to call at any time, any number of times. */
function sync(active: Rig): void {
  try {
    if (playing && playing.enemyId !== wanted) {
      const old = playing;
      playing = null;
      release(active, old);
    }
    if (wanted === null || playing) return;
    if (active.context.state !== "running") {
      // Held back until a click or key press. The context reports the change, and this runs again then.
      active.context.resume().catch(() => undefined);
      return;
    }
    const ambience = stopAmbience(wanted);
    const clip = ambience === null ? undefined : clips.get(stopClipKey(wanted, ambience));
    // Not loaded yet (this runs again when it is), or missing: silence.
    if (clip) playing = begin(active, wanted, clip);
  } catch (error) {
    log("warn", "stops.ambienceFailed", error);
  }
}

/** The clips index.json lists, or null when it could not be fetched or read. A failure is not kept: the next call asks again. */
function listed(): Promise<ReadonlySet<string> | null> {
  index ??= (async (): Promise<ReadonlySet<string> | null> => {
    try {
      const response = await fetch(`${CLIP_DIR}/index.json`);
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      return new Set(listedStopClips(await response.json()));
    } catch (error) {
      log("warn", "stops.indexFailed", error instanceof Error ? error.message : String(error));
      index = null;
      return null;
    }
  })();
  return index;
}

/** Fetches and decodes one clip. False when that failed. */
async function loadClip(active: Rig, load: Load, clip: string): Promise<boolean> {
  const key = stopClipKey(load.enemyId, clip);
  try {
    const response = await fetch(`${CLIP_DIR}/${key}.mp3`);
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    const buffer = await active.context.decodeAudioData(await response.arrayBuffer());
    // The game moved on to another stop while this one was loading.
    if (current !== load) return true;
    clips.set(key, prepare(buffer, clip === stopAmbience(load.enemyId)));
    sync(active);
    return true;
  } catch (error) {
    log("warn", "stops.clipFailed", { key, reason: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/** Loads the listed clips of a stop that are not loaded yet, and notes on the load whether anything failed. */
async function loadStop(active: Rig, load: Load): Promise<void> {
  load.busy = true;
  load.failedAt = null;
  try {
    const names = await listed();
    if (names === null) {
      load.failedAt = Date.now();
      return;
    }
    if (current !== load) return;
    const wanting = stopClips(load.enemyId).filter((clip) => {
      const key = stopClipKey(load.enemyId, clip);
      return names.has(key) && !clips.has(key);
    });
    const results = await Promise.all(wanting.map((clip) => loadClip(active, load, clip)));
    if (results.includes(false)) load.failedAt = Date.now();
  } catch (error) {
    load.failedAt = Date.now();
    log("warn", "stops.loadFailed", error);
  } finally {
    load.busy = false;
  }
}

function createRig(): Rig | null {
  try {
    const context = sharedAudioContext();
    if (!context) return null;
    applied = readVolumes();
    const ambienceBus = context.createGain();
    appliedTarget = ambienceGain(applied.music, speaking, paused);
    ambienceBus.gain.value = appliedTarget;
    ambienceBus.connect(context.destination);
    const eventBus = context.createGain();
    eventBus.gain.value = EVENT_GAIN * applied.sfx;
    eventBus.connect(context.destination);
    const active = { context, ambienceBus, eventBus };
    context.addEventListener("statechange", () => {
      sync(active);
    });
    // A volume slider moved in the pause menu is heard at once.
    subscribeSettings(() => {
      applyVolumes(active);
    });
    return active;
  } catch (error) {
    log("warn", "stops.unavailable", error);
    return null;
  }
}

/**
 * Sets the audio up on first use and starts loading this stop's clips. The clips of the stop before are let go.
 * Clips that failed to load are asked for again: at once when `retryNow` (the stop is starting), otherwise once
 * RETRY_MS has passed since the failure.
 */
function ready(enemyId: string, retryNow: boolean): Rig | null {
  if (rig === undefined) rig = createRig();
  if (!rig) return null;
  if (current?.enemyId !== enemyId) {
    current = { enemyId, busy: false, failedAt: null };
    clips.clear();
    void loadStop(rig, current);
  } else if (!current.busy && current.failedAt !== null && (retryNow || Date.now() - current.failedAt >= RETRY_MS)) {
    void loadStop(rig, current);
  }
  applyVolumes(rig);
  return rig;
}

/**
 * Fades in the ambience of a stop and loops it until stopStopAmbience, or until another stop's is asked for. A stop
 * with no entry in the table gets silence. Asking for the stop already wanted does nothing. Starting a stop again
 * after a stop asks again for any of its clips that failed to load.
 */
export function startStopAmbience(enemyId: string): void {
  try {
    const next = stopAmbience(enemyId) === null ? null : enemyId;
    if (next === wanted) return;
    wanted = next;
    const active = next === null ? rig : ready(next, true);
    if (active) sync(active);
  } catch (error) {
    log("warn", "stops.startFailed", error);
  }
}

/** Fades the ambience out. */
export function stopStopAmbience(): void {
  try {
    wanted = null;
    if (rig) sync(rig);
  } catch (error) {
    log("warn", "stops.stopFailed", error);
  }
}

/**
 * Plays a stop's own sound for a combat event. Returns true when it did. Returns false when the table has no sound for
 * it, or the clip is missing or not loaded yet, or audio is not running: the caller then plays the usual sound.
 * A clip that failed to load is asked for again during the fight, no more than once every ten seconds.
 */
export function playStopEvent(enemyId: string, event: CombatEvent): boolean {
  try {
    const name = stopClipFor(enemyId, event);
    if (name === null) return false;
    const active = ready(enemyId, false);
    if (active?.context.state !== "running") return false;
    const clip = clips.get(stopClipKey(enemyId, name));
    if (!clip) return false;
    const source = active.context.createBufferSource();
    source.buffer = clip.buffer;
    if (VARIED.has(event.type)) source.playbackRate.value = 1 + (Math.random() * 2 - 1) * RATE_SPREAD;
    const level = active.context.createGain();
    level.gain.value = clip.level;
    source.connect(level).connect(active.eventBus);
    source.start();
    return true;
  } catch (error) {
    log("warn", "stops.playFailed", error);
    return false;
  }
}

/** Holds the ambience silent while the game is paused, and brings it back after. */
export function pauseStopAmbience(isPaused: boolean): void {
  paused = isPaused;
  if (rig) applyVolumes(rig);
}

// Dips under Athena's, Homer's and the monsters' lines; each voice has its own name, so one falling quiet while another speaks keeps the dip.
const speakers = new Set<string>();
watchVoice((isSpeaking, who = "voice") => {
  if (isSpeaking) speakers.add(who);
  else speakers.delete(who);
  speaking = speakers.size > 0;
  if (rig) applyVolumes(rig);
});
