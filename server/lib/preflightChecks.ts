// The demo-day checks behind server/tools/preflight.ts. Each check returns lines; nothing here prints or exits.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AiClients } from "../ai/types";
import { withTimeout } from "./timeout";

/** FAIL means the demo would break. WARN means the game still runs, on a fallback. */
export type Level = "PASS" | "WARN" | "FAIL" | "SKIP";

export interface Result {
  readonly level: Level;
  readonly name: string;
  readonly detail: string;
}

/** Where src/pose/tracker.ts loads the pose model and its runtime from, under public/. A test fails if these drift. */
export const POSE_MODEL = "mediapipe/pose_landmarker_lite.task";
export const POSE_WASM_DIR = "mediapipe/wasm";
/** The two files the MediaPipe loader fetches from the wasm folder. */
const POSE_WASM_FILES = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"] as const;

/** Clip folders under public/audio. The game needs the first two; the rest are checked only when they exist. */
const CLIP_FOLDERS: readonly (readonly [folder: string, label: string, required: boolean])[] = [
  ["athena", "Athena", true],
  ["sfx", "effects", true],
  ["music", "music", false],
  ["narration", "narration", false],
  ["taunts", "taunts", false],
];
const GEMINI_FALLBACK = "the game falls back to bundled fights and the browser god scan";
const SPEECH_FALLBACK = "the game plays the bundled clips, and lines written at run time stay silent";
const HEALTH_MS = 2000;

const result = (level: Level, name: string, detail: string): Result => ({ level, name, detail });
const filled = (file: string): boolean => existsSync(file) && statSync(file).size > 0;
const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 160);
const list = (items: readonly string[]): string =>
  items.length > 5 ? `${items.slice(0, 5).join(", ")} and ${String(items.length - 5)} more` : items.join(", ");

/** The ids in a folder's index.json, or null when the file is missing or is not a list of strings. */
function readIndex(folder: string): readonly string[] | null {
  try {
    const data: unknown = JSON.parse(readFileSync(join(folder, "index.json"), "utf8"));
    return Array.isArray(data) && data.every((id) => typeof id === "string") ? data : null;
  } catch {
    return null;
  }
}

/** Check 1: every listed clip has a non-empty file, and every clip file is listed. Reads the disk only. */
export function checkClips(audioDir: string): Result {
  const counts: string[] = [];
  const broken: string[] = [];
  const unlisted: string[] = [];
  for (const [name, label, required] of CLIP_FOLDERS) {
    const folder = join(audioDir, name);
    if (!existsSync(folder)) {
      if (required) broken.push(`${name}/ is missing`);
      continue;
    }
    const ids = readIndex(folder);
    if (ids === null) {
      broken.push(`${name}/index.json is missing or is not a list of ids`);
      continue;
    }
    const files = readdirSync(folder).filter((file) => file.endsWith(".mp3"));
    for (const id of ids) if (!filled(join(folder, `${id}.mp3`))) broken.push(`${name}/${id}.mp3 is missing or empty`);
    for (const file of files) if (!ids.includes(file.slice(0, -4))) unlisted.push(`${name}/${file}`);
    counts.push(`${String(ids.length)} ${label}`);
  }
  if (broken.length > 0) return result("FAIL", "clips", list(broken));
  if (unlisted.length > 0) return result("WARN", "clips", `${counts.join(", ")}; not in an index, so never played: ${list(unlisted)}`);
  return result("PASS", "clips", counts.join(", "));
}

/** Check 2: says only whether each key is set. It never sees more of a key than that. */
export function checkKeys(keys: { readonly gemini: boolean; readonly elevenLabs: boolean }): Result {
  const word = (present: boolean): string => (present ? "present" : "missing");
  const detail = `GEMINI_API_KEY ${word(keys.gemini)}, ELEVENLABS_API_KEY ${word(keys.elevenLabs)}`;
  return keys.gemini && keys.elevenLabs
    ? result("PASS", "keys", detail)
    : result("WARN", "keys", `${detail}; the game runs without them, on its bundled fights and clips`);
}

