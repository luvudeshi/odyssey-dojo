// Background music: one clip per scene from public/audio/music, crossfaded when the scene changes.
// Only clips listed in index.json there are requested. A missing file, no audio or a blocked context means silence, never an error.
// To replace a clip, drop <scene>.mp3 into public/audio/music (or run "genClips.ts music") and keep "<scene>" in index.json.
// Each clip's loudness is measured when it loads, so a replacement that is louder or quieter needs no retuning here.
import { log } from "../core/log";
import { sharedAudioContext } from "./sfx";
import { watchVoice } from "./voice";

export type MusicScene = "menu" | "fight" | "win" | "loss";

interface SceneSpec {
  /** How loud the clip should come out before MUSIC_GAIN, as an RMS level. The clip is raised or lowered to meet it. */
  readonly loudness: number;
  /** Seconds the scene takes to fade in. */
  readonly fadeIn: number;
  /** Set for a clip that repeats: how long the join is, and how long one pass is when that must land on the beat. */
  readonly loop?: { readonly seam: number; readonly period?: number };
}

const CLIP_DIR = "/audio/music";
/** Effects play through a gain of 0.5 and the voice at full level; music sits well under both. */
const MUSIC_GAIN = 0.16;
/** How far a loop drops again while a line is spoken, and how fast it gets there (a time constant, in seconds). */
const DUCK = 0.5;
const DUCK_SECONDS = 0.12;
/** How fast a volume change or a pause takes hold (a time constant), and how long after a pause the clip stops moving. */
const GLIDE_SECONDS = 0.05;
const PAUSE_SECONDS = 0.3;
/** A clip is never raised by more than this, so a near-silent file is not turned into noise. */
const MAX_LEVEL = 12;
/** A long clip's loudness is measured from about this many samples a channel, spread evenly, to keep loading quick. */
const MEASURED_SAMPLES = 200_000;
/** How long one scene takes to fade into the next. */
const FADE_SECONDS = 1;
/** A sting starts at once: a slow fade would swallow its first note. */
const STING_FADE_SECONDS = 0.05;
/** A faded-out clip is stopped this long after its fade ends. */
const STOP_MARGIN_SECONDS = 0.05;
/** Samples quieter than this at either end of a clip are MP3 padding, not sound. */
const SILENCE = 0.0002;

const SCENES: Readonly<Record<MusicScene, SceneSpec>> = {
  // The cave sits about 4 dB under the battle music. The committed clip is very quiet (RMS 0.0098), so it is raised about ten times.
  menu: { loudness: 0.1, fadeIn: FADE_SECONDS, loop: { seam: 2 } },
  // The battle clip repeats its rhythm every 6 seconds, so a pass of 42 seconds joins on the beat.
  fight: { loudness: 0.16, fadeIn: FADE_SECONDS, loop: { seam: 0.75, period: 42 } },
  // The stings are not dipped under the voice, so they are set a little under the battle music instead.
  win: { loudness: 0.14, fadeIn: STING_FADE_SECONDS },
  loss: { loudness: 0.14, fadeIn: STING_FADE_SECONDS },
};
const SCENE_IDS = Object.keys(SCENES) as MusicScene[];

/** Where to start a looping clip and where it wraps, in seconds. */
export interface LoopPoints {
  readonly start: number;
  readonly loopStart: number;
  readonly loopEnd: number;
}

interface Clip {
  readonly buffer: AudioBuffer;
  /** The gain that brings this clip to its scene's loudness. */
  readonly level: number;
  /** Null for a clip that plays once. */
  readonly loop: LoopPoints | null;
}

interface Rig {
  readonly context: AudioContext;
  /** Everything the music plays goes through this one gain: the music's place in the mix, the volume setting and pause. */
  readonly bus: GainNode;
  /** Loops go through this on the way to the bus. It drops while a line is spoken. Stings skip it. */
  readonly dip: GainNode;
}

interface Playing {
  readonly scene: MusicScene;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly level: number;
  readonly fadeIn: number;
  /** Context time the fade in began. */
  readonly since: number;
}

const clips = new Map<MusicScene, Clip>();
/** Undefined until the first use; null where there is no audio. */
let rig: Rig | null | undefined;
let wanted: MusicScene | null = null;
let playing: Playing | null = null;
/** Who is speaking over the music now. */
const speakers = new Set<string>();
let volume = 1;
let paused = false;

/** The scenes in an index.json that the game has music for. Anything malformed gives an empty list. */
export function listedScenes(index: unknown): readonly MusicScene[] {
  if (!Array.isArray(index)) return [];
  const listed = new Set<unknown>(index);
  return SCENE_IDS.filter((scene) => listed.has(scene));
}

