// Athena's voice: turns combat events into spoken lines, one at a time, and stays silent when a clip is missing.
import type { CombatEvent } from "../core/types";
import { log } from "../core/log";
import { clipUrl } from "./athenaLines";

const PRAISE = ["praise_1", "praise_2", "praise_3"] as const;
const WARNINGS = ["warn_1", "warn_2", "warn_3"] as const;
const INDEX_URL = "/audio/athena/index.json";
/** Longer than any line: a clip that neither ends nor fails is given up on after this. */
const MAX_CLIP_MS = 8000;

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
    case "won":
      return "win";
    case "lost":
      return "loss";
    // "defended" is silent on purpose: the opening call follows in the same frame and matters more.
    default:
      return null;
  }
}

/** A more urgent line cuts off a less urgent one: the result beats everything, calls beat the rest. */
function urgency(id: string): number {
  if (id === "win" || id === "loss") return 2;
  return id.startsWith("call_") ? 1 : 0;
}

export interface VoiceDeps {
  /** Whether a clip exists for this line. Lines without one are never requested. */
  readonly available: (id: string) => boolean;
  /** Starts a clip and returns how to stop it. `done` must be called when it ends or fails; extra calls are harmless. */
  readonly play: (id: string, done: () => void) => () => void;
  readonly random: () => number;
}

export interface Voice {
  /** Speaks the most urgent line this frame's events call for, if the voice is free for it. */
  handle(events: readonly CombatEvent[]): void;
  /** True when the line started playing. */
  speak(id: string): boolean;
  dispose(): void;
}

export function createVoice(deps: VoiceDeps = browserDeps()): Voice {
  let current: { readonly id: string; stop: () => void } | null = null;
  let disposed = false;

  const speak = (id: string): boolean => {
    if (disposed || !deps.available(id)) return false;
    if (current && urgency(id) <= urgency(current.id)) return false;
    current?.stop();
    const line = { id, stop: (): void => undefined };
    const free = (): void => {
      if (current === line) current = null;
    };
    current = line;
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
    handle(events) {
      let best: string | null = null;
      for (const event of events) {
        const id = lineFor(event, deps.random);
        if (id !== null && (best === null || urgency(id) > urgency(best))) best = id;
      }
      if (best !== null) speak(best);
    },
    dispose() {
      disposed = true;
      current?.stop();
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
    const audio = open(clipUrl(id));
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

function browserDeps(): VoiceDeps {
  if (typeof Audio === "undefined" || typeof fetch === "undefined") {
    return { available: () => false, play: () => () => undefined, random: Math.random };
  }
  let clips: ReadonlySet<string> = new Set();
  fetch(INDEX_URL)
    .then((response): Promise<unknown> => (response.ok ? response.json() : Promise.resolve([])))
    .then((data) => {
      clips = parseClipIndex(data);
    })
    .catch((error: unknown) => {
      log("warn", "voice.index", error);
    });
  return { available: (id) => clips.has(id), play: audioPlayer((url) => new Audio(url)), random: Math.random };
}

// Created with the module so the clip index is loaded before the first fight starts.
const shared = createVoice();

export function playVoice(events: readonly CombatEvent[]): void {
  shared.handle(events);
}

/** For lines no combat event triggers, such as "fight_start". */
export function speakLine(id: string): boolean {
  return shared.speak(id);
}
