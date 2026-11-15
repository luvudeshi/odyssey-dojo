// POST /api/reveal: a webcam snapshot in, the player's god out. GET /api/portrait/:id: the stylised portrait once it is painted.
// The snapshot and the portrait are held in memory only: never written to disk, never logged.
// The vision call is hedged (../lib/hedge): a slow or failed first attempt gets one second attempt, so a single late
// answer from the model does not send the player to the lot. Only this call is hedged. It is one cheap request.
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { GOD_IDS, RevealRequestSchema, RevealSchema } from "../../src/ai/contracts";
import type { GodId, RevealResponse, RevealWire } from "../../src/ai/contracts";
import { asSentence, REASON_MAX } from "../../src/ai/revealText";
import { rivalFor } from "../../src/ai/rivals";
import { log } from "../../src/core/log";
import type { InlineImage } from "../ai/types";
import type { Register } from "../app";
import { hedged } from "../lib/hedge";
import { createPortraitStore } from "../lib/portraits";
import { createRedactor } from "../lib/redact";
import { withTimeout } from "../lib/timeout";
import { asEpithet, SAFE_LINES, unfit } from "../revealGuard";
import { portraitPrompt, REVEAL_PROMPT } from "../revealPrompts";
import { wireSchema } from "../schema";

const SCHEMA = wireSchema(RevealSchema);
const PREFIX = "data:image/jpeg;base64,";
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const EPITHET_MAX = RevealSchema.shape.epithet.maxLength ?? 80;
const UNUSABLE = "the model's answer was not a god the game knows";

const God = z.preprocess((value) => (typeof value === "string" ? value.trim().toLowerCase() : value), z.enum(GOD_IDS));
/** The model's answer before repair: the god must be one of ours, the rest is tidied. */
const LooseSchema = z.object({
  god: God,
  epithet: z.string(),
  reason: z.string(),
  rival_god: God.optional().catch(undefined),
});

/** The model's line once tidied, or the god's fixed line when the guard says it cannot be shown. */
function safe(god: GodId, field: "epithet" | "reason", text: string): string {
  if (!unfit(god, field, text)) return text;
  log("warn", "reveal_reworded", field);
  return SAFE_LINES[god][field];
}

function repairReveal(raw: unknown): RevealWire | null {
  const loose = LooseSchema.safeParse(raw);
  if (!loose.success) return null;
  const { god, rival_god: rival } = loose.data;
  const reveal = RevealSchema.safeParse({
    god,
    epithet: safe(god, "epithet", asEpithet(loose.data.epithet, EPITHET_MAX)),
    reason: safe(god, "reason", asSentence(loose.data.reason, REASON_MAX)),
    // Never Athena, who coaches the player, and never the god itself.
    rival_god: rivalFor(god, rival),
  });
  return reveal.success ? reveal.data : null;
}

export const register: Register = (router, { ai, config }) => {
  const portraits = createPortraitStore();
  // An error that echoes the request or the key cannot put a snapshot or a key in the log.
  const why = createRedactor([config.geminiKey, config.elevenLabsKey]);

  router.post("/api/reveal", async (request, response) => {
    const parsed = RevealRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "bad_request", issues: parsed.error.issues.map((issue) => issue.message) });
      return;
    }
    const image: InlineImage = { mime: "image/jpeg", base64: parsed.data.image.slice(PREFIX.length) };
    if (!BASE64.test(image.base64)) {
      response.status(400).json({ error: "bad_request", issues: ["image is not base64"] });
      return;
    }
    // 503 tells the browser to run its own offline scan.
    const unavailable = (): void => { response.status(503).json({ error: "unavailable" }); };
    const see = ai.json;
    if (see === null) {
      unavailable();
      return;
    }
    let reveal: RevealWire;
    try {
      const answer = await hedged(
        {
          totalMs: config.timeouts.revealMs,
          hedgeAfterMs: config.timeouts.revealHedgeMs,
          onSecond: (reason) => { log("info", "reveal_second_attempt", reason); },
          onFailure: (error, attempt) => { log("warn", "reveal_attempt_failed", { attempt, why: why(error) }); },
        },
        async (signal) => {
          const usable = repairReveal(await see({ prompt: REVEAL_PROMPT, image, schema: SCHEMA, signal }));
          // Thrown, so an answer that is not a god counts as a failed attempt and the other attempt is waited for.
          if (usable === null) throw new Error(UNUSABLE);
          return usable;
        },
      );
      reveal = answer.value;
    } catch (error) {
      log("warn", "reveal_failed", why(error));
      unavailable();
      return;
    }
    const paint = ai.image;
    const prompt = portraitPrompt(reveal.god);
    // Not awaited: the god is shown at once and the portrait is fetched when it is ready.
    const portraitId = paint === null ? null : portraits.add(
      withTimeout(config.timeouts.portraitMs, (signal) => paint({ prompt, image, signal })).catch((error: unknown) => {
        log("warn", "portrait_failed", why(error));
        return null;
      }),
    );
    const body: RevealResponse = { ...reveal, portrait_id: portraitId };
    response.json(body);
  });

  router.get("/api/portrait/:id", async (request, response) => {
    // The painting gives up config.timeouts.portraitMs after it was started, so this never waits longer than that.
    const portrait = await portraits.get(request.params.id);
    response.set("Cache-Control", "no-store");
    if (portrait === null) response.status(204).end();
    else response.type(portrait.type).send(portrait.bytes);
  });

  // A portrait request never answers 500: an id Express cannot decode, or any other error on this path, is "no portrait".
  // Express only treats a handler as an error handler when it takes four arguments.
  router.use("/api/portrait", (error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) next(error);
    else response.set("Cache-Control", "no-store").status(204).end();
  });
};
