// Athena's voice: turns combat events into spoken lines, one at a time, and stays silent when a clip is missing.
import type { CombatEvent, CombatPhase } from "../core/types";
import { log } from "../core/log";
import { getSettings } from "../settings/store";
import { clipUrl, phaseLineId } from "./athenaLines";
import { pickTaunt, STORY_INDEX_URLS, storyClipUrl } from "./narrationLines";

const PRAISE = ["praise_1", "praise_2", "praise_3"] as const;
const WARNINGS = ["warn_1", "warn_2", "warn_3"] as const;
const INDEX_URL = "/audio/athena/index.json";
/** Longer than any line: a clip that neither ends nor fails is given up on after this. */
const MAX_CLIP_MS = 15000;
/** How loud a monster's taunt is next to Athena: a little under her, so her call stays clear on top of it. */
export const TAUNT_VOLUME = 0.7;

function pick(ids: readonly [string, ...string[]], random: () => number): string {
  return ids[Math.floor(random() * ids.length)] ?? ids[0];
}

/** The line a combat event calls for, or null. Event types this file does not know are ignored. */
export function lineFor(event: CombatEvent, random: () => number): string | null {
  switch (event.type) {
    case "telegraph":
      return `call_${event.attack.counter}`;
    case "opening":
      return `call_${event.move}`;
    case "enemyHit":
      return pick(PRAISE, random);
    case "playerHit":
      return pick(WARNINGS, random);
    case "phaseChanged":
      // Index 0 is where the fight starts; only later phases get a line, picked by the phase's own name.
      return event.index > 0 ? phaseLineId(event.name) : null;
    case "won":
      return "win";
    case "lost":
      return "loss";
    // "defended" is silent on purpose: the opening call follows in the same frame and matters more.
    default:
      return null;
  }
}

/** Tiers of urgency, lowest first: praise and warnings, fight start and Homer, calls, phase changes, the result. */
const SHORT = 0;
const MOMENT = 1;
const CALL = 2;
const PHASE = 3;
const RESULT = 4;

function urgency(id: string): number {
  if (id === "win" || id === "loss") return RESULT;
  // A phase line comes once or twice a fight and the calls never stop, so it outranks them or it is never heard.
  if (id.startsWith("phase_")) return PHASE;
  if (id.startsWith("call_")) return CALL;
  // Homer's lines sit with the fight start; a taunt sent to this voice is as easily talked over as praise.
  return id === "fight_start" || id.startsWith("homer_") ? MOMENT : SHORT;
}

/** Whether a new line cuts off the one playing. Otherwise the new line is skipped. */
function interrupts(next: string, playing: string): boolean {
  const tier = urgency(next);
  // The engine emits nothing after the result, so a call or fight start heard over it belongs to the next fight.
  const held = urgency(playing);
  if (held === RESULT) return tier === CALL || next === "fight_start";
  // A new fight's first line is not kept out by the last fight's phase line (a retry from the pause menu).
  if (held === PHASE && next === "fight_start") return true;
  // A newer call beats an older one, whose beat has passed, and a newer phase line beats an older one. A call does not
  // beat a phase line, which is heard to its end: the call is dropped, not queued, and the prompt card shows the move.
  return tier > held || (tier === held && (tier === CALL || tier === PHASE));
}

export interface VoiceDeps {
  /** Whether a clip exists for this line. Lines without one are never requested. */
  readonly available: (id: string) => boolean;
  /** Starts a clip and returns how to stop it. `done` must be called when it ends or fails; extra calls are harmless. */
  readonly play: (id: string, done: () => void) => () => void;
  readonly random: () => number;
}

/** What to say when a move has no call of its own, so a move a teammate adds later is never met with silence. */
export function anyCall(id: string, kind: "defend" | "strike"): string {
  return kind === "defend" ? "call_any_defend" : "call_any_strike";
}

