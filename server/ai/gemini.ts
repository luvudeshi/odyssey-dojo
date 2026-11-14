// Google Gemini through the Interactions API. Model ids and field names were checked against the docs on 2026-11-14.
import { GoogleGenAI } from "@google/genai";
import type { AiClients, ImageRequest, JsonRequest } from "./types";

// Fastest stable model that takes an image and returns schema-bound JSON; the second is tried once if the first fails.
const JSON_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] as const;
// Fastest image model first. Image models have no free tier: the key's project needs billing.
const IMAGE_MODELS = ["gemini-3.1-flash-lite-image", "gemini-nano-banana-2.1"] as const;
const JSON_ATTEMPT_MS = 5000;
const IMAGE_ATTEMPT_MS = 11000;

function status(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

/** A bad request, a bad key or no permission fails the same way on every model, so there is no point retrying. */
function hopeless(error: unknown): boolean {
  const code = status(error);
  return code === 400 || code === 401 || code === 403;
}

export function createGemini(apiKey: string): Pick<AiClients, "json" | "image"> {
  // Image input and image output are only served by the v1beta API.
  const client = new GoogleGenAI({ apiKey, apiVersion: "v1beta" });

  async function jsonOnce(model: string, request: JsonRequest): Promise<unknown> {
    const interaction = await client.interactions.create(
      {
        model,
        input: request.image
          ? [
              { type: "text", text: request.prompt },
              { type: "image", data: request.image.base64, mime_type: "image/jpeg" },
            ]
          : request.prompt,
        response_format: { type: "text", mime_type: "application/json", schema: request.schema },
        generation_config: { thinking_level: "minimal", max_output_tokens: 4096 },
        // Never keep a player's photo or phrase as a stored interaction.
        store: false,
      },
      {
        // A signal replaces the SDK's own timeout, and its default is four slow retries: fail fast instead.
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(JSON_ATTEMPT_MS)]),
        retries: { strategy: "none" },
      },
    );
    if (interaction.status !== "completed" || !interaction.output_text) {
      throw new Error(`gemini ${model} ended ${interaction.status} with no text`);
    }
    const answer = JSON.parse(interaction.output_text) as unknown;
    request.onModel?.(model);
    return answer;
  }

  async function imageOnce(model: string, request: ImageRequest): Promise<Buffer | null> {
    const interaction = await client.interactions.create(
      {
        model,
        input: [
          { type: "image", mime_type: "image/jpeg", data: request.image.base64 },
          { type: "text", text: request.prompt },
        ],
        response_format: { type: "image", aspect_ratio: "3:4" },
        generation_config: { thinking_level: "minimal" },
        store: false,
      },
      {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(IMAGE_ATTEMPT_MS)]),
        retries: { strategy: "none" },
      },
    );
    const data = interaction.output_image?.data;
    return data ? Buffer.from(data, "base64") : null;
  }

  async function firstThatWorks<T>(models: readonly string[], run: (model: string) => Promise<T | null>, signal: AbortSignal): Promise<T | null> {
    let last: Error | null = null;
    for (const model of models) {
      try {
        const result = await run(model);
        if (result !== null) return result;
      } catch (error) {
        if (signal.aborted || hopeless(error)) throw error;
        last = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (last !== null) throw last;
    return null;
  }

  return {
    async json(request) {
      const result = await firstThatWorks(JSON_MODELS, (model) => jsonOnce(model, request), request.signal);
      if (result === null) throw new Error("gemini returned nothing");
      return result;
    },
    image(request) {
      return firstThatWorks(IMAGE_MODELS, (model) => imageOnce(model, request), request.signal);
    },
  };
}
