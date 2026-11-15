// The sound of the god reveal: the power sting as the god's name comes up, then Athena calling the god's move as the
// power line fades in. No new clip: the sting is the fight's own, and the call is the one the fight uses for a full meter.
import { playEvent } from "../../audio/sfx";
import { speakLine, voicePlaying } from "../../audio/voice";
import { log } from "../../core/log";
import { GODS } from "../gods/gods";
import type { GodId } from "../gods/gods";

/** When the power line fades in (reveal.css: .reveal-power starts at 1.2 s). */
export const CALL_DELAY_MS = 1200;
/** How often to look again while another line (Homer's title line, after a fast click through the menu) holds the voice. */
export const CALL_RETRY_MS = 250;
/** After this long the call is dropped: the reveal has been read by then. */
export const CALL_GIVE_UP_MS = 6000;

export interface RevealSoundDeps {
  /** Plays the sting at once. */
  readonly sting: () => void;
  /** Speaks a line of the shared voice; true when it started. */
  readonly speak: (id: string) => boolean;
  /** The line the shared voice is speaking now, or null. */
  readonly playing: () => string | null;
}

const BROWSER: RevealSoundDeps = {
  sting: () => { playEvent({ type: "powerUnleashed", damage: 0 }); },
  speak: speakLine,
  playing: voicePlaying,
};

/**
 * Starts the reveal's sound for this god and returns a function that calls off what has not played yet (the screen
 * was left). The call never cuts a line already being spoken: it waits for it, and gives up after CALL_GIVE_UP_MS.
 */
export function revealSound(god: GodId, deps: RevealSoundDeps = BROWSER): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waited = CALL_DELAY_MS;
  try {
    deps.sting();
  } catch (error) {
    log("warn", "reveal_sound.sting", error);
  }
  const call = (): void => {
    timer = undefined;
    try {
      if (deps.playing() === null) {
        deps.speak(`call_${GODS[god].power.moveId}`);
        return;
      }
    } catch (error) {
      log("warn", "reveal_sound.call", error);
      return;
    }
    waited += CALL_RETRY_MS;
    if (waited <= CALL_GIVE_UP_MS) timer = setTimeout(call, CALL_RETRY_MS);
  };
  timer = setTimeout(call, CALL_DELAY_MS);
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
}
