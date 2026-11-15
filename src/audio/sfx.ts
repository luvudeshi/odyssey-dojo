// Combat sound: plays a clip file from public/audio/sfx when index.json lists one, else the built-in synthesised clip.
// To add a real clip, drop <type>.mp3 into public/audio/sfx and add "<type>" to index.json there.
// The same folder holds the chime for an unlocked achievement (playUnlock), one sound for each kind of defend, which
// a "defended" event plays in place of its own clip, and the war horn a change of phase sounds over its drum hit
// (cues.ts names them all and says how loud each is).
import { log } from "../core/log";
import type { CombatEvent } from "../core/types";
import { getSettings } from "../settings/store";
import type { Cue, CueShape } from "./cues";
import {
  CUE_CLIPS, DEFEND_GAIN, defendClipFor, isPhaseChange, listedCues, PHASE_CLIP, PHASE_DRUM_CLIP, PHASE_DRUM_GAIN, PHASE_GAIN,
  PHASE_SHAPE, prepareCue, UNLOCK_CLIP, UNLOCK_GAIN,
} from "./cues";
import type { ClipRender } from "./sfxSynth";
import { SFX_TYPES, startClip } from "./sfxSynth";
import { tabHidden, watchTab } from "./tab";

interface Player {
  readonly context: AudioContext;
  readonly master: GainNode;
  /** Settles once every listed clip file has been read, or has failed to be. */
  readonly loaded: Promise<void>;
}

const CLIP_DIR = "/audio/sfx";
const MASTER_GAIN = 0.5;
/** How loud each event sits in the mix; unlisted ones play at full level. */
const LEVELS: Readonly<Partial<Record<string, number>>> = {
  telegraph: 0.85,
  opening: 0.5,
  whiffed: 0.55,
  defended: 0.8,
  won: 0.85,
  lost: 0.85,
};
/** Events that repeat often enough to need a slightly different pitch each time. */
const VARIED: ReadonlySet<string> = new Set(["enemyHit", "playerHit"]);
const RATE_SPREAD = 0.04;
/** A sound that had to wait this long for the browser to allow audio is dropped rather than played late. */
const STALE_MS = 200;
/** Warm-up renders this many samples per step (a few milliseconds of work), then waits before the next step. */
const WARM_UP_SAMPLES = 4000;
const WARM_UP_GAP_MS = 12;
/** What counts as a user gesture for starting audio. */
const GESTURES = ["pointerdown", "keydown"] as const;
/** The unlock chime waits this long for audio to start and its file to load. Later than that it would no longer go with the notice. */
const UNLOCK_WAIT_MS = 1000;
/** A second chime asked for this soon after one is not played: several achievements at once sound as one. */
const UNLOCK_GAP_MS = 1000;

/** Every combat event. A clip file can exist for any of them; only some also have a synthesised sound. */
const EVENTS: Readonly<Record<CombatEvent["type"], true>> = {
  telegraph: true, defended: true, playerHit: true, opening: true, enemyHit: true, phaseChanged: true,
  finished: true, powerUnleashed: true, whiffed: true, won: true, lost: true,
};
const EVENT_TYPES = Object.keys(EVENTS) as CombatEvent["type"][];
const SYNTHESISED: ReadonlySet<string> = new Set(SFX_TYPES);
const clips = new Map<string, AudioBuffer>();
/** The unlock chime, the defend sounds and the two phase sounds that have loaded, by clip name (cues.ts). */
const cues = new Map<string, Cue<AudioBuffer>>();
const synths = new Map<string, AudioBuffer>();
/** Synthesised clips that are partly rendered. */
const renders = new Map<string, ClipRender>();
let player: Player | null = null;
let tried = false;

/** The event types in an index.json that the game has a use for. Anything malformed gives an empty list. */
export function listedClips(index: unknown): readonly CombatEvent["type"][] {
  if (!Array.isArray(index)) return [];
  const listed = new Set<unknown>(index);
  return EVENT_TYPES.filter((type) => listed.has(type));
}

async function loadClip(context: AudioContext, type: string): Promise<void> {
  try {
    const response = await fetch(`${CLIP_DIR}/${type}.mp3`);
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    clips.set(type, await context.decodeAudioData(await response.arrayBuffer()));
  } catch (error) {
    log("warn", "sfx.clipFailed", { type, reason: error instanceof Error ? error.message : String(error) });
  }
}

async function loadCue(context: AudioContext, name: string): Promise<void> {
  try {
    const response = await fetch(`${CLIP_DIR}/${name}.mp3`);
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    cues.set(name, prepareCue(await context.decodeAudioData(await response.arrayBuffer())));
  } catch (error) {
    log("warn", "sfx.clipFailed", { type: name, reason: error instanceof Error ? error.message : String(error) });
  }
}

