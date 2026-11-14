// Speaks Homer's narration and the monsters' taunts through Athena's voice, so two lines are never heard together.
// Every function returns a promise that never rejects. It resolves true once a line the voice took is over (played out,
// cut off or failed), and false when the voice never took it: no clip, no audio, an unknown stop, or the voice stayed busy.
// Homer speaks on the screens around a fight, so his new line cuts off an older story line. A taunt is spoken inside a
// fight, so it lets Athena's line for that frame go first.
import { log } from "../core/log";
import { isStoryLine, narrationId, pickTaunt } from "./narrationLines";
import type { NarrationMoment } from "./narrationLines";
import { speakLine, stopLine, voicePlaying } from "./voice";

/** How often a waiting line asks again, and how often a playing line is checked. */
const POLL_MS = 100;
/** How long Homer waits for the voice: long enough for Athena's result line to end, or for the clip indexes to load. */
export const NARRATION_WAIT_MS = 6000;
/** How long a taunt waits: longer than Athena's longest phase line (2.4 s), short enough that the taunt still fits the moment. */
export const TAUNT_WAIT_MS = 3500;
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
  readonly random: () => number;
  readonly sleep: (ms: number) => Promise<void>;
}

export interface StoryVoice {
  /** Homer's line before or after a stop. Cuts off another story line, then waits up to `waitMs` for Athena to finish. */
  speakNarration(enemyId: string, moment: NarrationMoment, waitMs?: number): Promise<boolean>;
  /** Homer's line for the result screen: the stop's "after" line on a win (or his general one), his loss line otherwise. */
  speakResult(enemyId: string, won: boolean, waitMs?: number): Promise<boolean>;
  /** One of the monster's taunts, picked at random. First tried a moment later, then waits up to `waitMs` in all. */
  speakMonsterTaunt(enemyId: string, waitMs?: number): Promise<boolean>;
  /** Drops a line that is still waiting and cuts off a story line that is playing. Athena's lines are left alone. */
  stopStory(): void;
}

export function createStoryVoice(deps: StoryVoiceDeps): StoryVoice {
  // Goes up with every request and every stop. A waiting line that sees a newer number gives up, so only the newest waits.
  let turn = 0;

  // The line now waiting or playing. Asking for it again joins it, so a screen that asks twice is heard once.
  let active: { readonly id: string; readonly over: Promise<boolean> } | null = null;

  /** Waits for the voice, speaks the line, and resolves when it is over. Everything is inside the try, so it cannot reject. */
  async function run(id: string, mine: number, patience: number, speaker: Speaker): Promise<boolean> {
    try {
      let waited = 0;
      if (speaker === "homer") {
        // A new screen's line must not wait behind the last screen's: Homer does not cut Homer in the voice itself.
        const now = deps.playing();
        if (now !== null && now !== id && isStoryLine(now)) deps.stop(now);
      } else {
        // A taunt is often asked for in the frame the phase changes, before Athena has spoken for that frame.
        // Trying now would start the taunt and have her phase line cut it at once, so the first try is one poll later.
        await deps.sleep(POLL_MS);
        if (mine !== turn) return false;
        waited = POLL_MS;
      }
      for (; !deps.speak(id); waited += POLL_MS) {
        if (waited >= patience) return false;
        await deps.sleep(POLL_MS);
        if (mine !== turn) return false;
      }
      for (let heard = 0; deps.playing() === id && heard < MAX_HEARD_MS; heard += POLL_MS) await deps.sleep(POLL_MS);
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
    turn += 1;
    if (id === null) return Promise.resolve(false);
    // Anything that is not a real number of milliseconds means "do not wait".
    const line = { id, over: run(id, turn, Number.isFinite(waitMs) ? waitMs : 0, speaker) };
    active = line;
    void line.over.then(() => {
      if (active === line) active = null;
    });
    return line.over;
  }

  return {
    speakNarration: (enemyId, moment, waitMs = NARRATION_WAIT_MS) => say(() => narrationId(enemyId, moment), waitMs, "homer"),
    speakResult: (enemyId, won, waitMs = NARRATION_WAIT_MS) =>
      say(() => (won ? (narrationId(enemyId, "after") ?? "homer_win") : "homer_loss"), waitMs, "homer"),
    speakMonsterTaunt: (enemyId, waitMs = TAUNT_WAIT_MS) => say(() => pickTaunt(enemyId, deps.random), waitMs, "monster"),
    stopStory() {
      turn += 1;
      // Forget the line too, so asking for it again after a stop starts it afresh.
      active = null;
      try {
        const id = deps.playing();
        if (id !== null && isStoryLine(id)) deps.stop(id);
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
  random: Math.random,
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
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
 * Has the monster taunt the player, for every stop of the quest. It may be called before or after `playVoice` in a frame:
 * Athena's line for that frame goes first either way. Her next call cuts a taunt short.
 */
export function speakMonsterTaunt(enemyId: string, waitMs?: number): Promise<boolean> {
  return shared.speakMonsterTaunt(enemyId, waitMs);
}

/** Must be called when leaving a screen that asked for a story line, or Homer talks on into the fight or the next screen. */
export function stopStory(): void {
  shared.stopStory();
}
