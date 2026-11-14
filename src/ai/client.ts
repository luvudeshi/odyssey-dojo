// How the game asks for a generated fight. Never rejects and never hangs: on any problem it returns a bundled level.
import { log } from "../core/log";
import { LevelResponseSchema } from "./contracts";
import type { LevelRequest, LevelResponse } from "./contracts";
import { fallbackLevel } from "./fallbacks";

const LEVEL_TIMEOUT_MS = 10000;

export async function generateLevel(
  request: LevelRequest,
  options: { readonly timeoutMs?: number; readonly fetcher?: typeof fetch } = {},
): Promise<LevelResponse> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher("/api/level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(options.timeoutMs ?? LEVEL_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`level request failed with ${String(response.status)}`);
    return LevelResponseSchema.parse(await response.json());
  } catch (error) {
    log("warn", "level_offline", error);
    return { level: fallbackLevel(request), source: "fallback" };
  }
}