/** The samples between the silence at each end of a clip: `first` is the first that sounds, `end` is one past the last. Null for a silent or empty clip. */
function soundingRange(channels: readonly Float32Array[]): { readonly first: number; readonly end: number } | null {
  const length = Math.min(...channels.map((channel) => channel.length));
  if (!Number.isFinite(length)) return null;
  const loud = (index: number): boolean => channels.some((channel) => Math.abs(channel[index] ?? 0) > SILENCE);
  let first = 0;
  while (first < length && !loud(first)) first++;
  if (first === length) return null;
  let end = length;
  while (end > first + 1 && !loud(end - 1)) end--;
  return { first, end };
}

/**
 * The gain that brings a clip to the RMS level `loudness`, measured between the silence at its ends. Never more than
 * MAX_LEVEL. A clip with nothing to measure, or a target that is not a positive number, gives 1.
 */
export function clipLevel(channels: readonly Float32Array[], loudness: number): number {
  const sound = soundingRange(channels);
  if (!sound || !(loudness > 0) || !Number.isFinite(loudness)) return 1;
  const stride = Math.max(1, Math.floor((sound.end - sound.first) / MEASURED_SAMPLES));
  let squares = 0;
  let count = 0;
  for (const channel of channels) {
    for (let i = sound.first; i < sound.end; i += stride) {
      const value = channel[i] ?? 0;
      squares += value * value;
      count++;
    }
  }
  const rms = Math.sqrt(squares / count);
  return rms > 0 && Number.isFinite(rms) ? Math.min(MAX_LEVEL, loudness / rms) : 1;
}

/**
 * Makes a clip repeat with no gap and no click. The silence an MP3 carries at each end is skipped, and the end of the
 * pass is mixed, in place, into a copy of its beginning. Played from `start` and looped between `loopStart` and
 * `loopEnd`, the clip then never crosses a cut. `period` fixes the length of one pass, for music that must join on the beat.
 */
export function seamLoop(channels: readonly Float32Array[], sampleRate: number, seam: number, period?: number): LoopPoints {
  const whole: LoopPoints = { start: 0, loopStart: 0, loopEnd: 0 };
  const sound = soundingRange(channels);
  if (!sound || sound.end - sound.first < 2 || !(sampleRate > 0)) return whole;
  const { first } = sound;
  let { end } = sound;

  const asked = Math.round(seam * sampleRate);
  let fade = asked > 0 ? asked : 0;
  const pass = period === undefined ? Number.NaN : Math.round(period * sampleRate);
  if (pass > 0 && first + pass + fade <= end) end = first + pass + fade;
  // A clip too short for the join it was given gets a shorter one, so most of it still plays clean.
  fade = Math.min(fade, Math.floor((end - first) / 4));
  for (const channel of channels) {
    for (let i = 0; i < fade; i++) {
      const angle = ((i + 0.5) / fade) * (Math.PI / 2);
      const tail = end - fade + i;
      channel[tail] = (channel[tail] ?? 0) * Math.cos(angle) + (channel[first + i] ?? 0) * Math.sin(angle);
    }
  }
  return { start: first / sampleRate, loopStart: (first + fade) / sampleRate, loopEnd: end / sampleRate };
}

function prepare(scene: MusicScene, buffer: AudioBuffer): Clip {
  const { loudness, loop } = SCENES[scene];
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const level = clipLevel(channels, loudness);
  return { buffer, level, loop: loop ? seamLoop(channels, buffer.sampleRate, loop.seam, loop.period) : null };
}

/** Fades a clip out and stops it once it is silent. */
function release({ context }: Rig, { source, gain, level, fadeIn, since }: Playing): void {
  try {
    const now = context.currentTime;
    const reached = level * Math.min(1, Math.max(0, (now - since) / fadeIn));
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(reached, now);
    gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    source.stop(now + FADE_SECONDS + STOP_MARGIN_SECONDS);
  } catch (error) {
    // The next scene must still start, so a clip that will not stop is only reported.
    log("warn", "music.stopFailed", error);
  }
}

function begin({ context, bus, dip }: Rig, scene: MusicScene, { buffer, level, loop }: Clip): Playing {
  const { fadeIn } = SCENES[scene];
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
  gain.gain.linearRampToValueAtTime(level, now + fadeIn);
  // A sting is short and is the point of its moment, so it does not drop under the voice the way a loop does.
  source.connect(gain).connect(loop ? dip : bus);
  source.start(now, loop?.start ?? 0);
  return { scene, source, gain, level, fadeIn, since: now };
}

