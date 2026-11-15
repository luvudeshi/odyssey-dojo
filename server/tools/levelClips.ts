// Measures every clip under public/audio and levels the voice clips (Athena, Homer and the monsters):
//   npx tsx server/tools/levelClips.ts            the table, and what --write would change
//   npx tsx server/tools/levelClips.ts --check    the same, and exit 1 when a voice clip is out of tolerance
//   npx tsx server/tools/levelClips.ts --write    re-encode the voice clips that are out of tolerance, then refresh the doc
//   npx tsx server/tools/levelClips.ts --doc      refresh the tables in docs/audio-levels.md and change no clip
//                                                 (--verbose with --write prints every try at a clip)
// Needs ffmpeg and ffprobe on PATH; no keys and no network. Effects, stop sounds and music are measured, never rewritten.
// Safe to run again whenever clips are added: a clip within tolerance is left byte for byte as it is.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Fix, Measure } from "./levelRules";
import { faults, formatTables, PEAK_CEILING_DBTP, planFix, playbackDb, refine, SILENCE_DBFS, withTables } from "./levelRules";

const DOC = "docs/audio-levels.md";
/** music.ts skips samples quieter than this at each end of a clip before it measures the loudness. */
const PADDING = 0.0002;
/** Tries at one clip before giving up on it. */
const MAX_TRIES = 6;

/** How a clip is encoded, so a rewrite keeps the rate, the channels and the bitrate it had. */
interface Format {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitRate: number;
}

// A person reads this in a terminal, so it is plain lines on stdout, not the JSON lines log() writes.
const say = (text: string): void => { process.stdout.write(`${text}\n`); };

function run(tool: string, args: readonly string[]): { readonly stdout: Buffer; readonly stderr: string } {
  const result = spawnSync(tool, args, { maxBuffer: 1024 * 1024 * 1024 });
  if (result.error) throw result.error;
  const stderr = result.stderr.toString();
  if (result.status !== 0) throw new Error(`${tool} failed: ${stderr.trim().split("\n").at(-1) ?? ""}`);
  return { stdout: result.stdout, stderr };
}

const onPath = (tool: string): boolean => spawnSync(tool, ["-version"]).error === undefined;

function probe(file: string): Format {
  const shown = run("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels,bit_rate", "-of", "default=nw=1", file]);
  const fields = new Map(shown.stdout.toString().split("\n").map((line) => {
    const [key = "", value = ""] = line.split("=");
    return [key, Number(value)] as const;
  }));
  const format = { sampleRate: fields.get("sample_rate") ?? 0, channels: fields.get("channels") ?? 0, bitRate: fields.get("bit_rate") ?? 0 };
  if (!(format.sampleRate > 0 && format.channels > 0 && format.bitRate > 0)) throw new Error(`ffprobe could not read the format of ${file}`);
  return format;
}

/** A number from the summary the ebur128 filter prints, such as "I: -15.8 LUFS". */
function summaryValue(summary: string, pattern: RegExp, file: string): number {
  const value = Number(pattern.exec(summary)?.[1]);
  if (!Number.isFinite(value)) throw new Error(`ffmpeg could not measure ${file}`);
  return value;
}

function measure(file: string, path: string, format: Format): Measure {
  const report = run("ffmpeg", ["-nostats", "-hide_banner", "-i", file, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]).stderr;
  const summary = report.slice(report.lastIndexOf("Summary:"));
  const pcm = run("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-c:a", "pcm_f32le", "pipe:1"]).stdout;
  const samples = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + Math.floor(pcm.length / 4) * 4));
  const { channels, sampleRate } = format;
  const frames = Math.floor(samples.length / channels);
  const size = (frame: number): number => {
    let top = 0;
    for (let channel = 0; channel < channels; channel++) top = Math.max(top, Math.abs(samples[frame * channels + channel] ?? 0));
    return top;
  };
  /** The frames between the quiet at each end: the first that passes `floor`, and one past the last. */
  const sounding = (floor: number): readonly [number, number] => {
    let first = 0;
    while (first < frames && size(first) <= floor) first++;
    let end = frames;
    while (end > first && size(end - 1) <= floor) end--;
    return [first, end];
  };
  const [first, end] = sounding(10 ** (SILENCE_DBFS / 20));
  const [from, to] = sounding(PADDING);
  let squares = 0;
  let peak = 0;
  for (let index = from * channels; index < to * channels; index++) {
    const value = samples[index] ?? 0;
    squares += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  const rms = to > from ? Math.sqrt(squares / ((to - from) * channels)) : 0;
  return {
    path,
    seconds: frames / sampleRate,
    lufs: summaryValue(summary, /I:\s+(-?[\d.]+) LUFS/, file),
    truePeak: summaryValue(summary, /Peak:\s+(-?[\d.]+) dBFS/, file),
    leadMs: (first / sampleRate) * 1000,
    tailMs: ((frames - end) / sampleRate) * 1000,
    playDb: playbackDb(path, rms, peak),
  };
}

function encode(source: string, target: string, format: Format, fix: Fix): void {
  const filters: string[] = [];
  if (fix.trimSeconds > 0) filters.push(`atrim=start=${fix.trimSeconds.toFixed(4)}`, "asetpts=PTS-STARTPTS");
  filters.push(`volume=${fix.gainDb.toFixed(2)}dB`);
  if (fix.limitDb !== null) filters.push(`alimiter=limit=${(10 ** (fix.limitDb / 20)).toFixed(4)}:level=false:latency=true`);
  const shape = ["-c:a", "libmp3lame", "-b:a", String(format.bitRate), "-ar", String(format.sampleRate), "-ac", String(format.channels)];
  run("ffmpeg", ["-v", "error", "-y", "-i", source, "-af", filters.join(","), ...shape, target]);
}

