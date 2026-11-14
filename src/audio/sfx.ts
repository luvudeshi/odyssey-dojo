// Combat sound: plays a clip file from public/audio/sfx when index.json lists one, else the built-in synthesised clip.
// To add a real clip, drop <type>.mp3 into public/audio/sfx and add "<type>" to index.json there.
import { log } from "../core/log";
import type { CombatEvent } from "../core/types";
import { SFX_TYPES, synthClip } from "./sfxSynth";

interface Player {
  readonly context: AudioContext;
  readonly master: GainNode;
}

const CLIP_DIR = "/audio/sfx";
const MASTER_GAIN = 0.5;
/** How loud each event sits in the mix; unlisted ones play at full level. */
const LEVELS: Readonly<Partial<Record<string, number>>> = {
  telegraph: 0.6,
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
const WARM_UP_GAP_MS = 40;

const KNOWN: ReadonlySet<string> = new Set(SFX_TYPES);
const clips = new Map<string, AudioBuffer>();
const synths = new Map<string, AudioBuffer>();
let player: Player | null = null;
let tried = false;

/** The event types in an index.json that the game has a use for. Anything malformed gives an empty list. */
export function listedClips(index: unknown): readonly CombatEvent["type"][] {
  if (!Array.isArray(index)) return [];
  const listed = new Set<unknown>(index);
  return SFX_TYPES.filter((type) => listed.has(type));
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

function synthBuffer(context: AudioContext, type: CombatEvent["type"]): AudioBuffer {
  const cached = synths.get(type);
  if (cached) return cached;
  const samples = synthClip(type, context.sampleRate);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.getChannelData(0).set(samples);
  synths.set(type, buffer);
  return buffer;
}

/** Builds the remaining synthesised clips one at a time with gaps, so no frame of the fight pays for all of them. */
function warmUp(context: AudioContext): void {
  const pending = [...SFX_TYPES];
  const next = (): void => {
    const type = pending.shift();
    if (type === undefined) return;
    try {
      synthBuffer(context, type);
    } catch (error) {
      log("warn", "sfx.synthFailed", error);
    }
    setTimeout(next, WARM_UP_GAP_MS);
  };
  setTimeout(next, WARM_UP_GAP_MS);
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
    return { context, master };
  } catch (error) {
    log("warn", "sfx.unavailable", error);
    return null;
  }
}

function start({ context, master }: Player, type: CombatEvent["type"]): void {
  try {
    const source = context.createBufferSource();
    source.buffer = clips.get(type) ?? synthBuffer(context, type);
    if (VARIED.has(type)) source.playbackRate.value = 1 + (Math.random() * 2 - 1) * RATE_SPREAD;
    const level = context.createGain();
    level.gain.value = LEVELS[type] ?? 1;
    source.connect(level).connect(master);
    source.start();
  } catch (error) {
    log("warn", "sfx.playFailed", error);
  }
}

export function playEvent(event: CombatEvent): void {
  const { type } = event;
  if (!KNOWN.has(type)) return;
  if (!tried) {
    tried = true;
    player = createPlayer();
  }
  const active = player;
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
