// The sound of a god's power going off: one clip per god, public/audio/power/<god id>.mp3, named in index.json there.
// The engine's powerUnleashed event does not say whose power it was, so whoever knows the god holds it here for as long
// as the fight is on screen (the power-ready banner does). sfx.ts asks here first when the event comes; when this plays
// nothing (no god held, a missing or unloaded clip, audio not running) it plays the usual power sound, so one of the
// two is heard and never both. The clip is timed to the effect on screen (POWER_DELAY). Nothing here throws. The audio
// context is the one the effects use (sfx.ts).
import { log } from "../core/log";
import { getSettings } from "../settings/store";
import { setPowerSound, sharedAudioContext } from "./sfx";
import { tapClip } from "./soundTap";
import { stopClipLevel } from "./stopAudio";

const CLIP_DIR = "/audio/power";
/**
 * The power is the big moment of a fight, so it sits a little over the hit sounds (the effects and the stop events play
 * through 0.5). With POWER_PEAK no clip passes 0.63 at the output.
 */
export const POWER_GAIN = 0.7;
/** Each clip is brought to this RMS level, without its loudest sample passing POWER_PEAK. docs/audio-levels.md has what that gives. */
export const POWER_LOUDNESS = 0.13;
export const POWER_PEAK = 0.9;
/** Samples under this (-50 dBFS) count as the silence a clip starts with, which is skipped so the sound lands with the power. */
const SILENCE = 10 ** (-50 / 20);
/** Never skip more than this: a clip that is quiet for longer is one that swells, not one that starts late. */
const MAX_SKIP_SECONDS = 0.5;
/**
 * How long after the power goes off each god's clip starts, in seconds. The effect on screen winds up for 0.3 s and
 * hits the monster 0.55 to 0.95 s in (POWER_SPAN in src/render/effects/power/powerTiming.ts), so each clip is held
 * back until its loud moment lands on the beat it belongs to: the thunder as the bolt hits, the shield's clang as it
 * hits, the wave's and the blaze's loudest on their hit, the rush of wind as the dash arrives, and the bowstring as
 * the arrow leaves at the end of the wind-up. docs/audio-levels.md has where each clip's loud moment is. A god not
 * listed starts at once. tests/powerSound.test.ts fails if the effect's times move away from these.
 */
export const POWER_DELAY: Readonly<Partial<Record<string, number>>> = {
  zeus: 0.45,
  poseidon: 0.15,
  athena: 0.7,
  hermes: 0.45,
  artemis: 0.26,
  apollo: 0.2,
};
/** With no god (keyboard play or a skipped scan) Athena lends her power, as the banner says (LENDER in src/ai/power/powerPrompt.ts). */
export const NO_GOD_SOUND = "athena";
/** A clip that failed to load is asked for again no more often than this. */
const RETRY_MS = 10_000;

interface Clip {
  readonly buffer: AudioBuffer;
  /** The gain that brings this clip to its loudness. */
  readonly level: number;
  /** Seconds of silence at the start of the clip, skipped when it plays. */
  readonly offset: number;
}

/** One holder of the sound. Compared by identity, so a holder that lets go late does not clear a newer one. */
interface Hold {
  readonly god: string;
}

/** The loaded clips, by god id. */
const clips = new Map<string, Clip>();
/** Gods whose clip is being fetched. */
const loading = new Set<string>();
/** When a god's clip last failed to load, by the clock. */
const failedAt = new Map<string, number>();
/** What index.json lists. Asked for once, unless the request fails: then the next load asks again. */
let index: Promise<ReadonlySet<string> | null> | null = null;
let held: Hold | null = null;

/** The god ids in an index.json. Anything malformed gives an empty list. */
export function listedPowerClips(listed: unknown): readonly string[] {
  return Array.isArray(listed) ? listed.filter((name): name is string => typeof name === "string") : [];
}

