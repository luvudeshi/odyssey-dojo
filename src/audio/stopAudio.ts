// Plays what the table in stopSounds.ts lists: a stop's ambience, looped under its fight, and its own sound for a combat event.
// Clips come from public/audio/stops, and only the ones named in index.json there are requested, one stop at a time.
// A stop with no entry, a missing file, no audio or a blocked context means silence here, never an error.
// The loop join and the loudness measure are the music's (music.ts); the audio context is the one the effects use (sfx.ts).
import { log } from "../core/log";
import type { CombatEvent } from "../core/types";
import type { LoopPoints } from "./music";
import { clipLevel, seamLoop } from "./music";
import { sharedAudioContext } from "./sfx";
import { stopAmbience, stopClipFor, stopClipKey, stopClips } from "./stopSounds";

const CLIP_DIR = "/audio/stops";
/** The ambience sits where the music does in the mix (music.ts plays through 0.16), and a little under the battle music. */
const AMBIENCE_GAIN = 0.16;
const AMBIENCE_LOUDNESS = 0.08;
/** No ambience is raised so far that its loudest moment, a log cracking in the fire, passes this before AMBIENCE_GAIN. */
const AMBIENCE_PEAK = 1.25;
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
/** Events that repeat often enough to need a slightly different pitch each time, as in sfx.ts. */
const VARIED: ReadonlySet<string> = new Set(["enemyHit", "playerHit"]);
const RATE_SPREAD = 0.04;

export interface StopVolumes {
  /** Scales the ambience. 0 is silent, 1 is full. */
  readonly music: number;
  /** Scales the event sounds. */
  readonly sfx: number;
}

/**
 * The one place the stop sounds read their volume. Until src/settings/store.ts is on main both are 1. Once it is, this
 * returns `{ music: getSettings().musicVolume, sfx: getSettings().sfxVolume }`.
 */
export function stopVolumes(): StopVolumes {
  return { music: 1, sfx: 1 };
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

/** The loaded clips of one stop, by index name. */
const clips = new Map<string, Clip>();
/** Undefined until the first use; null where there is no audio. */
let rig: Rig | null | undefined;
/** What index.json lists, asked for once. */
let index: Promise<ReadonlySet<string>> | null = null;
/** The stop whose clips are loaded or on their way. */
let loadedFor: string | null = null;
/** The stop whose ambience should be heard, and the one that is. */
let wanted: string | null = null;
let playing: Playing | null = null;
let applied: StopVolumes = { music: 1, sfx: 1 };

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
    if (next.music === applied.music && next.sfx === applied.sfx) return;
    applied = next;
    ambienceBus.gain.setTargetAtTime(AMBIENCE_GAIN * next.music, context.currentTime, GLIDE_SECONDS);
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

function listed(): Promise<ReadonlySet<string>> {
  index ??= (async (): Promise<ReadonlySet<string>> => {
    try {
      const response = await fetch(`${CLIP_DIR}/index.json`);
      if (!response.ok) return new Set();
      return new Set(listedStopClips(await response.json()));
    } catch (error) {
      log("warn", "stops.indexFailed", error);
      return new Set();
    }
  })();
  return index;
}

async function loadClip(active: Rig, enemyId: string, clip: string): Promise<void> {
  const key = stopClipKey(enemyId, clip);
  try {
    const response = await fetch(`${CLIP_DIR}/${key}.mp3`);
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    const buffer = await active.context.decodeAudioData(await response.arrayBuffer());
    // The game moved on to another stop while this one was loading.
    if (loadedFor !== enemyId) return;
    clips.set(key, prepare(buffer, clip === stopAmbience(enemyId)));
    sync(active);
  } catch (error) {
    log("warn", "stops.clipFailed", { key, reason: error instanceof Error ? error.message : String(error) });
  }
}

async function loadStop(active: Rig, enemyId: string): Promise<void> {
  try {
    const names = await listed();
    await Promise.all(
      stopClips(enemyId)
        .filter((clip) => names.has(stopClipKey(enemyId, clip)))
        .map((clip) => loadClip(active, enemyId, clip)),
    );
  } catch (error) {
    log("warn", "stops.loadFailed", error);
  }
}

function createRig(): Rig | null {
  try {
    const context = sharedAudioContext();
    if (!context) return null;
    applied = readVolumes();
    const ambienceBus = context.createGain();
    ambienceBus.gain.value = AMBIENCE_GAIN * applied.music;
    ambienceBus.connect(context.destination);
    const eventBus = context.createGain();
    eventBus.gain.value = EVENT_GAIN * applied.sfx;
    eventBus.connect(context.destination);
    const active = { context, ambienceBus, eventBus };
    context.addEventListener("statechange", () => {
      sync(active);
    });
    return active;
  } catch (error) {
    log("warn", "stops.unavailable", error);
    return null;
  }
}

/** Sets the audio up on first use and starts loading this stop's clips. The clips of the stop before are let go. */
function ready(enemyId: string): Rig | null {
  if (rig === undefined) rig = createRig();
  if (!rig) return null;
  if (loadedFor !== enemyId) {
    loadedFor = enemyId;
    clips.clear();
    void loadStop(rig, enemyId);
  }
  applyVolumes(rig);
  return rig;
}

/**
 * Fades in the ambience of a stop and loops it until stopStopAmbience, or until another stop's is asked for. A stop
 * with no entry in the table gets silence. Asking for the stop already wanted does nothing.
 */
export function startStopAmbience(enemyId: string): void {
  try {
    const next = stopAmbience(enemyId) === null ? null : enemyId;
    if (next === wanted) return;
    wanted = next;
    const active = next === null ? rig : ready(next);
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

/** Picks up a changed volume setting at once. Without this call it is picked up at the next sound. */
export function refreshStopVolume(): void {
  if (rig) applyVolumes(rig);
}

/**
 * Plays a stop's own sound for a combat event. Returns true when it did. Returns false when the table has no sound for
 * it, or the clip is missing or not loaded yet, or audio is not running: the caller then plays the usual sound.
 */
export function playStopEvent(enemyId: string, event: CombatEvent): boolean {
  try {
    const name = stopClipFor(enemyId, event);
    if (name === null) return false;
    const active = ready(enemyId);
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
