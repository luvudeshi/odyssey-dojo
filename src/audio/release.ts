// Letting go of a spoken clip's audio element, for the voices (voice.ts) and the generated lines (narration.ts).
import { log } from "../core/log";

/**
 * Lets go of an audio element whose clip is over or was cut off. With its source taken away the browser drops what it
 * had fetched and decoded for it at once, where an element that is only paused keeps all of that until it is collected.
 */
export function releaseAudio(audio: object): void {
  try {
    const element = audio as Partial<Pick<HTMLAudioElement, "removeAttribute" | "load">>;
    if (typeof element.removeAttribute !== "function" || typeof element.load !== "function") return;
    element.removeAttribute("src");
    element.load();
  } catch (error) {
    log("warn", "audio.release", error);
  }
}
