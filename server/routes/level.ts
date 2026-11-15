// POST /api/level: the player's phrase in, a generated fight out. Always answers with a valid level.
import { LevelRequestSchema, LevelSpecSchema } from "../../src/ai/contracts";
import type { LevelResponse } from "../../src/ai/contracts";
import { fallbackLevel } from "../../src/ai/fallbacks";
import { repairLevel } from "../../src/ai/repair";
import { log } from "../../src/core/log";
import type { Register } from "../app";
import { createRedactor } from "../lib/redact";
import { withTimeout } from "../lib/timeout";
import { levelPrompt } from "../prompts";
import { wireSchema } from "../schema";

const SCHEMA = wireSchema(LevelSpecSchema);

export const register: Register = (router, { ai, config }) => {
  const why = createRedactor([config.geminiKey, config.elevenLabsKey]);

  router.post("/api/level", async (request, response) => {
    const parsed = LevelRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "bad_request", issues: parsed.error.issues.map((issue) => issue.message) });
      return;
    }
    const base = fallbackLevel(parsed.data);
    const answer = (body: LevelResponse): void => { response.json(body); };
    const generate = ai.json;
    if (generate === null) {
      answer({ level: base, source: "fallback" });
      return;
    }
    try {
      // A fight takes most of the limit to write, so the first model gets all of it: a second one started halfway
      // could not finish. The second model is only asked when the first fails fast.
      const raw = await withTimeout(config.timeouts.levelMs, (signal) =>
        generate({ prompt: levelPrompt(parsed.data), schema: SCHEMA, signal, attemptMs: config.timeouts.levelMs }),
      );
      const level = repairLevel(raw, base);
      if (level === null) log("warn", "level_unusable", { phrase: parsed.data.phrase });
      answer(level === null ? { level: base, source: "fallback" } : { level, source: "ai" });
    } catch (error) {
      log("warn", "level_failed", why(error));
      answer({ level: base, source: "fallback" });
    }
  });
};