export interface Voice {
  /**
   * Speaks the most urgent line this frame's events call for, if the voice is free for it.
   * Pass the fight's phase too: the finishing move starts with no event of its own, so that is how its call is known.
   */
  handle(events: readonly CombatEvent[], phase?: CombatPhase): void;
  /** True when the line started playing. */
  speak(id: string): boolean;
  /** The line being spoken now, or null when the voice is free. */
  playing(): string | null;
  /** Cuts this line off if it is the one being spoken. Any other line plays on. */
  stop(id: string): void;
  dispose(): void;
}

/** Told true when a line starts and false when that voice falls quiet. `who` is set for a voice that was given a name. */
let onSpeaking: (speaking: boolean, who?: string) => void = () => undefined;

/**
 * Lets one listener (the music) know when a line is being spoken, so it can dip under it.
 * A second Voice must give `createVoice` a name of its own, as the monsters' channel below does: two voices under one
 * name would report silence when one falls quiet while the other still speaks.
 */
export function watchVoice(listener: (speaking: boolean, who?: string) => void): void {
  onSpeaking = listener;
}

export function createVoice(deps: VoiceDeps = browserDeps(), who?: string): Voice {
  let current: { readonly id: string; stop: () => void } | null = null;
  let disposed = false;
  let finishing = false;

  const speak = (id: string): boolean => {
    if (disposed || !deps.available(id)) return false;
    if (current && !interrupts(id, current.id)) return false;
    // Stop before starting, so two lines are never heard together.
    current?.stop();
    const line = { id, stop: (): void => undefined };
    const free = (): void => {
      if (current !== line) return;
      current = null;
      onSpeaking(false, who);
    };
    current = line;
    onSpeaking(true, who);
    try {
      line.stop = deps.play(id, free);
    } catch (error) {
      log("warn", "voice.play", error);
      free();
    }
    return current === line;
  };

  return {
    speak,
    handle(events, phase) {
      const wanted: string[] = [];
      for (const event of events) {
        const id = lineFor(event, deps.random);
        if (id === null) continue;
        const missing = id.startsWith("call_") && !deps.available(id);
        wanted.push(missing ? anyCall(id, event.type === "telegraph" ? "defend" : "strike") : id);
      }
      // The finisher is called when it begins, and again each time its window runs out.
      if (phase?.kind === "finisher" && (!finishing || events.some((event) => event.type === "whiffed"))) {
        const call = `call_${phase.move}`;
        wanted.push(deps.available(call) ? call : anyCall(call, "strike"));
      }
      const best = wanted.reduce<string | null>((top, id) => (top === null || urgency(id) > urgency(top) ? id : top), null);
      if (best !== null) speak(best);
      // A phase line holding the voice keeps the finisher's call out, so the call is tried again until it is spoken.
      finishing = phase?.kind === "finisher" && urgency(current?.id ?? "") !== PHASE;
    },
    playing: () => current?.id ?? null,
    stop(id) {
      if (current?.id !== id) return;
      current.stop();
      current = null;
      onSpeaking(false, who);
    },
    dispose() {
      disposed = true;
      current?.stop();
      if (current) onSpeaking(false, who);
      current = null;
    },
  };
}

/** The ids listed in index.json. Anything that is not a list of strings counts as no clips. */
export function parseClipIndex(data: unknown): ReadonlySet<string> {
  const ids: unknown[] = Array.isArray(data) ? data : [];
  return new Set(ids.filter((id) => typeof id === "string"));
}

/** The part of HTMLAudioElement the voice needs, so tests can stand in for it. */
export interface ClipAudio {
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "ended" | "error", listener: () => void): void;
}

