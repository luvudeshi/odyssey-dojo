// Spoken lines that are written at run time: Homer's narration and the monster's taunts in generated fights.
// The server makes each line once and caches it. With no server or no key this stays silent and never throws.
import { log } from "../core/log";

export type Speaker = "athena" | "homer" | "monster";

const TIMEOUT_MS = 9000;
const ready = new Map<string, Promise<string | null>>();
let current: HTMLAudioElement | null = null;

const key = (speaker: Speaker, text: string): string => `${speaker}\n${text}`;

/** Fetches a line ahead of time so it can start the instant it is needed. Returns an object URL, or null. */
export function prepareLine(speaker: Speaker, text: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const known = ready.get(key(speaker, text));
  if (known) return known;
  const request = fetcher("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: speaker }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
    .then(async (response) => (response.ok ? URL.createObjectURL(await response.blob()) : null))
    .catch((error: unknown) => {
      log("warn", "narration_unavailable", error);
      return null;
    });
  ready.set(key(speaker, text), request);
  return request;
}

/** Speaks a line, replacing any narration already playing. Resolves when it ends; false if it could not play. */
export async function speakLine(speaker: Speaker, text: string): Promise<boolean> {
  const url = await prepareLine(speaker, text);
  if (url === null || typeof Audio === "undefined") return false;
  stopNarration();
  const audio = new Audio(url);
  current = audio;
  return new Promise((resolve) => {
    const done = (played: boolean) => () => {
      if (current === audio) current = null;
      resolve(played);
    };
    audio.addEventListener("ended", done(true), { once: true });
    audio.addEventListener("error", done(false), { once: true });
    audio.addEventListener("pause", done(true), { once: true });
    audio.play().catch(done(false));
  });
}

export function stopNarration(): void {
  current?.pause();
  current = null;
}
