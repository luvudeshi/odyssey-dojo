// How the game asks the server which god the player is, and for their portrait. Neither call rejects or hangs:
// null means the server could not help, and the game picks the god in the browser instead.
import { log } from "../core/log";
import { RevealResponseSchema } from "./contracts";
import type { RevealResponse } from "./contracts";

const REVEAL_TIMEOUT_MS = 9000;
const PORTRAIT_TIMEOUT_MS = 13000;

export interface RevealOptions {
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
}

/** Runs `work` with a signal that aborts after `ms`, and rejects then even if `work` ignores the signal. */
async function within<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`timed out after ${String(ms)} ms`);
      controller.abort(error);
      reject(error);
    }, ms);
  });
  try {
    return await Promise.race([work(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/** Sends the webcam snapshot (a JPEG data URL) and returns the god the server chose, or null on any failure. */
export async function requestReveal(snapshot: string, options: RevealOptions = {}): Promise<RevealResponse | null> {
  const fetcher = options.fetcher ?? fetch;
  try {
    return await within(options.timeoutMs ?? REVEAL_TIMEOUT_MS, async (signal) => {
      const response = await fetcher("/api/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: snapshot }),
        signal,
      });
      if (!response.ok) throw new Error(`reveal request failed with ${String(response.status)}`);
      return RevealResponseSchema.parse(await response.json());
    });
  } catch (error) {
    log("warn", "reveal_offline", error);
    return null;
  }
}

/** Waits for the portrait named by a reveal's portrait_id. Null when there is none, on any failure, or when it takes too long. */
export async function fetchPortrait(id: string, options: RevealOptions = {}): Promise<Blob | null> {
  const fetcher = options.fetcher ?? fetch;
  try {
    return await within(options.timeoutMs ?? PORTRAIT_TIMEOUT_MS, async (signal) => {
      const response = await fetcher(`/api/portrait/${encodeURIComponent(id)}`, { signal });
      if (response.status === 204) return null;
      if (!response.ok) throw new Error(`portrait request failed with ${String(response.status)}`);
      const portrait = await response.blob();
      if (portrait.size === 0 || !portrait.type.startsWith("image/")) throw new Error("portrait is not an image");
      return portrait;
    });
  } catch (error) {
    log("warn", "portrait_offline", error);
    return null;
  }
}
