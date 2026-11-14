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
import { withTimeout } from "../lib/timeout";

const SpeechRequest = z.object({ text: z.string().trim().min(1).max(500), voice: z.enum(CHARACTERS) });
// Quick enough to speak a line the player is waiting for.
const MODEL = "eleven_flash_v2_5";
const LIVE_BUDGET_MS = 8000;

export const register: Register = (router, { ai, config }) => {
  const folder = join(config.dataDir, "speech");
  let voices: Promise<readonly Voice[]> | null = null;

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
      const bytes = await withTimeout(LIVE_BUDGET_MS, async (signal) => {
        voices ??= listVoices(signal).catch((error: unknown) => {
          voices = null;
          throw error;
        });
        const voice = pickVoice(character, await voices, forcedVoice(character));
        if (voice === null) throw new Error("no voice available");
        return speech({ text, voiceId: voice.id, model: MODEL, signal });
      });
      mkdirSync(folder, { recursive: true });
      writeFileSync(file, bytes);
      response.type("audio/mpeg").send(bytes);
    } catch (error) {
      log("warn", "speech_failed", error);
      response.status(503).json({ error: "unavailable" });
    }
  });
};
