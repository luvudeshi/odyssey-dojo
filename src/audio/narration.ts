// Spoken lines that are written at run time: Homer's narration and the monster's taunts in generated fights.
// The server makes each line once and caches it. With no server or no key this stays silent and never throws.
import { log } from "../core/log";
import { getSettings } from "../settings/store";

export type Speaker = "athena" | "homer" | "monster";

/** How long a line is waited for. The server gives up on the voice service at speechMs (server/env.ts), which is shorter. */
export const SPEECH_WAIT_MS = 9000;
const ready = new Map<string, Promise<string | null>>();
let current: HTMLAudioElement | null = null;

const key = (speaker: Speaker, text: string): string => `${speaker}\n${text}`;

/** Fetches a line ahead of time so it can start the instant it is needed. Returns an object URL, or null. A failure is not remembered, so a later call tries again. */
export function prepareLine(speaker: Speaker, text: string, fetcher: typeof fetch = fetch, timeoutMs: number = SPEECH_WAIT_MS): Promise<string | null> {
  const id = key(speaker, text);
  const known = ready.get(id);
  if (known) return known;
  const request = fetcher("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: speaker }),
    signal: AbortSignal.timeout(timeoutMs),
  })
    .then(async (response) => (response.ok ? URL.createObjectURL(await response.blob()) : null))
    .catch((error: unknown) => {
      log("warn", "narration_unavailable", error);
      return null;
    })
    .then((url) => {
      if (url === null) ready.delete(id);
      return url;
    });
  ready.set(id, request);
  return request;
}

/** Speaks a line, replacing any narration already playing. Resolves true once it has played to the end; false if it could not play or was cut off by stopNarration or a newer line. */
export async function speakLine(speaker: Speaker, text: string): Promise<boolean> {
  const url = await prepareLine(speaker, text);
  if (url === null || typeof Audio === "undefined") return false;
  stopNarration();
  const audio = Object.assign(new Audio(url), { volume: getSettings().voiceVolume });
  current = audio;
  return new Promise((resolve) => {
    const finish = (played: boolean): void => {
      if (current === audio) current = null;
      resolve(played);
    };
    audio.addEventListener("ended", () => { finish(true); }, { once: true });
    audio.addEventListener("error", () => { finish(false); }, { once: true });
    // Browsers also fire "pause" when a clip reaches its end, so only a pause before the end means it was cut off.
    audio.addEventListener("pause", () => { finish(audio.ended); }, { once: true });
    audio.play().catch(() => { finish(false); });
  });
}

export function stopNarration(): void {
  current?.pause();
  current = null;
}
