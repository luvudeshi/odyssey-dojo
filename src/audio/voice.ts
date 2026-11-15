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

/** Tiers of urgency, lowest first: praise and warnings, fight start and phase changes, calls, the result. */
const SHORT = 0;
const MOMENT = 1;
const CALL = 2;
const RESULT = 3;

function urgency(id: string): number {
  if (id === "win" || id === "loss") return RESULT;
  if (id.startsWith("call_")) return CALL;
  // Homer's lines sit with the phase lines; a monster's taunt is as easily talked over as praise.
  return id === "fight_start" || id.startsWith("phase_") || id.startsWith("homer_") ? MOMENT : SHORT;
}

/** Whether a new line cuts off the one playing. Otherwise the new line is skipped. */
function interrupts(next: string, playing: string): boolean {
  const tier = urgency(next);
  // The engine emits nothing after the result, so a call or fight start heard over it belongs to the next fight.
  if (urgency(playing) === RESULT) return tier === CALL || next === "fight_start";
  // A newer call always wins: the one playing is for a beat that has already passed.
  return tier === CALL || tier > urgency(playing);
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

/** Told true when a line starts and false when the voice falls quiet. */
const listeners: ((speaking: boolean) => void)[] = [];
const onSpeaking = (speaking: boolean): void => {
  for (const listener of listeners) listener(speaking);
};

/**
 * Lets a listener (the music, a stop's ambience) know when a line is being spoken, so it can dip under it.
 * This assumes the app has a single Voice (the shared one below): with two, one falling quiet would report silence
 * while the other still speaks.
 */
export function watchVoice(listener: (speaking: boolean) => void): void {
  listeners.push(listener);
}

export function createVoice(deps: VoiceDeps = browserDeps()): Voice {
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
      onSpeaking(false);
    };
    current = line;
    onSpeaking(true);
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
      finishing = phase?.kind === "finisher";
      const best = wanted.reduce<string | null>((top, id) => (top === null || urgency(id) > urgency(top) ? id : top), null);
      // The strike that call asked for has just landed, so it is stale and the phase line may take its place.
      if (best?.startsWith("phase_") && current?.id.startsWith("call_") && events.some((event) => event.type === "enemyHit")) {
        current.stop();
        current = null;
        onSpeaking(false);
      }
      if (best !== null) speak(best);
    },
    playing: () => current?.id ?? null,
    stop(id) {
      if (current?.id !== id) return;
      current.stop();
      current = null;
      onSpeaking(false);
    },
    dispose() {
      disposed = true;
      current?.stop();
      if (current) onSpeaking(false);
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

// Created with the module so the clip indexes are loaded before the first fight starts.
const shared = createVoice(browserDeps(STORY_INDEX_URLS));

export function playVoice(events: readonly CombatEvent[], phase?: CombatPhase): void {
  shared.handle(events, phase);
}

/** For lines no combat event triggers, such as "fight_start" or Homer's "homer_title". */
export function speakLine(id: string): boolean {
  return shared.speak(id);
}

/**
 * Has the monster taunt the player, if it has a taunt recorded and the voice is free. Works for every stop of the quest.
 * In the frame a phase changes, Athena's phase line cuts this off: there, use speakMonsterTaunt in storyVoice.ts.
 */
export function speakTaunt(enemyId: string): boolean {
  const id = pickTaunt(enemyId, Math.random);
  return id !== null && shared.speak(id);
}

/** The line the shared voice is speaking now, or null. */
export function voicePlaying(): string | null {
  return shared.playing();
}

/** Cuts this line off if the shared voice is speaking it. */
export function stopLine(id: string): void {
  shared.stop(id);
}