/** Check 3: one tiny JSON call. Any failure is a warning, because the game has a fallback. */
export async function checkGemini(json: AiClients["json"], timeoutMs: number, now: () => number = Date.now): Promise<Result> {
  if (json === null) return result("WARN", "gemini", `no key, so not tried; ${GEMINI_FALLBACK}`);
  const started = now();
  let model = "a model";
  try {
    await withTimeout(timeoutMs, (signal) =>
      json({
        prompt: 'Answer with the JSON object {"ok": true}.',
        schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
        signal,
        onModel: (name) => { model = name; },
      }),
    );
    return result("PASS", "gemini", `${model} answered in ${String(now() - started)} ms`);
  } catch (error) {
    return result("WARN", "gemini", `no answer (${reason(error)}); ${GEMINI_FALLBACK}`);
  }
}

/** Check 4: lists the voices, which costs no credits. */
export async function checkElevenLabs(voices: AiClients["voices"], timeoutMs: number, now: () => number = Date.now): Promise<Result> {
  if (voices === null) return result("WARN", "elevenlabs", `no key, so not tried; ${SPEECH_FALLBACK}`);
  const started = now();
  try {
    const found = await withTimeout(timeoutMs, (signal) => voices(signal));
    if (found.length === 0) return result("WARN", "elevenlabs", `answered, but this key has no voices; ${SPEECH_FALLBACK}`);
    return result("PASS", "elevenlabs", `${String(found.length)} voices listed in ${String(now() - started)} ms`);
  } catch (error) {
    return result("WARN", "elevenlabs", `no answer (${reason(error)}); ${SPEECH_FALLBACK}`);
  }
}

/** Check 5: is our AI server answering GET /api/health on this machine? */
export async function checkServer(port: number, fetcher: typeof fetch = fetch): Promise<Result> {
  const down = result("WARN", "ai server", `nothing answers on port ${String(port)}; start it with npm run dev:all`);
  try {
    const response = await fetcher(`http://127.0.0.1:${String(port)}/api/health`, { signal: AbortSignal.timeout(HEALTH_MS) });
    const body = (await response.json()) as { ok?: unknown; gemini?: unknown; speech?: unknown } | null;
    if (!response.ok || body?.ok !== true) return down;
    const has = (value: unknown): string => (value === true ? "yes" : "no");
    return result("PASS", "ai server", `up on port ${String(port)} (gemini ${has(body.gemini)}, speech ${has(body.speech)})`);
  } catch {
    return down;
  }
}

/** Check 6: the pose model and its runtime are on this disk, so the camera works with no network. */
export function checkPoseFiles(publicDir: string): Result {
  const needed = [POSE_MODEL, ...POSE_WASM_FILES.map((file) => `${POSE_WASM_DIR}/${file}`)];
  const missing = needed.filter((file) => !filled(join(publicDir, file)));
  return missing.length === 0
    ? result("PASS", "pose model", `${String(needed.length)} files in public/mediapipe`)
    : result("FAIL", "pose model", `missing under public/: ${missing.join(", ")}; run npm install with a network connection`);
}

/** One plain line for the terminal. Any secret that slipped into a detail is blanked out. */
export function formatLine(line: Result, secrets: readonly (string | null)[] = []): string {
  let text = `${line.level} ${line.name}: ${line.detail}`;
  for (const secret of secrets) if (secret !== null && secret !== "") text = text.replaceAll(secret, "[hidden]");
  return text;
}

/** The last line, and the exit code: 1 only when something would break the demo. */
export function summary(results: readonly Result[]): { readonly line: string; readonly exitCode: 0 | 1 } {
  const count = (level: Level): number => results.filter((entry) => entry.level === level).length;
  const fails = count("FAIL");
  const verdict = fails > 0 ? "NOT READY" : count("WARN") > 0 ? "ready, with fallbacks in use" : "ready";
  const line = `preflight: ${String(count("PASS"))} pass, ${String(count("WARN"))} warn, ${String(fails)} fail. ${verdict}`;
  return { line, exitCode: fails > 0 ? 1 : 0 };
}
