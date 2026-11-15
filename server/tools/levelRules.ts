// The rules levelClips.ts works by: which clips are voice, what is out of tolerance, how a clip is fixed, and the
// tables in docs/audio-levels.md. Pure: no files and no ffmpeg, so the tests run it. The doc explains every number.

/** Athena's own lines are brought to this loudness. It is the median of her clips as they were first made. */
export const ATHENA_TARGET_LUFS = -15.5;
/** Homer and the monsters. Their clips have taller peaks, so this is as near Athena as 3 dB of limiting brings them all. */
export const STORY_TARGET_LUFS = -19;
/** A voice clip further than this from its target is out of tolerance. */
export const LOUDNESS_TOLERANCE_LU = 1.5;
/** A voice clip whose true peak is above this is out of tolerance. */
export const PEAK_TOLERANCE_DBTP = -1;
/** A clip that is rewritten ends with its true peak at or under this. */
export const PEAK_CEILING_DBTP = -1.5;
/** A move call with more silence than this before it is out of tolerance, and is cut back to CALL_LEAD_MS. */
export const CALL_LEAD_TOLERANCE_MS = 60;
export const CALL_LEAD_MS = 30;
/** A call or an effect that starts later than this is listed as out of line. */
export const LATE_MS = 150;
/** A clip further than this from the median of its group, at the listener, is listed as out of line. */
export const OUTLIER_LU = 3;
/** The limiter never takes more than this off a clip's peaks. */
export const MAX_LIMIT_DB = 3;
/** A clip that plain gain brings this close under its target is not limited to gain the rest. */
export const SETTLE_LU = 1;
/** Every voice clip is an MP3 at this constant bitrate, so the size of its file gives its length with no ffmpeg. */
export const VOICE_BITS_PER_SECOND = 128_000;
/** A row whose length is further than this from the length of its file is stale. Tags and padding account for under 0.1 s. */
export const STALE_SECONDS = 0.25;
/** Samples under this level count as silence at the start and end of a clip. */
export const SILENCE_DBFS = -50;
/** A new try must move the gain or the limit by at least this, and the peak is aimed this far under the ceiling. */
const STEP_DB = 0.1;
const PEAK_MARGIN_DB = 0.05;

// The gains the game plays each kind of clip through, copied from the audio code. Only the "at the listener" numbers use them.
/** sfx.ts: MASTER_GAIN and LEVELS. */
const SFX_MASTER = 0.5;
const SFX_LEVELS: Readonly<Record<string, number>> = { telegraph: 0.85, opening: 0.5, whiffed: 0.55, defended: 0.8, won: 0.85, lost: 0.85 };
/** music.ts: MUSIC_GAIN, MAX_LEVEL and the loudness of each scene. */
const MUSIC_GAIN = 0.16;
const MAX_LEVEL = 12;
const MUSIC_LOUDNESS: Readonly<Record<string, number>> = { menu: 0.1, fight: 0.16, win: 0.14, loss: 0.14 };
/** stopAudio.ts: EVENT_* and AMBIENCE_*. */
const STOP_EVENT = { gain: 0.5, loudness: 0.12, peak: 0.9 };
const STOP_AMBIENCE = { gain: 0.16, loudness: 0.08, peak: 2 };
/** powerSound.ts: POWER_GAIN, POWER_LOUDNESS and POWER_PEAK. */
const POWER = { gain: 0.7, loudness: 0.13, peak: 0.9 };
/** settings/store.ts: the default music volume. Effects and voice default to 1. */
const MUSIC_VOLUME = 0.7;
/** voice.ts: TAUNT_VOLUME. A monster's taunt is spoken on its own channel, under Athena's calls. */
const TAUNT_VOLUME = 0.7;

export interface Measure {
  /** The file under public/audio, such as "athena/call_jab.mp3". */
  readonly path: string;
  readonly seconds: number;
  /** Integrated loudness of the file (EBU R 128). */
  readonly lufs: number;
  /** True peak of the file, in dBTP. */
  readonly truePeak: number;
  /** Silence before the first sound and after the last, in milliseconds. */
  readonly leadMs: number;
  readonly tailMs: number;
  /** What playback adds at the default settings, in dB. */
  readonly playDb: number;
}