/** Plays clips through audio elements. A failed load or a blocked play() reports done, so the voice is never left waiting. */
export function audioPlayer(open: (url: string) => ClipAudio): VoiceDeps["play"] {
  return (id, done) => {
    // Homer's and the monsters' clips have folders of their own; every other id is Athena's.
    const audio = open(storyClipUrl(id));
    const timer = setTimeout(() => {
      audio.pause();
      done();
    }, MAX_CLIP_MS);
    const finish = (): void => {
      clearTimeout(timer);
      done();
    };
    audio.addEventListener("ended", finish);
    audio.addEventListener("error", finish);
    audio.play().catch((error: unknown) => {
      log("warn", "voice.blocked", error);
      finish();
    });
    return () => {
      clearTimeout(timer);
      audio.pause();
    };
  };
}

/**
 * Plays the clips Athena's index lists. `storyIndexes` are further index files whose clips can be spoken too.
 * Those clips are not fetched ahead of time: a story line can start a moment late, a call cannot.
 */
export function browserDeps(storyIndexes: readonly string[] = []): VoiceDeps {
  if (typeof Audio === "undefined" || typeof fetch === "undefined") {
    return { available: () => false, play: () => () => undefined, random: Math.random };
  }
  let clips: ReadonlySet<string> = new Set();
  const warmed: HTMLAudioElement[] = [];
  const load = (url: string, warm: boolean): void => {
    fetch(url)
      .then((response): Promise<unknown> => (response.ok ? response.json() : Promise.resolve([])))
      .then((data) => {
        const listed = parseClipIndex(data);
        clips = new Set([...clips, ...listed]);
        // Fetch every listed clip now, so a call is not late the first time it is spoken. Kept so the loads are not dropped.
        if (warm) for (const id of listed) warmed.push(new Audio(clipUrl(id)));
      })
      .catch((error: unknown) => {
        log("warn", "voice.index", error);
      });
  };
  load(INDEX_URL, true);
  for (const url of storyIndexes) load(url, false);
  return { available: (id) => clips.has(id), play: audioPlayer((url) => Object.assign(new Audio(url), { volume: getSettings().voiceVolume })), random: Math.random };
}

/** The same clips at `gain` times the volume, through audio elements that no other voice's line stops. */
function quieter(deps: VoiceDeps, gain: number): VoiceDeps {
  if (typeof Audio === "undefined") return deps;
  return { ...deps, play: audioPlayer((url) => Object.assign(new Audio(url), { volume: getSettings().voiceVolume * gain })) };
}

// Created with the module so the clip indexes are loaded before the first fight starts.
const sharedDeps = browserDeps(STORY_INDEX_URLS);
const shared = createVoice(sharedDeps);

/**
 * The monsters' own channel: a taunt plays over Athena's calls and is not cut by them, and it never holds her voice.
 * One taunt at a time: a second one asked for while the first plays is refused.
 */
export const tauntVoice: Pick<Voice, "speak" | "playing" | "stop"> = createVoice(quieter(sharedDeps, TAUNT_VOLUME), "taunt");

/** Silences the monster, whatever it is saying. */
function stopTaunt(): void {
  const id = tauntVoice.playing();
  if (id !== null) tauntVoice.stop(id);
}

export function playVoice(events: readonly CombatEvent[], phase?: CombatPhase): void {
  // The monster falls silent when the fight ends, so the result lines are heard clean.
  if (events.some((event) => event.type === "won" || event.type === "lost")) stopTaunt();
  shared.handle(events, phase);
}

/** For lines no combat event triggers, such as "fight_start" or Homer's "homer_title". */
export function speakLine(id: string): boolean {
  return shared.speak(id);
}

/**
 * Has the monster taunt the player on its own channel, if it has a taunt recorded and is not already taunting.
 * Works for every stop of the quest. speakMonsterTaunt in storyVoice.ts does the same and says when the taunt is over.
 */
export function speakTaunt(enemyId: string): boolean {
  const id = pickTaunt(enemyId, Math.random);
  return id !== null && tauntVoice.speak(id);
}

/** The line the shared voice is speaking now, or null. */
export function voicePlaying(): string | null {
  return shared.playing();
}

/** Cuts this line off if the shared voice is speaking it. */
export function stopLine(id: string): void {
  shared.stop(id);
}
