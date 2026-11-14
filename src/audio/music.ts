// Background music: one clip per scene from public/audio/music, crossfaded when the scene changes.
// Only clips listed in index.json there are requested. A missing file, no audio or a blocked context means silence, never an error.
// To replace a clip, drop <scene>.mp3 into public/audio/music (or run "genClips.ts music") and keep "<scene>" in index.json.
import { log } from "../core/log";
import { sharedAudioContext } from "./sfx";
import { watchVoice } from "./voice";

export type MusicScene = "menu" | "fight" | "win" | "loss";

interface SceneSpec {
  /** How loud the clip plays, on top of MUSIC_GAIN. Evens out how loud the files are. */
  readonly level: number;
  /** Seconds the scene takes to fade in. */
  readonly fadeIn: number;
  /** Set for a clip that repeats: how long the join is, and how long one pass is when that must land on the beat. */
  readonly loop?: { readonly seam: number; readonly period?: number };
}

const CLIP_DIR = "/audio/music";
/** Effects play through a gain of 0.5 and the voice at full level; music sits well under both. */
const MUSIC_GAIN = 0.16;
/** How far the music drops again while a line is spoken, and how fast it gets there (a time constant, in seconds). */
const DUCK = 0.5;
const DUCK_SECONDS = 0.12;
/** How long one scene takes to fade into the next. */
const FADE_SECONDS = 1;
/** A sting starts at once: a slow fade would swallow its first note. */
const STING_FADE_SECONDS = 0.05;
/** A faded-out clip is stopped this long after its fade ends. */
const STOP_MARGIN_SECONDS = 0.05;
/** Samples quieter than this at either end of a clip are MP3 padding, not sound. */
const SILENCE = 0.0002;

const SCENES: Readonly<Record<MusicScene, SceneSpec>> = {
  // The cave clip came out about 25 dB quieter than the music clips, so it is raised to sit a little under them.
  menu: { level: 10, fadeIn: FADE_SECONDS, loop: { seam: 2 } },
  // The battle clip repeats its rhythm every 6 seconds, so a pass of 42 seconds joins on the beat.
  fight: { level: 1, fadeIn: FADE_SECONDS, loop: { seam: 0.75, period: 42 } },
  win: { level: 1.25, fadeIn: STING_FADE_SECONDS },
  loss: { level: 1.25, fadeIn: STING_FADE_SECONDS },
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
  /** Null for a clip that plays once. */
  readonly loop: LoopPoints | null;
}

interface Rig {
  readonly context: AudioContext;
  /** Everything the music plays goes through this one gain. */
  readonly bus: GainNode;
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
let ducked = false;

/** The scenes in an index.json that the game has music for. Anything malformed gives an empty list. */
export function listedScenes(index: unknown): readonly MusicScene[] {
  if (!Array.isArray(index)) return [];
  const listed = new Set<unknown>(index);
  return SCENE_IDS.filter((scene) => listed.has(scene));
}

/**
 * Makes a clip repeat with no gap and no click. The silence an MP3 carries at each end is skipped, and the end of the
 * pass is mixed, in place, into a copy of its beginning. Played from `start` and looped between `loopStart` and
 * `loopEnd`, the clip then never crosses a cut. `period` fixes the length of one pass, for music that must join on the beat.
 */
export function seamLoop(channels: readonly Float32Array[], sampleRate: number, seam: number, period?: number): LoopPoints {
  const whole: LoopPoints = { start: 0, loopStart: 0, loopEnd: 0 };
  const length = Math.min(...channels.map((channel) => channel.length));
  if (!Number.isFinite(length) || length < 2 || !(sampleRate > 0)) return whole;
  const loud = (index: number): boolean => channels.some((channel) => Math.abs(channel[index] ?? 0) > SILENCE);
  let first = 0;
  while (first < length && !loud(first)) first++;
  if (first === length) return whole;
  let end = length;
  while (!loud(end - 1)) end--;

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
  const { loop } = SCENES[scene];
  if (!loop) return { buffer, loop: null };
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  return { buffer, loop: seamLoop(channels, buffer.sampleRate, loop.seam, loop.period) };
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

function begin({ context, bus }: Rig, scene: MusicScene, { buffer, loop }: Clip): Playing {
  const { level, fadeIn } = SCENES[scene];
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
  source.connect(gain).connect(bus);
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
    if (wanted === null || playing) return;
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

function createRig(): Rig | null {
  try {
    const context = sharedAudioContext();
    if (!context) return null;
    const bus = context.createGain();
    bus.gain.value = MUSIC_GAIN * (ducked ? DUCK : 1);
    bus.connect(context.destination);
    const active = { context, bus };
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

/** Dips the music while something is being said over it, and brings it back after. The voice calls this itself. */
export function duckMusic(on: boolean): void {
  ducked = on;
  if (!rig) return;
  try {
    rig.bus.gain.setTargetAtTime(MUSIC_GAIN * (on ? DUCK : 1), rig.context.currentTime, DUCK_SECONDS);
  } catch (error) {
    log("warn", "music.duckFailed", error);
  }
}

watchVoice(duckMusic);
