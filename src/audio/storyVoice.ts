// Speaks Homer's narration and the monsters' taunts through Athena's voice, so two lines are never heard together.
// Every function returns a promise that never rejects. It resolves true once a line the voice took is over (played out,
// cut off or failed), and false when the voice never took it: no clip, no audio, an unknown stop, or the voice stayed busy.
import { log } from "../core/log";
import { isStoryLine, narrationId, pickTaunt } from "./narrationLines";
import type { NarrationMoment } from "./narrationLines";
import { speakLine, stopLine, voicePlaying } from "./voice";

/** How often a waiting line asks again, and how often a playing line is checked. */
const POLL_MS = 100;
/** How long Homer waits for the voice: long enough for Athena's result line to end, or for the clip indexes to load. */
export const NARRATION_WAIT_MS = 6000;
/** How long a taunt waits: long enough for Athena's phase line, short enough that the taunt still fits the moment. */
export const TAUNT_WAIT_MS = 2500;
/** Longer than the voice lets any clip run, so a promise can never be left pending. */
const MAX_HEARD_MS = 20000;

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
  /** Homer's line before or after a stop. Waits up to `waitMs` for the voice to be free. */
  speakNarration(enemyId: string, moment: NarrationMoment, waitMs?: number): Promise<boolean>;
  /** Homer's line for the result screen: the stop's "after" line on a win (or his general one), his loss line otherwise. */
  speakResult(enemyId: string, won: boolean, waitMs?: number): Promise<boolean>;
  /** One of the monster's taunts, picked at random. Waits up to `waitMs` for the voice to be free. */
  speakMonsterTaunt(enemyId: string, waitMs?: number): Promise<boolean>;
  /** Drops a line that is still waiting and cuts off a story line that is playing. Athena's lines are left alone. */
  stopStory(): void;
}

export function createStoryVoice(deps: StoryVoiceDeps): StoryVoice {
  // Goes up with every request and every stop. A waiting line that sees a newer number gives up, so only the newest waits.
  let turn = 0;

  /** `choose` runs inside the try, so nothing it throws can escape as a rejection. */
  async function say(choose: () => string | null, waitMs: number): Promise<boolean> {
    turn += 1;
    const mine = turn;
    // Anything that is not a real number of milliseconds means "do not wait".
    const patience = Number.isFinite(waitMs) ? waitMs : 0;
    try {
      const id = choose();
      if (id === null) return false;
      for (let waited = 0; !deps.speak(id); waited += POLL_MS) {
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

  return {
    speakNarration: (enemyId, moment, waitMs = NARRATION_WAIT_MS) => say(() => narrationId(enemyId, moment), waitMs),
    speakResult: (enemyId, won, waitMs = NARRATION_WAIT_MS) =>
      say(() => (won ? (narrationId(enemyId, "after") ?? "homer_win") : "homer_loss"), waitMs),
    speakMonsterTaunt: (enemyId, waitMs = TAUNT_WAIT_MS) => say(() => pickTaunt(enemyId, deps.random), waitMs),
    stopStory() {
      turn += 1;
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

/** Homer's line before or after a stop, e.g. on the intro screen: `void speakNarration(enemy.id, "before")`. */
export function speakNarration(enemyId: string, moment: NarrationMoment, waitMs?: number): Promise<boolean> {
  return shared.speakNarration(enemyId, moment, waitMs);
}

/** Homer's line for the result screen. It waits for Athena's own result line to end first. */
export function speakResult(enemyId: string, won: boolean, waitMs?: number): Promise<boolean> {
  return shared.speakResult(enemyId, won, waitMs);
}

/** Has the monster taunt the player, for every stop of the quest. Athena's next call cuts a taunt short. */
export function speakMonsterTaunt(enemyId: string, waitMs?: number): Promise<boolean> {
  return shared.speakMonsterTaunt(enemyId, waitMs);
}

/** Call when leaving a screen that started a story line, so Homer does not talk on into the next one. */
export function stopStory(): void {
  shared.stopStory();
}