/** Every .mp3 under a folder, as paths from it with forward slashes, sorted. */
function clipPaths(folder: string): readonly string[] {
  const entries = readdirSync(folder, { recursive: true, encoding: "utf8" });
  return entries.map((entry) => entry.split("\\").join("/")).filter((entry) => entry.endsWith(".mp3")).sort();
}

const cell = (value: number, width: number, digits = 1): string => value.toFixed(digits).padStart(width);

function row(clip: Measure): string {
  const numbers = `${cell(clip.seconds, 6, 2)} ${cell(clip.lufs, 6)} ${cell(clip.truePeak, 6)} ${cell(clip.leadMs, 5, 0)} ${cell(clip.tailMs, 5, 0)} ${cell(clip.lufs + clip.playDb, 6)}`;
  const wrong = faults(clip);
  return `${clip.path.padEnd(44)} ${numbers}${wrong.length > 0 ? `  OUT: ${wrong.join("; ")}` : ""}`;
}

/**
 * Tries a fix, then better ones, and puts the best try in place: the one nearest its loudness among those that are
 * within tolerance and under the peak ceiling. Returns the clip as it now is, or null when no try was good enough.
 */
function level(file: string, source: Measure, format: Format, first: Fix, scratch: string, verbose: boolean): Measure | null {
  const made = join(scratch, "try.mp3");
  const kept = join(scratch, "best.mp3");
  let fix: Fix | null = first;
  let best: Measure | null = null;
  for (let tries = 0; fix !== null && tries < MAX_TRIES; tries++) {
    encode(file, made, format, fix);
    const result = measure(made, source.path, format);
    if (verbose) say(`  try ${String(tries + 1)}: gain ${fix.gainDb.toFixed(2)} dB, limit ${fix.limitDb?.toFixed(2) ?? "none"} -> ${result.lufs.toFixed(1)} LUFS, ${result.truePeak.toFixed(1)} dBTP`);
    const good = faults(result).length === 0 && result.truePeak <= PEAK_CEILING_DBTP;
    if (good && (best === null || Math.abs(fix.aimLufs - result.lufs) < Math.abs(fix.aimLufs - best.lufs))) {
      copyFileSync(made, kept);
      best = result;
    }
    // The encoder moves the peaks unevenly, so the tries can step back and forth around the ceiling. The best one is kept.
    fix = refine(fix, source, result);
  }
  if (best !== null) copyFileSync(kept, file);
  return best;
}

function main(): void {
  const flags = new Set(process.argv.slice(2));
  const root = process.cwd();
  const audio = resolve(root, "public/audio");
  if (!onPath("ffmpeg") || !onPath("ffprobe")) {
    say("levelClips: ffmpeg and ffprobe must be on PATH (on a Mac: brew install ffmpeg). Nothing was measured.");
    process.exitCode = 1;
    return;
  }
  const clips = clipPaths(audio).map((path) => {
    const file = join(audio, path);
    const format = probe(file);
    return { file, format, now: measure(file, path, format) };
  });
  say(`${"clip".padEnd(44)} ${"sec".padStart(6)} ${"LUFS".padStart(6)} ${"dBTP".padStart(6)} ${"lead".padStart(5)} ${"tail".padStart(5)} ${"heard".padStart(6)}`);
  for (const clip of clips) say(row(clip.now));

  let failed = 0;
  let changed = 0;
  const scratch = mkdtempSync(join(tmpdir(), "level-clips-"));
  try {
    for (const clip of clips) {
      const fix = planFix(clip.now);
      if (fix === null) continue;
      changed += 1;
      const how = `${fix.gainDb >= 0 ? "+" : ""}${fix.gainDb.toFixed(1)} dB${fix.limitDb === null ? "" : ", limited"}${fix.trimSeconds > 0 ? `, ${(fix.trimSeconds * 1000).toFixed(0)} ms cut from the start` : ""}`;
      if (!flags.has("--write")) {
        say(`would rewrite ${clip.now.path}: about ${how}`);
        continue;
      }
      const before = clip.now;
      const after = level(clip.file, before, clip.format, fix, scratch, flags.has("--verbose"));
      if (after === null) {
        failed += 1;
        say(`FAILED ${before.path}: no try came within tolerance, so the clip is as it was`);
        continue;
      }
      clip.now = after;
      const change = after.lufs - before.lufs;
      const limited = fix.limitDb === null ? "" : ", limited";
      say(`rewrote ${before.path}: ${before.lufs.toFixed(1)} -> ${after.lufs.toFixed(1)} LUFS (${change >= 0 ? "+" : ""}${change.toFixed(1)} dB${limited}), peak ${before.truePeak.toFixed(1)} -> ${after.truePeak.toFixed(1)} dBTP, lead ${before.leadMs.toFixed(0)} -> ${after.leadMs.toFixed(0)} ms`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const wrote = flags.has("--write");
  if (wrote || flags.has("--doc")) {
    const doc = resolve(root, DOC);
    const next = withTables(readFileSync(doc, "utf8"), formatTables(clips.map((clip) => clip.now)));
    if (next === null) throw new Error(`${DOC} has lost its "levels:start" and "levels:end" markers`);
    writeFileSync(doc, next);
    say(`${DOC}: tables refreshed`);
  }
  const out = clips.filter((clip) => faults(clip.now).length > 0).length;
  say(wrote ? `${String(changed - failed)} voice clips rewritten, ${String(out)} still out of tolerance` : `${String(out)} voice clips out of tolerance${out > 0 ? ": --write fixes them" : ""}`);
  if (failed > 0 || (out > 0 && (wrote || flags.has("--check")))) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  say(`levelClips: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
