// POST /api/reveal: a webcam snapshot in, the player's god out. GET /api/portrait/:id: the stylised portrait once it is painted.
// The snapshot and the portrait are held in memory only: never written to disk, never logged.
import { z } from "zod";
import { GOD_IDS, RevealRequestSchema, RevealSchema } from "../../src/ai/contracts";
import type { RevealResponse, RevealWire } from "../../src/ai/contracts";
import { RIVALS } from "../../src/ai/rivals";
import { log } from "../../src/core/log";
import type { InlineImage } from "../ai/types";
import type { Register } from "../app";
import { createPortraitStore } from "../lib/portraits";
import { withTimeout } from "../lib/timeout";
import { portraitPrompt, REVEAL_PROMPT } from "../revealPrompts";
import { wireSchema } from "../schema";

const SCHEMA = wireSchema(RevealSchema);
const PREFIX = "data:image/jpeg;base64,";
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const EPITHET_MAX = RevealSchema.shape.epithet.maxLength ?? 80;
const REASON_MAX = RevealSchema.shape.reason.maxLength ?? 240;

const God = z.preprocess((value) => (typeof value === "string" ? value.trim().toLowerCase() : value), z.enum(GOD_IDS));
/** The model's answer before repair: the god must be one of ours, the rest is tidied. */
const LooseSchema = z.object({
  god: God,
  epithet: z.string(),
  reason: z.string(),
  rival_god: God.optional().catch(undefined),
});

const tidy = (text: string, max: number): string => text.replace(/\s+/g, " ").trim().slice(0, max).trim();

/** Short and never the request itself, so a failure cannot put a snapshot in the log. */
const why = (error: unknown): string => (error instanceof Error ? error.message.slice(0, 300) : "unknown error");

function repairReveal(raw: unknown): RevealWire | null {
  const loose = LooseSchema.safeParse(raw);
  if (!loose.success) return null;
  const { god, rival_god: rival } = loose.data;
  const reveal = RevealSchema.safeParse({
    god,
    epithet: tidy(loose.data.epithet, EPITHET_MAX),
    reason: tidy(loose.data.reason, REASON_MAX),
    rival_god: rival === undefined || rival === god ? RIVALS[god] : rival,
  });
  return reveal.success ? reveal.data : null;
}

export const register: Register = (router, { ai, config }) => {
  const portraits = createPortraitStore();

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
    let reveal: RevealWire | null;
    try {
      reveal = repairReveal(await withTimeout(config.timeouts.revealMs, (signal) =>
        see({ prompt: REVEAL_PROMPT, image, schema: SCHEMA, signal }),
      ));
    } catch (error) {
      log("warn", "reveal_failed", why(error));
      unavailable();
      return;
    }
    if (reveal === null) {
      log("warn", "reveal_unusable");
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
};
