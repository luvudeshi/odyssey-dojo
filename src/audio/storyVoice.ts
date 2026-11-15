// Speaks Homer's narration through Athena's voice, so the two are never heard together, and the monsters' taunts on a
// channel of their own, so a taunt is heard over Athena's calls and never holds her up.
// Every function returns a promise that never rejects. It resolves true once a line that started is over (played out,
// cut off or failed), and false when it never started: no clip, no audio, an unknown stop, or its channel stayed busy.
// Homer speaks on the screens around a fight, so his new line cuts off an older story line. A taunt is spoken inside a
// fight: it waits for Athena's phase line to end, then plays over her calls. A second taunt asked for while one waits or
// plays is not played (it resolves false, or joins the first when the dice picked that same one). Once a taunt is over,
// the next one is never that same line again when the monster has another, so each phase change brings a different taunt.
import { log } from "../core/log";
import { isPhaseLine } from "./athenaLines";
import { HOMECOMING_ID, isStoryLine, narrationId, pickTaunt, tauntIds } from "./narrationLines";
import type { NarrationMoment } from "./narrationLines";
import { speakLine, stopLine, tauntVoice, voicePlaying } from "./voice";

/** How often a waiting line asks again, and how often a playing line is checked. */
const POLL_MS = 100;
/** How long Homer waits for the voice: long enough for Athena's result line to end, or for the clip indexes to load. */
export const NARRATION_WAIT_MS = 6000;
/** How long a taunt waits for Athena's phase line to end before it is dropped. The longest phase line runs 2.85 seconds. */
export const TAUNT_WAIT_MS = 4000;
/** Longer than the voice lets any clip run, so a promise can never be left pending. */
const MAX_HEARD_MS = 20000;

type Speaker = "homer" | "monster";

export interface StoryVoiceDeps {
  /** Starts a line on the shared voice. False when the clip is missing or a more urgent line is playing. */
  readonly speak: (id: string) => boolean;
  /** The line the shared voice is speaking now, or null. */
  readonly playing: () => string | null;
  /** Cuts this line off if it is the one being spoken. */
  readonly stop: (id: string) => void;
  /** The monsters' channel. It has the same three functions and is never busy with Athena's or Homer's lines. */
  readonly taunts: Pick<StoryVoiceDeps, "speak" | "playing" | "stop">;
  readonly random: () => number;
  /** Resolves after `ms`, or at once when `stopped` aborts, so a line that was stopped leaves no timer running. */
  readonly sleep: (ms: number, stopped?: AbortSignal) => Promise<void>;
}

export interface StoryVoice {
  /** Homer's line before or after a stop. Cuts off another story line, then waits up to `waitMs` for Athena to finish. */
  speakNarration(enemyId: string, moment: NarrationMoment, waitMs?: number): Promise<boolean>;
  /** Homer's line for the result screen: the stop's "after" line on a win (or his general one), his loss line otherwise. */
  speakResult(enemyId: string, won: boolean, waitMs?: number): Promise<boolean>;
  /** Homer's closing line, for the result screen of the last stop once it is won. It waits for Athena like the result line. */
  speakHomecoming(waitMs?: number): Promise<boolean>;
  /** One of the monster's taunts, picked at random but never the one it said last, once Athena's phase line is over. `waitMs` is how long it then waits for a taunt that is playing. */
  speakMonsterTaunt(enemyId: string, waitMs?: number): Promise<boolean>;
  /** Drops a line that is still waiting and cuts off a story line or taunt that is playing. Athena's lines are left alone. */
  stopStory(): void;
}