/** Brings what is heard in line with the wanted scene. Safe to call at any time, any number of times. */
function sync(active: Rig): void {
  try {
    if (playing && playing.scene !== wanted) {
      const old = playing;
      playing = null;
      release(active, old);
    }
    // While paused nothing new starts. resumeMusic runs this again.
    if (wanted === null || playing || paused) return;
    if (active.context.state !== "running") {
      // Held back until a click or key press. The context reports the change, and this runs again then.
      active.context.resume().catch(() => undefined);
      return;
    }
    const clip = clips.get(wanted);
    // Not loaded yet (this runs again when it is), or missing: silence.
    if (clip) playing = begin(active, wanted, clip);
  } catch (error) {
    log("warn", "music.playFailed", error);
  }
}

async function loadClip(active: Rig, scene: MusicScene): Promise<void> {
  try {
    const response = await fetch(`${CLIP_DIR}/${scene}.mp3`);
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    clips.set(scene, prepare(scene, await active.context.decodeAudioData(await response.arrayBuffer())));
    sync(active);
  } catch (error) {
    log("warn", "music.clipFailed", { scene, reason: error instanceof Error ? error.message : String(error) });
  }
}

async function loadClips(active: Rig): Promise<void> {
  try {
    const response = await fetch(`${CLIP_DIR}/index.json`);
    if (!response.ok) return;
    const index: unknown = await response.json();
    await Promise.all(listedScenes(index).map((scene) => loadClip(active, scene)));
  } catch (error) {
    log("warn", "music.indexFailed", error);
  }
}

function busLevel(): number {
  return paused ? 0 : MUSIC_GAIN * volume;
}

function dipLevel(): number {
  return speakers.size > 0 ? DUCK : 1;
}

/** Moves a gain to a new level without a click. */
function glide({ context }: Rig, gain: GainNode, level: number, seconds: number): void {
  try {
    gain.gain.setTargetAtTime(level, context.currentTime, seconds);
  } catch (error) {
    log("warn", "music.gainFailed", error);
  }
}

function createRig(): Rig | null {
  try {
    const context = sharedAudioContext();
    if (!context) return null;
    const bus = context.createGain();
    bus.gain.value = busLevel();
    bus.connect(context.destination);
    const dip = context.createGain();
    dip.gain.value = dipLevel();
    dip.connect(bus);
    const active = { context, bus, dip };
    context.addEventListener("statechange", () => {
      sync(active);
    });
    void loadClips(active);
    return active;
  } catch (error) {
    log("warn", "music.unavailable", error);
    return null;
  }
}

/**
 * Fades to the music for a scene: "menu" (cave ambience, looped), "fight" (battle music, looped), "win" or "loss"
 * (a short sting, played once). Asking for the scene already wanted does nothing, so this can be called on every render.
 */
export function startMusic(scene: MusicScene): void {
  try {
    if (!(scene in SCENES) || scene === wanted) return;
    wanted = scene;
    if (rig === undefined) rig = createRig();
    if (rig) sync(rig);
  } catch (error) {
    log("warn", "music.startFailed", error);
  }
}

/** Fades the music out. */
export function stopMusic(): void {
  wanted = null;
  if (rig) sync(rig);
}

/**
 * Dips the looping music while something is being said over it, and brings it back once nobody is speaking. The voice
 * calls this itself. Anything else that speaks passes its own name as `who`, so one speaker finishing does not lift the
 * dip while another is still talking. The win and loss stings are not dipped.
 */
export function duckMusic(on: boolean, who = "voice"): void {
  if (on) speakers.add(who);
  else speakers.delete(who);
  if (rig) glide(rig, rig.dip, dipLevel(), DUCK_SECONDS);
}

/** Sets the music volume, from 0 (silent) to 1 (the default). Takes hold at once, and applies to music started later. */
export function setMusicVolume(value: number): void {
  if (Number.isNaN(value)) return;
  volume = Math.min(1, Math.max(0, value));
  if (rig) glide(rig, rig.bus, busLevel(), GLIDE_SECONDS);
}

/** Holds the music where it is, silent, until resumeMusic. A scene asked for meanwhile starts on resume. */
export function pauseMusic(): void {
  if (paused) return;
  paused = true;
  if (!rig) return;
  glide(rig, rig.bus, busLevel(), GLIDE_SECONDS);
  try {
    // The clip stops moving once it can no longer be heard, so a sting picks up where it was.
    playing?.source.playbackRate.setValueAtTime(0, rig.context.currentTime + PAUSE_SECONDS);
  } catch (error) {
    log("warn", "music.pauseFailed", error);
  }
}

/** Carries on after pauseMusic. */
export function resumeMusic(): void {
  if (!paused) return;
  paused = false;
  if (!rig) return;
  try {
    const now = rig.context.currentTime;
    playing?.source.playbackRate.cancelScheduledValues(now);
    playing?.source.playbackRate.setValueAtTime(1, now);
  } catch (error) {
    log("warn", "music.resumeFailed", error);
  }
  glide(rig, rig.bus, busLevel(), GLIDE_SECONDS);
  sync(rig);
}

watchVoice(duckMusic);