export interface Fix {
  /** Seconds cut from the start. */
  readonly trimSeconds: number;
  readonly gainDb: number;
  /** The level a limiter holds the peaks to, in dBFS. Null for plain gain. */
  readonly limitDb: number | null;
  /** The loudness the fix is trying to reach. */
  readonly aimLufs: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const fixed = (value: number): string => round1(value).toFixed(1);
const signed = (value: number): string => `${value >= 0 ? "+" : ""}${fixed(value)}`;
const nameOf = (path: string): string => (path.split("/").at(-1) ?? "").replace(/\.mp3$/, "");

/** The loudness a voice clip should have, or null for a clip that is not voice. Homer and the monsters also have clips in Athena's folder. */
export function targetFor(path: string): number | null {
  const folder = path.split("/")[0];
  if (folder === "narration" || folder === "taunts") return STORY_TARGET_LUFS;
  if (folder !== "athena") return null;
  return /^(homer|taunt)_/.test(nameOf(path)) ? STORY_TARGET_LUFS : ATHENA_TARGET_LUFS;
}

/** Athena calling a move. These are the lines that must not start late. */
export function isMoveCall(path: string): boolean {
  return path.startsWith("athena/call_");
}

/** The group a clip is compared within and listed under in the doc. */
export function groupOf(path: string): string {
  const folder = path.split("/")[0] ?? "";
  if (folder === "athena" && targetFor(path) !== ATHENA_TARGET_LUFS) return nameOf(path).startsWith("taunt_") ? "athena (Polyphemus)" : "athena (Homer)";
  if (folder === "stops") return nameOf(path) === "ambience" ? "stops (ambience)" : "stops (events)";
  return folder;
}

/** What playback adds to a clip at the default settings, in dB. `rms` and `peak` are the clip's own, as music.ts measures them. */
export function playbackDb(path: string, rms: number, peak: number): number {
  const folder = path.split("/")[0];
  const name = nameOf(path);
  const level = (loudness: number, ceiling: number): number => {
    const raised = rms > 0 ? Math.min(MAX_LEVEL, loudness / rms) : 1;
    return peak > 0 ? Math.min(raised, ceiling / peak) : raised;
  };
  let gain = name.startsWith("taunt_") && targetFor(path) !== null ? TAUNT_VOLUME : 1;
  if (folder === "sfx") gain = (SFX_LEVELS[name] ?? 1) * SFX_MASTER;
  if (folder === "music") gain = level(MUSIC_LOUDNESS[name] ?? rms, Number.POSITIVE_INFINITY) * MUSIC_GAIN * MUSIC_VOLUME;
  if (folder === "stops") {
    gain = name === "ambience"
      ? level(STOP_AMBIENCE.loudness, STOP_AMBIENCE.peak) * STOP_AMBIENCE.gain * MUSIC_VOLUME
      : level(STOP_EVENT.loudness, STOP_EVENT.peak) * STOP_EVENT.gain;
  }
  if (folder === "power") gain = level(POWER.loudness, POWER.peak) * POWER.gain;
  return 20 * Math.log10(gain);
}

/** Why a voice clip is out of tolerance. Empty when it is fine, and always empty for effects, stop sounds and music. */
export function faults(clip: Measure): readonly string[] {
  const target = targetFor(clip.path);
  if (target === null) return [];
  const found: string[] = [];
  const off = round1(clip.lufs - target);
  if (Math.abs(off) > LOUDNESS_TOLERANCE_LU) found.push(`${signed(off)} LU from ${fixed(target)} LUFS`);
  if (round1(clip.truePeak) > PEAK_TOLERANCE_DBTP) found.push(`peak ${fixed(clip.truePeak)} dBTP`);
  if (isMoveCall(clip.path) && Math.round(clip.leadMs) > CALL_LEAD_TOLERANCE_MS) found.push(`${String(Math.round(clip.leadMs))} ms of silence before the call`);
  return found;
}

/**
 * How to bring a voice clip into line, or null when it needs nothing. One gain puts it on target. Where its peak
 * forbids that, the gain stops at the ceiling if that lands within SETTLE_LU; only otherwise is a limiter used.
 */
export function planFix(clip: Measure): Fix | null {
  const target = targetFor(clip.path);
  if (target === null || faults(clip).length === 0) return null;
  const late = isMoveCall(clip.path) && clip.leadMs > CALL_LEAD_TOLERANCE_MS;
  const trimSeconds = late ? (clip.leadMs - CALL_LEAD_MS) / 1000 : 0;
  const wanted = target - clip.lufs;
  const held = PEAK_CEILING_DBTP - clip.truePeak;
  if (wanted <= held) return { trimSeconds, gainDb: wanted, limitDb: null, aimLufs: target };
  if (clip.lufs + held >= target - SETTLE_LU) return { trimSeconds, gainDb: held, limitDb: null, aimLufs: target };
  const gainDb = Math.min(wanted, held + MAX_LIMIT_DB);
  return { trimSeconds, gainDb, limitDb: PEAK_CEILING_DBTP, aimLufs: clip.lufs + gainDb };
}

/**
 * The next try once one has been encoded and measured, or null when that one will do. The MP3 encoder itself takes
 * about half a dB off and moves the peaks, so the first try rarely lands. `source` is the clip as it was.
 */
export function refine(fix: Fix, source: Measure, made: Measure): Fix | null {
  const room = PEAK_CEILING_DBTP - made.truePeak;
  const short = fix.aimLufs - made.lufs;
  let gainDb = fix.gainDb + Math.min(short, room - PEAK_MARGIN_DB);
  let limitDb: number | null = null;
  if (fix.limitDb !== null) {
    limitDb = Math.min(-STEP_DB, fix.limitDb + room - PEAK_MARGIN_DB);
    gainDb = Math.min(fix.gainDb + short, limitDb + MAX_LIMIT_DB - source.truePeak);
  }
  const moved = Math.abs(gainDb - fix.gainDb) >= STEP_DB || (limitDb !== null && Math.abs(limitDb - (fix.limitDb ?? limitDb)) >= STEP_DB);
  return moved ? { ...fix, gainDb, limitDb } : null;
}

/** The middle value, or the mean of the middle two. NaN for an empty list. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? Number.NaN;
  return sorted.length % 2 === 1 ? upper : (upper + (sorted[mid - 1] ?? Number.NaN)) / 2;
}

function grouped(clips: readonly Measure[]): ReadonlyMap<string, readonly Measure[]> {
  const groups = new Map<string, Measure[]>();
  for (const clip of clips) groups.set(groupOf(clip.path), [...(groups.get(groupOf(clip.path)) ?? []), clip]);
  return groups;
}

const heard = (clip: Measure): number => clip.lufs + clip.playDb;

/** Everything the doc lists as out of line, one line per clip, in the order given. */
export function outOfLine(clips: readonly Measure[]): readonly string[] {
  const lines: string[] = [];
  for (const [group, members] of grouped(clips)) {
    const middle = median(members.map(heard));
    for (const clip of members) {
      const notes: string[] = [];
      const off = round1(heard(clip) - middle);
      if (Math.abs(off) > OUTLIER_LU) notes.push(`${signed(off)} LU from the median of ${group} at the listener`);
      if (round1(clip.truePeak + clip.playDb) > PEAK_TOLERANCE_DBTP) notes.push(`peak ${fixed(clip.truePeak)} dBTP`);
      // Music and ambience fade in, and Homer and the taunts can start a moment late. A call or an effect cannot.
      // A god's power clip is not listed either: the game starts it past its silence (powerSound.ts).
      const prompt = isMoveCall(clip.path) || group === "sfx" || group === "stops (events)";
      if (prompt && Math.round(clip.leadMs) > LATE_MS) notes.push(`${String(Math.round(clip.leadMs))} ms of silence before the sound`);
      if (notes.length > 0) lines.push(`- \`${clip.path}\`: ${notes.join("; ")}`);
    }
  }
  return lines;
}

/** The measured part of docs/audio-levels.md: the spread of each group, what is out of line, and every clip. */
export function formatTables(clips: readonly Measure[]): string {
  const out: string[] = [
    "| group | clips | quietest | median | loudest | spread LU | at the listener, median (range) |",
    "|---|---|---|---|---|---|---|",
  ];
  const groups = grouped(clips);
  for (const [group, members] of groups) {
    const file = members.map((clip) => clip.lufs);
    const ear = members.map(heard);
    const [low, high] = [Math.min(...file), Math.max(...file)];
    const range = `${fixed(median(ear))} (${fixed(Math.min(...ear))} to ${fixed(Math.max(...ear))})`;
    out.push(`| ${group} | ${String(members.length)} | ${fixed(low)} | ${fixed(median(file))} | ${fixed(high)} | ${fixed(high - low)} | ${range} |`);
  }
  const bad = clips.filter((clip) => faults(clip).length > 0).map((clip) => `- \`${clip.path}\`: ${faults(clip).join("; ")}`);
  out.push("", "### Voice clips out of tolerance", "", ...(bad.length > 0 ? bad : ["None."]));
  const odd = outOfLine(clips);
  out.push("", "### Out of line", "", ...(odd.length > 0 ? odd : ["Nothing."]));
  for (const [group, members] of groups) {
    out.push("", `### ${group}`, "", "| clip | seconds | LUFS | peak dBTP | lead ms | tail ms | play dB | at the listener |", "|---|---|---|---|---|---|---|---|");
    for (const clip of members) {
      const cells = [clip.seconds.toFixed(2), fixed(clip.lufs), fixed(clip.truePeak), String(Math.round(clip.leadMs)), String(Math.round(clip.tailMs)), fixed(clip.playDb), fixed(heard(clip))];
      out.push(`| \`${clip.path}\` | ${cells.join(" | ")} |`);
    }
  }
  return out.join("\n");
}

export const DOC_START = "<!-- levels:start (written by server/tools/levelClips.ts) -->";
export const DOC_END = "<!-- levels:end -->";

/**
 * The rows of the clip tables in the measured part of the doc (other tables in the doc are not read).
 * A cell that is not a number, such as the dash in a row added by hand, is NaN.
 */
export function listedClips(doc: string): readonly Measure[] {
  const start = doc.indexOf(DOC_START);
  const end = doc.indexOf(DOC_END);
  const measured = start < 0 || end < start ? "" : doc.slice(start, end);
  return [...measured.matchAll(/^\| `([^`]+\.mp3)` \|(.*)\|\s*$/gm)].map((match) => {
    const [seconds, lufs, truePeak, leadMs, tailMs, playDb] = (match[2] ?? "").split("|").map((cell) => (cell.trim() === "" ? Number.NaN : Number(cell)));
    const cell = (value: number | undefined): number => value ?? Number.NaN;
    return { path: match[1] ?? "", seconds: cell(seconds), lufs: cell(lufs), truePeak: cell(truePeak), leadMs: cell(leadMs), tailMs: cell(tailMs), playDb: cell(playDb) };
  });
}

/**
 * True when a voice clip's row gives a length that a file of `bytes` does not have: the take was replaced after the
 * doc was written. A row with no numbers, and a clip that is not voice, is never stale.
 */
export function isStale(row: Measure, bytes: number): boolean {
  if (targetFor(row.path) === null || !Number.isFinite(row.seconds)) return false;
  return Math.abs((bytes * 8) / VOICE_BITS_PER_SECOND - row.seconds) > STALE_SECONDS;
}

/** The doc with its measured part replaced. Null when the doc has lost its two markers. */
export function withTables(doc: string, tables: string): string | null {
  const start = doc.indexOf(DOC_START);
  const end = doc.indexOf(DOC_END);
  if (start < 0 || end < start) return null;
  return `${doc.slice(0, start)}${DOC_START}\n\n${tables}\n\n${doc.slice(end)}`;
}