async function loadClips(context: AudioContext): Promise<void> {
  try {
    const response = await fetch(`${CLIP_DIR}/index.json`);
    if (!response.ok) return;
    const index: unknown = await response.json();
    await Promise.all([
      // A clip of cues.ts is loaded once, as a cue: the phase change's drum hit is both an event's clip and one of those.
      ...listedClips(index).filter((type) => !CUE_CLIPS.includes(type)).map((type) => loadClip(context, type)),
      ...listedCues(index).map((name) => loadCue(context, name)),
    ]);
  } catch (error) {
    log("warn", "sfx.indexFailed", error);
  }
}

/** The synthesised clip for a type, built once. Renders at most `budget` more samples of it, and gives null until it is whole. */
function synthBuffer(context: AudioContext, type: CombatEvent["type"], budget: number): AudioBuffer | null {
  const cached = synths.get(type);
  if (cached) return cached;
  const render = renders.get(type) ?? startClip(type, context.sampleRate);
  renders.set(type, render);
  if (!render.advance(budget)) return null;
  const buffer = context.createBuffer(1, render.samples.length, context.sampleRate);
  buffer.getChannelData(0).set(render.samples);
  synths.set(type, buffer);
  renders.delete(type);
  return buffer;
}

/** Builds the synthesised clips ahead of need, a small slice at a time, so no frame of the fight waits on a whole clip. */
function warmUp(context: AudioContext): void {
  const pending = [...SFX_TYPES];
  const next = (): void => {
    const type = pending[0];
    if (type === undefined) return;
    try {
      if (synthBuffer(context, type, WARM_UP_SAMPLES)) pending.shift();
    } catch (error) {
      log("warn", "sfx.synthFailed", error);
      pending.shift();
    }
    setTimeout(next, WARM_UP_GAP_MS);
  };
  setTimeout(next, WARM_UP_GAP_MS);
}

/** Safari only starts audio from inside a click or key press, so the first one that gets it running does the unlocking. */
function unlockOnGesture(context: AudioContext): void {
  if (typeof window === "undefined") return;
  const unlock = (): void => {
    context.resume().then(
      () => {
        if (context.state !== "running") return;
        for (const gesture of GESTURES) window.removeEventListener(gesture, unlock);
      },
      () => undefined,
    );
  };
  for (const gesture of GESTURES) window.addEventListener(gesture, unlock);
}

/**
 * Stops the context's clock while the tab is hidden, and starts it again when the tab is back. Everything that plays
 * through the context (effects, music, a stop's ambience) falls silent with it and carries on from where it was.
 */
function quietWhileHidden(context: AudioContext): void {
  const follow = (hidden: boolean): void => {
    try {
      (hidden ? context.suspend() : context.resume()).catch(() => undefined);
    } catch (error) {
      log("warn", "sfx.tabFailed", error);
    }
  };
  watchTab(follow);
  if (tabHidden()) follow(true);
}

function createPlayer(): Player | null {
  if (typeof AudioContext === "undefined") return null;
  try {
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(context.destination);
    const loaded = loadClips(context);
    warmUp(context);
    unlockOnGesture(context);
    quietWhileHidden(context);
    return { context, master, loaded };
  } catch (error) {
    log("warn", "sfx.unavailable", error);
    return null;
  }
}

/** A volume setting as a number from 0 to 1. Anything that is not a number counts as full. */
function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

/**
 * Plays one of the clips of cues.ts, levelled and from its first sound. With a `shape` it starts at that gain and
 * drops to the shape's tail after its hold. Returns false when it is not loaded or will not start.
 */
function startCue({ context }: Player, name: string | null, gain: number, shape?: CueShape): boolean {
  try {
    const cue = name === null ? undefined : cues.get(name);
    if (!cue) return false;
    const source = context.createBufferSource();
    source.buffer = cue.buffer;
    const level = context.createGain();
    const full = cue.level * gain * unit(getSettings().sfxVolume);
    level.gain.value = full;
    if (shape) {
      // A browser that will not take the shape still plays the clip, at its starting gain throughout.
      try {
        const now = context.currentTime;
        level.gain.setValueAtTime(full, now);
        level.gain.setTargetAtTime(full * shape.tail, now + shape.holdSeconds, shape.fallSeconds);
      } catch (error) {
        log("warn", "sfx.shapeFailed", error);
      }
    }
    source.connect(level).connect(context.destination);
    source.start(0, cue.offset);
    return true;
  } catch (error) {
    log("warn", "sfx.cueFailed", error);
    return false;
  }
}

