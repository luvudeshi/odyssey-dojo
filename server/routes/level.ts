// POST /api/level: the player's phrase in, a generated fight out. Always answers with a valid level.
import { LevelRequestSchema, LevelSpecSchema } from "../../src/ai/contracts";
import type { LevelResponse } from "../../src/ai/contracts";
import { fallbackLevel } from "../../src/ai/fallbacks";
import { repairLevel } from "../../src/ai/repair";
import { log } from "../../src/core/log";
import type { Register } from "../app";
import { withTimeout } from "../lib/timeout";
import { levelPrompt } from "../prompts";
import { wireSchema } from "../schema";

const SCHEMA = wireSchema(LevelSpecSchema);

export const register: Register = (router, { ai, config }) => {
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
      const raw = await withTimeout(config.timeouts.levelMs, (signal) =>
        generate({ prompt: levelPrompt(parsed.data), schema: SCHEMA, signal }),
      );
      const level = repairLevel(raw, base);
      if (level === null) log("warn", "level_unusable", { phrase: parsed.data.phrase });
      answer(level === null ? { level: base, source: "fallback" } : { level, source: "ai" });
    } catch (error) {
      log("warn", "level_failed", error);
      answer({ level: base, source: "fallback" });
    }
  });
};