/** Seconds of silence before the first sound of a clip, in any channel. Never more than MAX_SKIP_SECONDS, and 0 for a silent clip. */
export function leadSilence(channels: readonly Float32Array[], sampleRate: number): number {
  if (!(sampleRate > 0)) return 0;
  const limit = Math.floor(MAX_SKIP_SECONDS * sampleRate);
  let first = Number.POSITIVE_INFINITY;
  for (const channel of channels) {
    const end = Math.min(channel.length, first, limit + 1);
    for (let i = 0; i < end; i++) {
      if (Math.abs(channel[i] ?? 0) > SILENCE) {
        first = i;
        break;
      }
    }
  }
  if (!Number.isFinite(first)) return channels.some((channel) => channel.length > limit) ? MAX_SKIP_SECONDS : 0;
  return first / sampleRate;
}

/** A volume setting as a number from 0 to 1. Anything that is not a number counts as full. */
function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function prepare(buffer: AudioBuffer): Clip {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  const offset = leadSilence(channels, buffer.sampleRate);
  return { buffer, level: stopClipLevel(channels, POWER_LOUDNESS, POWER_PEAK), offset: offset < buffer.duration ? offset : 0 };
}

/** The gods index.json lists, or null when it could not be fetched or read. A failure is not kept: the next call asks again. */
function listed(): Promise<ReadonlySet<string> | null> {
  index ??= (async (): Promise<ReadonlySet<string> | null> => {
    try {
      const response = await fetch(`${CLIP_DIR}/index.json`);
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      return new Set(listedPowerClips(await response.json()));
    } catch (error) {
      log("warn", "power_sound.indexFailed", error instanceof Error ? error.message : String(error));
      index = null;
      return null;
    }
  })();
  return index;
}

/** Fetches and decodes a god's clip, unless it is loaded, on its way, not listed, or failed a moment ago. */
async function load(context: AudioContext, god: string): Promise<void> {
  if (clips.has(god) || loading.has(god)) return;
  const failed = failedAt.get(god);
  if (failed !== undefined && Date.now() - failed < RETRY_MS) return;
  loading.add(god);
  try {
    const names = await listed();
    if (names === null) throw new Error("no index");
    // A god with no clip keeps the usual sound.
    if (!names.has(god)) return;
    const response = await fetch(`${CLIP_DIR}/${god}.mp3`);
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    clips.set(god, prepare(await context.decodeAudioData(await response.arrayBuffer())));
    failedAt.delete(god);
  } catch (error) {
    failedAt.set(god, Date.now());
    log("warn", "power_sound.clipFailed", { god, reason: error instanceof Error ? error.message : String(error) });
  } finally {
    loading.delete(god);
  }
}

/**
 * Plays the held god's sound. Returns true when it did. Returns false when no god is held, the clip is missing or not
 * loaded yet, or audio is not running: the caller then plays the usual power sound.
 */
export function playPowerSound(): boolean {
  try {
    if (held === null) return false;
    const context = sharedAudioContext();
    if (context?.state !== "running") return false;
    const clip = clips.get(held.god);
    if (!clip) {
      void load(context, held.god);
      return false;
    }
    const source = context.createBufferSource();
    source.buffer = clip.buffer;
    const level = context.createGain();
    level.gain.value = clip.level * POWER_GAIN * unit(getSettings().sfxVolume);
    source.connect(level).connect(context.destination);
    tapClip(level);
    const delay = Object.hasOwn(POWER_DELAY, held.god) ? (POWER_DELAY[held.god] ?? 0) : 0;
    const now = context.currentTime;
    source.start(Number.isFinite(now) && delay > 0 ? now + delay : 0, clip.offset);
    return true;
  } catch (error) {
    log("warn", "power_sound.playFailed", error);
    return false;
  }
}

/**
 * Makes `god`'s sound the one the power plays (Athena's for no god), and starts loading it. Returns the call that lets
 * go again: the usual power sound is back, unless someone else has taken hold since.
 */
export function holdPowerSound(god: string | null): () => void {
  const hold: Hold = { god: god ?? NO_GOD_SOUND };
  try {
    held = hold;
    setPowerSound(playPowerSound);
    const context = sharedAudioContext();
    if (context) void load(context, hold.god);
  } catch (error) {
    log("warn", "power_sound.holdFailed", error);
  }
  return () => {
    if (held !== hold) return;
    held = null;
    setPowerSound(null);
  };
}

/** The god whose sound the power plays now, or null for the usual sound. */
export function heldPowerSound(): string | null {
  return held?.god ?? null;
}
