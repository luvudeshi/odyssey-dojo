// POST /api/speech: a line of text in, spoken MP3 out. Used for lines that cannot be made ahead of time
// (Homer's narration and the monster's taunts in generated fights). Each line is made once, then served from disk.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { log } from "../../src/core/log";
import type { Voice } from "../ai/types";
import { CHARACTERS, forcedVoice, pickVoice } from "../ai/voices";
import type { Register } from "../app";
import { createRedactor } from "../lib/redact";
import { withTimeout } from "../lib/timeout";

const SpeechRequest = z.object({ text: z.string().trim().min(1).max(500), voice: z.enum(CHARACTERS) });
// Quick enough to speak a line the player is waiting for.
const MODEL = "eleven_flash_v2_5";

/** True when the bytes begin like an MP3: an ID3 tag or an MPEG audio frame. An error page or an empty answer does not. */
export function isMp3(bytes: Buffer): boolean {
  if (bytes.length < 4) return false;
  if (bytes.toString("latin1", 0, 3) === "ID3") return true;
  return bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0;
}

export const register: Register = (router, { ai, config }) => {
  const folder = join(config.dataDir, "speech");
  let voices: Promise<readonly Voice[]> | null = null;
  const why = createRedactor([config.geminiKey, config.elevenLabsKey]);
  /**
   * The voice list, asked for once and kept. A list that fails, is empty, or has not come by the time the line asking
   * for it gives up, is forgotten, so the next line asks again instead of waiting on a call that will never answer.
   */
  const listOnce = (list: (signal: AbortSignal) => Promise<readonly Voice[]>, signal: AbortSignal): Promise<readonly Voice[]> => {
    const asked = new Promise<readonly Voice[]>((resolve, reject) => {
      const gaveUp = (): void => { reject(signal.reason instanceof Error ? signal.reason : new Error("gave up on the voice list")); };
      signal.addEventListener("abort", gaveUp, { once: true });
      list(signal).then((found) => {
        // An empty list is a wrong answer, not a fact to keep: kept, every later line would fail until a restart.
        if (found.length === 0) reject(new Error("no voice available"));
        else resolve(found);
      }, reject);
    });
    asked.catch(() => {
      if (voices === asked) voices = null;
    });
    return asked;
  };
  // Lines being made right now, by cache file, so a second request for the same line waits instead of paying twice.
  const making = new Map<string, Promise<Buffer>>();

  router.post("/api/speech", async (request, response) => {
    const parsed = SpeechRequest.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "bad_request" });
      return;
    }
    const { text, voice: character } = parsed.data;
    const file = join(folder, `${createHash("sha256").update(`${character}\n${text}`).digest("hex").slice(0, 32)}.mp3`);
    try {
      if (existsSync(file)) {
        response.type("audio/mpeg").send(readFileSync(file));
        return;
      }
      const { speech, voices: listVoices } = ai;
      if (speech === null || listVoices === null) {
        response.status(503).json({ error: "unavailable" });
        return;
      }
      let job = making.get(file);
      if (job === undefined) {
        job = withTimeout(config.timeouts.speechMs, async (signal) => {
          voices ??= listOnce(listVoices, signal);
          const voice = pickVoice(character, await voices, forcedVoice(character));
          if (voice === null) throw new Error("no voice available");
          const bytes = await speech({ text, voiceId: voice.id, model: MODEL, signal });
          // Checked before it is cached: a saved error page would be this line's "voice" for good.
          if (!isMp3(bytes)) throw new Error("the speech service did not answer with audio");
          return bytes;
        })
          .then((bytes) => {
            mkdirSync(folder, { recursive: true });
            writeFileSync(file, bytes);
            return bytes;
          })
          .finally(() => {
            making.delete(file);
          });
        making.set(file, job);
      }
      response.type("audio/mpeg").send(await job);
    } catch (error) {
      log("warn", "speech_failed", why(error));
      response.status(503).json({ error: "unavailable" });
    }
  });
};