function start(player: Player, event: CombatEvent): void {
  const { context, master } = player;
  const { type } = event;
  try {
    // A defend sounds like what was done: a dodge, a block, a duck or a jump. With no clip for it, the usual sound below.
    if (event.type === "defended" && startCue(player, defendClipFor(event), DEFEND_GAIN)) return;
    // A change of phase lands on a drum hit, levelled so that it is heard. The horn over it is started by playEvent.
    if (event.type === "phaseChanged" && startCue(player, PHASE_DRUM_CLIP, PHASE_DRUM_GAIN)) return;
    // An event with neither a clip file nor a synthesised design stays silent.
    const buffer = clips.get(type) ?? (SYNTHESISED.has(type) ? synthBuffer(context, type, Number.POSITIVE_INFINITY) : null);
    if (buffer === null) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    if (VARIED.has(type)) source.playbackRate.value = 1 + (Math.random() * 2 - 1) * RATE_SPREAD;
    const level = context.createGain();
    level.gain.value = (LEVELS[type] ?? 1) * getSettings().sfxVolume;
    source.connect(level).connect(master);
    source.start();
  } catch (error) {
    log("warn", "sfx.playFailed", error);
  }
}

/** The player, made the first time any sound is wanted. Null where there is no audio. */
function sharedPlayer(): Player | null {
  if (!tried) {
    tried = true;
    player = createPlayer();
  }
  return player;
}

/**
 * The game's one audio context, made once and kept for the whole session: every fight, restart and map visit plays
 * through it. The music plays through it too, so the click that unlocks effects unlocks music. Nothing here closes it.
 */
export function sharedAudioContext(): AudioContext | null {
  return sharedPlayer()?.context ?? null;
}

/** A fight's own sound for an event: returns true when it played one, and the usual sound is then skipped. */
type EventOverride = (event: CombatEvent) => boolean;
let override: EventOverride | null = null;

export function setEventOverride(next: EventOverride | null): void {
  override = next;
}

/** The god's own sound for the power going off (powerSound.ts): returns true when it played, and the usual one is then skipped. */
let powerSound: (() => boolean) | null = null;

export function setPowerSound(next: (() => boolean) | null): void {
  powerSound = next;
}

/** Plays now when audio is running. Otherwise asks the browser to start it, and plays only if that came quickly. */
function whenRunning(active: Player, play: () => void): void {
  if (active.context.state === "running") {
    play();
    return;
  }
  // Suspended until the browser allows audio. Sounds queued behind a long wait would all fire at once, so those are dropped.
  const asked = performance.now();
  active.context.resume().then(
    () => {
      if (performance.now() - asked < STALE_MS) play();
    },
    () => undefined,
  );
}

/**
 * The horn of a new phase. It sounds whatever else plays for the event: the drum hit, or the stop's own sound (Scylla's
 * howl, the suitors' jeer), which goes over it. It starts in the frame of Athena's phase line and stops nothing. With
 * no clip, or no audio, it is silent and the event keeps the sound it had.
 */
function playPhaseHorn(): void {
  const active = sharedPlayer();
  if (!active) return;
  whenRunning(active, () => {
    startCue(active, PHASE_CLIP, PHASE_GAIN, PHASE_SHAPE);
  });
}

export function playEvent(event: CombatEvent): void {
  const { type } = event;
  if (!(type in EVENTS)) return;
  // A hidden tab stays silent, and asking the context to run again there would bring the music back with it.
  if (tabHidden()) return;
  if (type === "powerUnleashed" && powerSound?.()) return;
  if (isPhaseChange(event)) playPhaseHorn();
  if (override?.(event)) return;
  const active = sharedPlayer();
  if (!active) return;
  whenRunning(active, () => {
    start(active, event);
  });
}

/** When the last unlock chime was asked for and let through, by the clock. */
let unlockAt = Number.NEGATIVE_INFINITY;

/**
 * The chime for an unlocked achievement. Safe to call at any time and from anywhere: it never throws and returns at
 * once. It stays silent in a hidden tab, with the effects volume at zero, where there is no audio, when the clip is
 * missing, and when audio has not started (no click or key yet) or the clip has not loaded within a second. Calls
 * that come within a second of one another give one chime. It plays beside the voice and the music and stops neither.
 */
export function playUnlock(): void {
  try {
    if (tabHidden()) return;
    if (!(unit(getSettings().sfxVolume) > 0)) return;
    const asked = performance.now();
    if (asked - unlockAt < UNLOCK_GAP_MS) return;
    const active = sharedPlayer();
    if (!active) return;
    unlockAt = asked;
    const { context, loaded } = active;
    const running = context.state === "running" ? Promise.resolve() : context.resume();
    Promise.all([running, loaded]).then(
      () => {
        if (performance.now() - asked > UNLOCK_WAIT_MS || context.state !== "running" || tabHidden()) return;
        startCue(active, UNLOCK_CLIP, UNLOCK_GAIN);
      },
      () => undefined,
    );
  } catch (error) {
    log("warn", "sfx.unlockFailed", error);
  }
}
