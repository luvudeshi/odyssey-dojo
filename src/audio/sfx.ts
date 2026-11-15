// Combat sound: plays a clip file from public/audio/sfx when index.json lists one, else the built-in synthesised clip.
// To add a real clip, drop <type>.mp3 into public/audio/sfx and add "<type>" to index.json there.
import { log } from "../core/log";
import type { CombatEvent } from "../core/types";
import { getSettings } from "../settings/store";
import type { ClipRender } from "./sfxSynth";
import { SFX_TYPES, startClip } from "./sfxSynth";
import { tabHidden, watchTab } from "./tab";

interface Player {
  readonly context: AudioContext;
  readonly master: GainNode;
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

/** Every combat event. A clip file can exist for any of them; only some also have a synthesised sound. */
const EVENTS: Readonly<Record<CombatEvent["type"], true>> = {
  telegraph: true, defended: true, playerHit: true, opening: true, enemyHit: true, phaseChanged: true,
  finished: true, powerUnleashed: true, whiffed: true, won: true, lost: true,
};
const EVENT_TYPES = Object.keys(EVENTS) as CombatEvent["type"][];
const SYNTHESISED: ReadonlySet<string> = new Set(SFX_TYPES);
const clips = new Map<string, AudioBuffer>();
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

async function loadClips(context: AudioContext): Promise<void> {
  try {
    const response = await fetch(`${CLIP_DIR}/index.json`);
    if (!response.ok) return;
    const index: unknown = await response.json();
    await Promise.all(listedClips(index).map((type) => loadClip(context, type)));
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
    void loadClips(context);
    warmUp(context);
    unlockOnGesture(context);
    quietWhileHidden(context);
    return { context, master };
  } catch (error) {
    log("warn", "sfx.unavailable", error);
    return null;
  }
}

function start({ context, master }: Player, type: CombatEvent["type"]): void {
  try {
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

export function playEvent(event: CombatEvent): void {
  const { type } = event;
  if (!(type in EVENTS)) return;
  // A hidden tab stays silent, and asking the context to run again there would bring the music back with it.
  if (tabHidden()) return;
  if (type === "powerUnleashed" && powerSound?.()) return;
  if (override?.(event)) return;
  const active = sharedPlayer();
  if (!active) return;
  if (active.context.state === "running") {
    start(active, type);
    return;
  }
  // Suspended until the browser allows audio. Sounds queued behind a long wait would all fire at once, so those are dropped.
  const asked = performance.now();
  active.context.resume().then(
    () => {
      if (performance.now() - asked < STALE_MS) start(active, type);
    },
    () => undefined,
  );
}
