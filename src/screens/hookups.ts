// What the screens ask the audio and the god scan to do, as plain functions so a test can pass recording stand-ins.
import { speakHomecoming, speakNarration, speakResult, stopStory } from "../audio/storyVoice";
import type { NarrationMoment } from "../audio/narrationLines";

export interface StoryDeps {
  readonly narrate: (enemyId: string, moment: NarrationMoment) => Promise<boolean>;
  readonly result: (enemyId: string, won: boolean) => Promise<boolean>;
  readonly homecoming: () => Promise<boolean>;
  readonly stop: () => void;
}

const REAL: StoryDeps = { narrate: speakNarration, result: speakResult, homecoming: speakHomecoming, stop: stopStory };

/** Homer's line before a stop. The returned cleanup is required: it keeps his line from running on into the fight. */
export function narrateIntro(enemyId: string, deps: StoryDeps = REAL): () => void {
  void deps.narrate(enemyId, "before");
  return deps.stop;
}

/** Homer's line on the result screen, with the same cleanup so a "Fight again" does not start inside his loss line. */
export function narrateResult(enemyId: string, won: boolean, deps: StoryDeps = REAL): () => void {
  void deps.result(enemyId, won);
  return deps.stop;
}

/** Homer's closing line, on the result screen of the last stop when it is won, in place of the result line. Same cleanup. */
export function narrateHomecoming(deps: StoryDeps = REAL): () => void {
  void deps.homecoming();
  return deps.stop;
}

/** The god scan may never hold a player for longer than this: a judge plays about three minutes. */
export const GOD_SCAN_LIMIT_MS = 30000;

/** Keys that skip the god scan. */
export function skipsScan(key: string): boolean {
  return key === "Escape" || key === "s" || key === "S";
}
