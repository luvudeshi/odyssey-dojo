// Athena's voice: turns combat events into spoken lines, one at a time, and stays silent when a clip is missing.
import type { CombatEvent, CombatPhase } from "../core/types";
import { log } from "../core/log";
import { getSettings } from "../settings/store";
import { clipUrl, isPhaseLine, phaseLineId } from "./athenaLines";
import { isBeforeLine, pickTaunt, STORY_INDEX_URLS, storyClipUrl } from "./narrationLines";
import { releaseAudio } from "./release";
import { tapVoice } from "./soundTap";
import { tabHidden, watchTab } from "./tab";

const PRAISE = ["praise_1", "praise_2", "praise_3"] as const;
const WARNINGS = ["warn_1", "warn_2", "warn_3"] as const;
const INDEX_URL = "/audio/athena/index.json";
/** Longer than any line: a clip that neither ends nor fails is given up on after this. */
const MAX_CLIP_MS = 15000;
/** How loud a monster's taunt is next to Athena: a little under her, so her call stays clear on top of it. */
export const TAUNT_VOLUME = 0.7;
/**
 * A call that waited this long behind a warning is not spoken: its beat is nearly over, and the prompt card showed the move.
 * The longest warning (1.4 s) makes a call wait about 0.75 s, so this leaves a quarter of a second for a busy frame.
 */
export const HELD_CALL_MS = 1000;
/** No warning is this long. One that still holds the voice after it has stalled, and a call cuts it instead of waiting. */
export const WARNING_MAX_MS = 2500;

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

/**
 * A full power meter is announced with the god move's own call, under a line id of its own so that it ranks above the
 * calls: "power_trident_sweep" plays the clip of "call_trident_sweep".
 */
const POWER_LINE = "power_";

export function powerLineId(moveId: string): string {
  return `${POWER_LINE}${moveId}`;
}

/** The clip a line plays: its own, except for a power line, which borrows the move's call. */
function clipFor(id: string): string {
  return id.startsWith(POWER_LINE) ? `call_${id.slice(POWER_LINE.length)}` : id;
}

/**
 * Tiers of urgency, lowest first: praise and warnings, fight start and Homer's other lines, calls, Homer's line before
 * a stop, power ready, phase changes, the result.
 */
const SHORT = 0;
const MOMENT = 1;
const CALL = 2;
const INTRO = 3;
const POWER = 4;
const PHASE = 5;
const RESULT = 6;

function urgency(id: string): number {
  if (id === "win" || id === "loss") return RESULT;
  // A phase line comes once or twice a fight and the calls never stop, so it outranks them or it is never heard.
  if (isPhaseLine(id)) return PHASE;
  // The same goes for a full power meter, a few times a fight. It still gives way to a phase line.
  if (id.startsWith(POWER_LINE)) return POWER;
  if (id.startsWith("call_")) return CALL;
  // Homer's line before a stop is the only place that stop's story is told, and the fight opens under it. So once it is
  // being spoken the calls do not cut it, or it would be gone 1.5 seconds in. It comes once a fight and runs 7 to 9 seconds.
  if (isBeforeLine(id)) return INTRO;
  // Homer's other lines sit with the fight start; a taunt sent to this voice is as easily talked over as praise.
  return id === "fight_start" || id.startsWith("homer_") ? MOMENT : SHORT;
}

