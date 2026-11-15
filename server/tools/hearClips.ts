// Checks what every voice clip says: sends each to speech to text and compares the transcript with the line it is meant to say.
//   npx tsx --env-file=<path to .env> server/tools/hearClips.ts            the table: clip, verdict, expected, heard
//   npx tsx --env-file=<path to .env> server/tools/hearClips.ts --check    the same, and exit 1 when a clip differs
//                                                                          (a clip that could not be checked is always exit 1)
//                                                                          (--cache=<file> keeps the transcripts somewhere else)
//                                                                          (--only=<text> checks just the clips whose path has it)
// A machine transcript, not a person listening: docs/audio-heard.md says what that does and does not show.
// Uses ElevenLabs speech to text (POST /v1/speech-to-text, checked against the API reference on 2026-11-14), which
// gives the time of each word and how sure it was of it: a clip with the right words and a half guessed one is
// "unsure?". Each clip is sent once: transcripts are kept in server/data/hear-clips.json (ignored
// by git) under what was asked and the hash of the clip's bytes, so a second run sends only clips that changed. With
// ffmpeg on PATH the level at the end of each clip is measured too. A refused key, a rate limit, a request that gets
// no answer in 60 s, or three failures in a row stop the run. Not part of make check. Never prints the key.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { ElevenLabsError } from "../ai/elevenlabs";
import { loadConfig } from "../env";
import { TimeoutError, withTimeout } from "../lib/timeout";
import type { Heard, Report, Verdict } from "./hearRules";
import { END_WINDOW_MS, judge, readAnswer, REQUEST, requestTally, stopReason, transcriptId, voiceScript } from "./hearRules";

const API = "https://api.elevenlabs.io/v1/speech-to-text";
/** The folders that hold voice clips. Effects, stop sounds and music say nothing. */
const VOICE_FOLDERS = ["athena", "narration", "taunts"] as const;
const CACHE = "server/data/hear-clips.json";
const SAMPLE_RATE = 44100;
/** What is kept of one answer. */
type Transcript = Pick<Heard, "text" | "words" | "durationMs">;
const Kept = z.object({
  text: z.string(),
  words: z.array(z.object({ text: z.string(), startMs: z.number(), endMs: z.number(), logprob: z.number().nullable() })),
  durationMs: z.number().nullable(),
});

// A person reads this in a terminal, so it is plain lines on stdout, not the JSON lines log() writes.
const say = (text: string): void => { process.stdout.write(`${text}\n`); };

async function transcribe(key: string, bytes: Buffer, signal: AbortSignal): Promise<Transcript> {
  const form = new FormData();
  for (const [name, value] of Object.entries(REQUEST)) form.set(name, value);
  form.set("file", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), "clip.mp3");
  const response = await fetch(API, { method: "POST", headers: { "xi-api-key": key }, body: form, signal });
  // The API does not send the key back, but nothing it says is printed without making sure.
  const body = (await response.text().catch(() => "")).replaceAll(key, "<key>");
  if (!response.ok) throw new ElevenLabsError(response.status, body);
  return readAnswer(body);
}

/** The clip's length and the level of its last END_WINDOW_MS, from ffmpeg. Null when ffmpeg is not there or cannot read it. */
function measureEnd(file: string): { readonly durationMs: number; readonly endDb: number } | null {
  const decoded = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(SAMPLE_RATE), "pipe:1"], { maxBuffer: 256 * 1024 * 1024 });
  if (decoded.error !== undefined || decoded.status !== 0) return null;
  const pcm = decoded.stdout;
  const samples = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + Math.floor(pcm.length / 4) * 4));
  if (samples.length === 0) return null;
  const from = Math.max(0, samples.length - Math.round((END_WINDOW_MS / 1000) * SAMPLE_RATE));
  let squares = 0;
  for (let index = from; index < samples.length; index++) squares += (samples[index] ?? 0) ** 2;
  const rms = Math.sqrt(squares / (samples.length - from));
  // Digital silence has no level in dB; -120 is under anything a clip holds.
  return { durationMs: (samples.length / SAMPLE_RATE) * 1000, endDb: rms > 0 ? Math.max(-120, 20 * Math.log10(rms)) : -120 };
}

/** The transcripts kept from earlier runs. An entry that does not read as one is dropped, so its clip is sent again. */
function readCache(file: string): Record<string, Transcript> {
  if (!existsSync(file)) return {};
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
  const entries = z.record(z.string(), z.unknown()).safeParse(json);
  if (!entries.success) return {};
  const kept: Record<string, Transcript> = {};
  for (const [id, entry] of Object.entries(entries.data)) {
    const parsed = Kept.safeParse(entry);
    if (parsed.success) kept[id] = parsed.data;
  }
  return kept;
}

