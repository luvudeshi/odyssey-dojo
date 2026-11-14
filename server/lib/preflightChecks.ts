// The demo-day checks behind server/tools/preflight.ts. Each check returns lines; nothing here prints or exits.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AiClients } from "../ai/types";
import { withTimeout } from "./timeout";

/** FAIL means the demo loses something with no stand-in: Athena's voice or the camera. WARN means the game still runs. */
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

/** Clip folders under public/audio. The first two must exist; the rest are checked only when they exist.
 *  A problem in a soft folder is only a warning: src/audio/sfx.ts plays a synthesised sound when a file is missing. */
const CLIP_FOLDERS: readonly (readonly [folder: string, label: string, required: boolean, soft: boolean])[] = [
  ["athena", "Athena", true, false],
  ["sfx", "effects", true, true],
  ["music", "music", false, false],
  ["narration", "narration", false, false],
  ["taunts", "taunts", false, false],
];
const SFX_FALLBACK = "the game plays its built-in synthesised sounds instead";
const GEMINI_FALLBACK = "the game falls back to bundled fights and the browser god scan";
const SPEECH_FALLBACK = "the game plays the bundled clips, and lines written at run time stay silent";
const HEALTH_MS = 2000;
/** The longest line printed. A longer one is cut, after any key in it is hidden. */
const MAX_LINE = 400;

export interface KeyFlags {
  readonly gemini: boolean;
  readonly elevenLabs: boolean;
}

const result = (level: Level, name: string, detail: string): Result => ({ level, name, detail });
const filled = (file: string): boolean => existsSync(file) && statSync(file).size > 0;
// Not cut here: formatLine hides keys first and cuts second, so a cut can never leave part of a key.
const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));
/** The HTTP status on an SDK error, read the way server/ai/gemini.ts reads it. */
const httpStatus = (error: unknown): number | null =>
  typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : null;
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
  const soft: string[] = [];
  const unlisted: string[] = [];
  for (const [name, label, required, isSoft] of CLIP_FOLDERS) {
    const folder = join(audioDir, name);
    const bad = isSoft ? soft : broken;
    if (!existsSync(folder)) {
      if (required) bad.push(`${name}/ is missing`);
      continue;
    }
    const ids = readIndex(folder);
    if (ids === null) {
      bad.push(`${name}/index.json is missing or is not a list of ids`);
      continue;
    }
    const files = readdirSync(folder).filter((file) => file.endsWith(".mp3"));
    for (const id of ids) if (!filled(join(folder, `${id}.mp3`))) bad.push(`${name}/${id}.mp3 is missing or empty`);
    for (const file of files) if (!ids.includes(file.slice(0, -4))) unlisted.push(`${name}/${file}`);
    counts.push(`${String(ids.length)} ${label}`);
  }
  if (broken.length > 0) return result("FAIL", "clips", list([...broken, ...soft]));
  const notes = [counts.join(", ")];
  if (soft.length > 0) notes.push(`${list(soft)}; ${SFX_FALLBACK}`);
  if (unlisted.length > 0) notes.push(`not in an index, so never played: ${list(unlisted)}`);
  return result(notes.length > 1 ? "WARN" : "PASS", "clips", notes.join("; "));
}

/** Check 2: says only whether each key is set. It never sees more of a key than that. */
export function checkKeys(keys: KeyFlags): Result {
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
    // A bad key, a bad request and no permission all come back as one of these three.
    const code = httpStatus(error);
    if (code === 400 || code === 401 || code === 403) {
      return result("WARN", "gemini", `refused with HTTP ${String(code)}; check GEMINI_API_KEY; ${GEMINI_FALLBACK}`);
    }
    return result("WARN", "gemini", `no answer; ${GEMINI_FALLBACK}. The error: ${reason(error)}`);
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
    return result("WARN", "elevenlabs", `no answer; ${SPEECH_FALLBACK}. The error: ${reason(error)}`);
  }
}

/** Check 5: is our AI server answering GET /api/health on this machine, and did it start with the keys we have here? */
export async function checkServer(port: number, keys: KeyFlags, fetcher: typeof fetch = fetch): Promise<Result> {
  const down = result("WARN", "ai server", `nothing answers on port ${String(port)}; start it with npm run dev:all`);
  try {
    const response = await fetcher(`http://127.0.0.1:${String(port)}/api/health`, { signal: AbortSignal.timeout(HEALTH_MS) });
    const body = (await response.json()) as { ok?: unknown; gemini?: unknown; speech?: unknown } | null;
    if (!response.ok || body?.ok !== true) return down;
    // A server started before .env was filled in, or from a folder with no .env, answers every AI route with its fallback.
    const without = [keys.gemini && body.gemini !== true ? "Gemini" : "", keys.elevenLabs && body.speech !== true ? "ElevenLabs" : ""]
      .filter((name) => name !== "");
    if (without.length > 0) {
      const detail = `up on port ${String(port)} but started without the ${without.join(" and ")} ${without.length > 1 ? "keys" : "key"}; restart it with npm run dev:all`;
      return result("WARN", "ai server", `${detail}; until then its routes answer with their fallbacks`);
    }
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

/** Blanks out every whole key in the text, then cuts it to one line of MAX_LINE. In that order, so no part of a key is left. */
export function hide(text: string, secrets: readonly (string | null)[] = []): string {
  let safe = text;
  for (const secret of secrets) if (secret !== null && secret !== "") safe = safe.replaceAll(secret, "[hidden]");
  safe = safe.replace(/\s+/g, " ");
  return safe.length > MAX_LINE ? `${safe.slice(0, MAX_LINE)}...` : safe;
}

/** One plain line for the terminal. */
export function formatLine(line: Result, secrets: readonly (string | null)[] = []): string {
  return hide(`${line.level} ${line.name}: ${line.detail}`, secrets);
}

/** The last line, and the exit code: 1 only on a FAIL. */
export function summary(results: readonly Result[]): { readonly line: string; readonly exitCode: 0 | 1 } {
  const count = (level: Level): number => results.filter((entry) => entry.level === level).length;
  const fails = count("FAIL");
  const verdict = fails > 0 ? "NOT READY" : count("WARN") > 0 ? "ready, with fallbacks in use" : "ready";
  const line = `preflight: ${String(count("PASS"))} pass, ${String(count("WARN"))} warn, ${String(fails)} fail. ${verdict}`;
  return { line, exitCode: fails > 0 ? 1 : 0 };
}