/** Whether a new line cuts off the one playing. Otherwise the new line is skipped. */
function interrupts(next: string, playing: string): boolean {
  // Homer's before-line takes the voice as his other lines do: it cuts praise and warnings and waits for the rest.
  // Its own tier only counts once it is the line being spoken.
  const tier = isBeforeLine(next) ? MOMENT : urgency(next);
  // The engine emits nothing after the result, so a call or fight start heard over it belongs to the next fight.
  const held = urgency(playing);
  if (held === RESULT) return tier === CALL || next === "fight_start";
  // A new fight's first line is not kept out by the last fight's phase line or power line (a retry from the pause menu).
  if ((held === PHASE || held === POWER) && next === "fight_start") return true;
  // A newer call beats an older one, whose beat has passed, and a newer phase line beats an older one. A call does not
  // beat a phase line or Homer's before-line, which are heard to their end: the call is dropped, not queued, and the
  // prompt card shows the move. The same goes for the fight start, praise and warnings asked for under his line.
  // A call that beats a warning does not cut it either: createVoice holds the call until the warning ends.
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
const listeners: ((speaking: boolean, who?: string) => void)[] = [];
const onSpeaking = (speaking: boolean, who?: string): void => {
  for (const listener of listeners) listener(speaking, who);
};

/**
 * Lets a listener (the music, a stop's ambience) know when a line is being spoken, so it can dip under it.
 * A second Voice must give `createVoice` a name of its own, as the monsters' channel below does: two voices under one
 * name would report silence when one falls quiet while the other still speaks.
 */
export function watchVoice(listener: (speaking: boolean, who?: string) => void): void {
  listeners.push(listener);
}

export function createVoice(deps: VoiceDeps = browserDeps(), who?: string): Voice {
  let current: { readonly id: string; readonly since: number; stop: () => void } | null = null;
  let disposed = false;
  let finishing = false;
  /** The newest call asked for while a warning was being spoken. It is said when the warning ends, if it is still worth saying. */
  let waiting: { readonly id: string; readonly since: number } | null = null;
  /** True during the finishing move: its window is long, so its call is worth saying however long it waited. */
  let patient = false;

  const speak = (id: string): boolean => {
    const clip = clipFor(id);
    if (disposed || !deps.available(clip)) return false;
    if (current && !interrupts(id, current.id)) return false;
    // A warning is a second long and a call always lands inside it. Cut there, it is half a word ("Stay sha-"), so the
    // warning is heard out and the call follows it. Only calls wait: every other line that may cut a warning still does.
    const warning = current !== null && WARNINGS.some((each) => each === current?.id) && Date.now() - current.since < WARNING_MAX_MS;
    if (warning && urgency(id) === CALL) {
      waiting = { id, since: Date.now() };
      return false;
    }
    // Whatever takes the voice now, a call that was waiting is not said after it.
    waiting = null;
    // Stop before starting, so two lines are never heard together.
    current?.stop();
    const line = { id, since: Date.now(), stop: (): void => undefined };
    const free = (): void => {
      if (current !== line) return;
      current = null;
      onSpeaking(false, who);
      const next = waiting;
      waiting = null;
      if (next && (patient || Date.now() - next.since <= HELD_CALL_MS)) speak(next.id);
    };
    current = line;
    onSpeaking(true, who);
    try {
      line.stop = deps.play(clip, free);
    } catch (error) {
      log("warn", "voice.play", error);
      free();
    }
    return current === line;
  };

  return {
    speak,
    handle(events, phase) {
      // A waiting call belongs to the beat it was asked in. Any event but a newer call ends that beat, and so does a
      // phase with nothing to call (the fight is over, or the monster is recovering), so the call is dropped.
      const calling = phase === undefined || phase.kind === "defend" || phase.kind === "strike" || phase.kind === "finisher";
      if (!calling || events.some((event) => event.type !== "telegraph" && event.type !== "opening")) waiting = null;
      patient = phase?.kind === "finisher";
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
      // A phase line, a power line or Homer's before-line holding the voice keeps the finisher's call out, so the call is
      // tried again until it is spoken.
      const holding = urgency(current?.id ?? "");
      finishing = phase?.kind === "finisher" && holding !== PHASE && holding !== POWER && holding !== INTRO;
    },
    playing: () => current?.id ?? null,
    stop(id) {
      if (current?.id !== id) return;
      // A warning that is cut off takes the call waiting behind it along: nothing comes back after a stop.
      waiting = null;
      current.stop();
      current = null;
      onSpeaking(false, who);
    },
    dispose() {
      disposed = true;
      waiting = null;
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

/**
 * Plays clips through audio elements. A failed load or a blocked play() reports done, so the voice is never left waiting.
 * Each element is used for one line and let go of when the line ends, fails or is cut off.
 */
export function audioPlayer(open: (url: string) => ClipAudio): VoiceDeps["play"] {
  return (id, done) => {
    // Homer's and the monsters' clips have folders of their own; every other id is Athena's.
    const audio = open(storyClipUrl(id));
    const timer = setTimeout(() => {
      audio.pause();
      releaseAudio(audio);
      done();
    }, MAX_CLIP_MS);
    const finish = (): void => {
      clearTimeout(timer);
      releaseAudio(audio);
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
      releaseAudio(audio);
    };
  };
}

/** The same player, except that nothing starts while the tab is hidden: the line is reported done at once. */
function whileSeen(play: VoiceDeps["play"]): VoiceDeps["play"] {
  return (id, done) => {
    if (!tabHidden()) return play(id, done);
    done();
    return () => undefined;
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
  return { available: (id) => clips.has(id), play: whileSeen(audioPlayer((url) => tapVoice(Object.assign(new Audio(url), { volume: getSettings().voiceVolume })))), random: Math.random };
}

/** The same clips at `gain` times the volume, through audio elements that no other voice's line stops. */
function quieter(deps: VoiceDeps, gain: number): VoiceDeps {
  if (typeof Audio === "undefined") return deps;
  return { ...deps, play: whileSeen(audioPlayer((url) => tapVoice(Object.assign(new Audio(url), { volume: getSettings().voiceVolume * gain })))) };
}

// Created with the module so the clip indexes are loaded before the first fight starts.
const sharedDeps = browserDeps(STORY_INDEX_URLS);
const shared = createVoice(sharedDeps);

const monsters = createVoice(quieter(sharedDeps, TAUNT_VOLUME), "taunt");
/** True from the frame a fight is won or lost until the next fight begins. No taunt and no power line starts meanwhile. */
let fightOver = false;
/** True while the fight is in its finishing move, where a full meter cannot be spent. No power line starts meanwhile. */
let finishingMove = false;
/** True while the fight is paused. No taunt starts meanwhile: one that was waiting for Athena's phase line is dropped. */
let fightPaused = false;

/**
 * The monsters' own channel: a taunt plays over Athena's calls and is not cut by them, and it never holds her voice.
 * One taunt at a time: a second one asked for while the first plays is refused. So is any taunt once the fight is over.
 */
export const tauntVoice: Pick<Voice, "speak" | "playing" | "stop"> = {
  speak: (id) => !fightOver && !fightPaused && monsters.speak(id),
  playing: () => monsters.playing(),
  stop: (id) => {
    monsters.stop(id);
  },
};

export function playVoice(events: readonly CombatEvent[], phase?: CombatPhase): void {
  if (events.some((event) => event.type === "won" || event.type === "lost")) {
    // The monster falls silent when the fight ends, so the result lines are heard clean. A taunt still waiting is refused.
    fightOver = true;
    const taunt = monsters.playing();
    if (taunt !== null) monsters.stop(taunt);
  } else if (events.length > 0) {
    // The engine emits nothing after the result, so these events are a new fight's.
    fightOver = false;
  }
  finishingMove = phase?.kind === "finisher";
  shared.handle(events, phase);
}

/** For lines no combat event triggers, such as "fight_start" or Homer's "homer_title". */
export function speakLine(id: string): boolean {
  if (id === "fight_start") {
    fightOver = false;
    finishingMove = false;
  }
  return shared.speak(id);
}

/**
 * The power meter is full: Athena calls the god move that spends it ("Trident! Sweep across!"). It cuts praise, a
 * warning or an ordinary call, and the calls that follow do not cut it. It does not cut a phase line or the result,
 * and it is refused once the fight is over or in its finishing move. True when it started playing.
 */
export function speakPowerReady(moveId: string): boolean {
  if (fightOver || finishingMove) return false;
  return shared.speak(powerLineId(moveId));
}

/**
 * Has the monster taunt the player on its own channel, at once, if it has a taunt recorded, is not already taunting and
 * the fight is not over. Works for every stop of the quest. speakMonsterTaunt in storyVoice.ts waits for Athena's phase
 * line first and says when the taunt is over; the fight screen uses that one.
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

/** Silences the monster's taunt, and the shared voice's line unless `spare` says to leave that one playing. */
function silence(spare: (line: string) => boolean): void {
  const taunt = monsters.playing();
  if (taunt !== null) monsters.stop(taunt);
  const line = shared.playing();
  if (line !== null && !spare(line)) shared.stop(line);
}

/**
 * Silences the fight's voices at once: the monster's taunt and whatever Athena is saying. A call waiting behind a
 * warning is dropped with it, so nothing comes back afterwards. With `keepEnding`, the result line and Homer's lines
 * play on. A hidden tab and a pause call this; a fight that is left calls leaveFightVoice.
 */
export function stopFightVoice(keepEnding = false): void {
  silence((line) => keepEnding && (urgency(line) === RESULT || line.startsWith("homer_")));
}

/** Set while a fight screen has just gone and no other has taken its place yet. Homer's before-line is cut when it runs out. */
let leaving: ReturnType<typeof setTimeout> | undefined;

/**
 * A fight screen is on. Called by useStopAudio when one mounts. If another fight screen went in the same moment (a retry
 * from the pause menu, or React's dev build, which mounts every screen twice), Homer's before-line carries on into this one.
 */
export function enterFightVoice(): void {
  if (leaving !== undefined) clearTimeout(leaving);
  leaving = undefined;
  fightOver = false;
}

/**
 * The fight screen is gone. Called by useStopAudio when one unmounts. The taunt and Athena's line are cut at once and
 * no taunt starts until the next fight. Homer's before-line is cut one tick later, and only if no fight screen has
 * mounted by then: cut here, the dev build's second mount would silence it as the fight opens.
 */
export function leaveFightVoice(): void {
  fightOver = true;
  silence(isBeforeLine);
  if (leaving !== undefined) clearTimeout(leaving);
  leaving = setTimeout(() => {
    leaving = undefined;
    // Only his before-line: anything else speaking by now was started by the screen that came next.
    silence((line) => !isBeforeLine(line));
  }, 0);
}

/**
 * Called with true when the fight is paused and false when it carries on. A pause cuts the line being spoken and keeps
 * taunts from starting. The fight counts as paused once it is over too, so the result line and Homer's lines play on.
 */
export function pauseFightVoice(paused: boolean): void {
  fightPaused = paused;
  if (paused) stopFightVoice(true);
}

// A hidden tab plays nothing: what is being said is cut, and whileSeen keeps anything new from starting until it is shown.
watchTab((hidden) => {
  if (hidden) stopFightVoice();
});