function detail(report: Report): string {
  const parts: string[] = [];
  if (report.notHeard.length > 0) parts.push(`not heard: ${report.notHeard.join(" ")}`);
  if (report.extra.length > 0) parts.push(`heard and not in the line: ${report.extra.join(" ")}`);
  parts.push(...report.timing);
  if (report.unsure.length > 0) parts.push(`not sure of: ${report.unsure.join(", ")}`);
  return parts.join("; ");
}

async function main(): Promise<void> {
  const flags = process.argv.slice(2);
  const root = process.cwd();
  const audio = resolve(root, "public/audio");
  const cacheFile = resolve(root, flags.find((flag) => flag.startsWith("--cache="))?.slice("--cache=".length) ?? CACHE);
  const cache = readCache(cacheFile);
  const lines = voiceScript();
  const onDisk = VOICE_FOLDERS.flatMap((folder) =>
    readdirSync(join(audio, folder)).filter((file) => file.endsWith(".mp3")).map((file) => `${folder}/${file}`),
  );
  const only = flags.find((flag) => flag.startsWith("--only="))?.slice("--only=".length) ?? "";
  const paths = [...new Set([...lines.keys(), ...onDisk])].sort().filter((path) => path.includes(only));
  const key = loadConfig(root).elevenLabsKey;

  const counts: Record<Verdict | "failed", number> = { same: 0, differs: 0, "cut?": 0, "unsure?": 0, failed: 0 };
  let made = 0;
  let answered = 0;
  let failuresInARow = 0;
  let unmeasured = 0;
  let stopped: string | null = null;
  say(`${"clip".padEnd(42)} ${"verdict".padEnd(8)} expected | heard`);
  for (const path of paths) {
    const expected = lines.get(path);
    const file = join(audio, path);
    const fail = (why: string): void => {
      counts.failed += 1;
      say(`${path.padEnd(42)} ${"FAILED".padEnd(8)} ${why}`);
    };
    if (expected === undefined) {
      fail("no line in the script names this clip");
      continue;
    }
    if (!existsSync(file)) {
      fail(`there is no clip for "${expected}"`);
      continue;
    }
    const bytes = readFileSync(file);
    const id = transcriptId(REQUEST, createHash("sha256").update(bytes).digest("hex"));
    let transcript = cache[id];
    if (transcript === undefined) {
      if (key === null || stopped !== null) {
        fail(`not sent: ${stopped ?? "ELEVENLABS_API_KEY is not set"}`);
        continue;
      }
      made += 1;
      try {
        transcript = await withTimeout(60000, (signal) => transcribe(key, bytes, signal));
      } catch (error) {
        failuresInARow += 1;
        stopped = stopReason({ httpStatus: error instanceof ElevenLabsError ? error.httpStatus : null, timedOut: error instanceof TimeoutError }, failuresInARow);
        fail(`speech to text failed: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      answered += 1;
      failuresInARow = 0;
      cache[id] = transcript;
      mkdirSync(dirname(cacheFile), { recursive: true });
      writeFileSync(cacheFile, `${JSON.stringify(cache)}\n`);
    }
    const end = measureEnd(file);
    if (end === null) unmeasured += 1;
    const report = judge(expected, { ...transcript, durationMs: transcript.durationMs ?? end?.durationMs ?? null, endDb: end?.endDb ?? null });
    counts[report.verdict] += 1;
    say(`${path.padEnd(42)} ${report.verdict.padEnd(8)} ${expected} | ${transcript.text}`);
    if (report.verdict !== "same") say(`${"".padEnd(51)} ${detail(report)}`);
  }
  say(`${String(paths.length)} clips: ${String(counts.same)} same, ${String(counts.differs)} differ, ${String(counts["cut?"])} may be cut, ${String(counts["unsure?"])} unsure, ${String(counts.failed)} not checked. ${requestTally(made, answered)}; transcripts are kept in ${cacheFile}`);
  if (stopped !== null) say(`The run stopped sending: ${stopped}`);
  if (unmeasured > 0) say(`ffmpeg could not read ${String(unmeasured)} clips (is it on PATH?), so the level at their end was not measured: a clip that stops mid-sound may show as "same"`);
  if (counts.failed > 0 || (flags.includes("--check") && counts.differs > 0)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  say(`hearClips: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