export function createStoryVoice(deps: StoryVoiceDeps): StoryVoice {
  // Goes up with every request and every stop. A waiting line that sees a newer number gives up, so only the newest waits.
  let turn = 0;

  // The line now waiting or playing. Asking for it again joins it, so a screen that asks twice is heard once.
  let active: { readonly id: string; readonly speaker: Speaker; readonly over: Promise<boolean> } | null = null;

  // One for every line not yet over, the one in `active` and any it took the place of. stopStory aborts them all, which
  // wakes each line from its timer so that none is left running.
  const live = new Set<AbortController>();

  // The taunt that started last, so that a monster does not say the same line at two phase changes running.
  let lastTaunt: string | null = null;

  /** The dice's taunt, or the monster's next one when the dice picked the line it said last. */
  function chooseTaunt(enemyId: string): string | null {
    const id = pickTaunt(enemyId, deps.random);
    // While a taunt waits or plays the dice's pick stands: say() joins it or drops the new one.
    if (id === null || id !== lastTaunt || active?.speaker === "monster") return id;
    const ids = tauntIds(enemyId);
    return ids[(ids.indexOf(id) + 1) % ids.length] ?? id;
  }

  /** Waits for the voice, speaks the line, and resolves when it is over. Everything is inside the try, so it cannot reject. */
  async function run(id: string, mine: number, patience: number, speaker: Speaker, stopped: AbortSignal): Promise<boolean> {
    try {
      const channel = speaker === "homer" ? deps : deps.taunts;
      if (speaker === "homer") {
        // A new screen's line must not wait behind the last screen's: Homer does not cut Homer in the voice itself.
        const now = deps.playing();
        if (now !== null && now !== id && isStoryLine(now)) deps.stop(now);
      } else {
        // The fight screen asks for the taunt before Athena hears the frame's events, so her phase line starts just after
        // this. Look one tick later, then let her finish: the two are not heard together.
        await deps.sleep(0, stopped);
        for (let waited = 0; mine === turn && isPhaseLine(deps.playing()); waited += POLL_MS) {
          if (waited >= TAUNT_WAIT_MS) return false;
          await deps.sleep(POLL_MS, stopped);
        }
        if (mine !== turn) return false;
      }
      for (let waited = 0; !channel.speak(id); waited += POLL_MS) {
        if (waited >= patience) return false;
        await deps.sleep(POLL_MS, stopped);
        if (mine !== turn) return false;
      }
      if (speaker === "monster") lastTaunt = id;
      for (let heard = 0; channel.playing() === id && heard < MAX_HEARD_MS; heard += POLL_MS) await deps.sleep(POLL_MS, stopped);
      return true;
    } catch (error) {
      log("warn", "story.voice", error);
      return false;
    }
  }

  function say(choose: () => string | null, waitMs: number, speaker: Speaker): Promise<boolean> {
    let id: string | null = null;
    try {
      id = choose();
    } catch (error) {
      log("warn", "story.choose", error);
    }
    if (id !== null && active?.id === id) return active.over;
    // Anything that is not a real number of milliseconds means "do not wait".
    const patience = Number.isFinite(waitMs) ? waitMs : 0;
    // One taunt at a time: a taunt that will not wait does not take the place of one that is waiting or playing.
    if (speaker === "monster" && active?.speaker === "monster" && patience <= 0) return Promise.resolve(false);
    turn += 1;
    if (id === null) return Promise.resolve(false);
    const stopped = new AbortController();
    live.add(stopped);
    const line = { id, speaker, over: run(id, turn, patience, speaker, stopped.signal) };
    active = line;
    void line.over.then(() => {
      live.delete(stopped);
      if (active === line) active = null;
    });
    return line.over;
  }

  return {
    speakNarration: (enemyId, moment, waitMs = NARRATION_WAIT_MS) => say(() => narrationId(enemyId, moment), waitMs, "homer"),
    speakResult: (enemyId, won, waitMs = NARRATION_WAIT_MS) =>
      say(() => (won ? (narrationId(enemyId, "after") ?? "homer_win") : "homer_loss"), waitMs, "homer"),
    speakHomecoming: (waitMs = NARRATION_WAIT_MS) => say(() => HOMECOMING_ID, waitMs, "homer"),
    speakMonsterTaunt: (enemyId, waitMs = 0) => say(() => chooseTaunt(enemyId), waitMs, "monster"),
    stopStory() {
      turn += 1;
      for (const stopped of live) stopped.abort();
      live.clear();
      // Forget the line too, so asking for it again after a stop starts it afresh.
      active = null;
      try {
        for (const channel of [deps, deps.taunts]) {
          const id = channel.playing();
          if (id !== null && isStoryLine(id)) channel.stop(id);
        }
      } catch (error) {
        log("warn", "story.stop", error);
      }
    },
  };
}

const shared = createStoryVoice({
  speak: speakLine,
  playing: voicePlaying,
  stop: stopLine,
  taunts: tauntVoice,
  random: Math.random,
  sleep: (ms, stopped) =>
    new Promise((resolve) => {
      if (stopped?.aborted) {
        resolve();
        return;
      }
      const wake = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        stopped?.removeEventListener("abort", wake);
        resolve();
      }, ms);
      stopped?.addEventListener("abort", wake, { once: true });
    }),
});

/**
 * Homer's line before or after a stop. On the intro screen, with the cleanup so he does not talk into the fight:
 * `useEffect(() => { void speakNarration(enemy.id, "before"); return stopStory; }, [enemy.id]);`
 */
export function speakNarration(enemyId: string, moment: NarrationMoment, waitMs?: number): Promise<boolean> {
  return shared.speakNarration(enemyId, moment, waitMs);
}

/** Homer's line for the result screen. It waits for Athena's own result line to end first. Return `stopStory` from the effect. */
export function speakResult(enemyId: string, won: boolean, waitMs?: number): Promise<boolean> {
  return shared.speakResult(enemyId, won, waitMs);
}

/**
 * Homer's closing line: the suitors fall and Odysseus is home. For the result screen of the last stop when it is won,
 * in place of `speakResult`. It waits for Athena's result line in the same way. Return `stopStory` from the effect.
 */
export function speakHomecoming(waitMs?: number): Promise<boolean> {
  return shared.speakHomecoming(waitMs);
}

/**
 * Has the monster taunt the player, for every stop of the quest. The taunt waits for Athena's phase line to end (up to
 * TAUNT_WAIT_MS, then it is dropped), then plays on the monsters' own channel, a little quieter than Athena, over her calls.
 * `stopStory` drops or silences it, and so does `playVoice` when the fight is won or lost.
 */
export function speakMonsterTaunt(enemyId: string, waitMs?: number): Promise<boolean> {
  return shared.speakMonsterTaunt(enemyId, waitMs);
}

/** Must be called when leaving a screen that asked for a story line, or Homer talks on into the fight or the next screen. */
export function stopStory(): void {
  shared.stopStory();
}
