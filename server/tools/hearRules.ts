// The rules hearClips.ts works by: how a transcript is compared with the line a clip is meant to say, and what in the
// word timings says a clip may be cut off. Pure: no files, no network and no ffmpeg, so the tests run it.
// docs/audio-heard.md explains what the verdicts mean.
import { ATHENA_LINES } from "../../src/audio/athenaLines";
import { ALL_STORY_LINES, storyClipUrl } from "../../src/audio/narrationLines";

/** One word of a transcript, with when it starts and ends in the clip. */
export interface HeardWord {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

/** What speech to text made of one clip. */
export interface Heard {
  readonly text: string;
  readonly words: readonly HeardWord[];
  /** How long the clip is, or null when nothing could tell. */
  readonly durationMs: number | null;
  /** How loud the last END_WINDOW_MS of the clip are, as RMS in dBFS, or null when it was not measured. */
  readonly endDb: number | null;
}

/** "cut?" means the words are right but the timings say the clip may start or end inside a word. */
export type Verdict = "same" | "differs" | "cut?";

export interface Report {
  readonly verdict: Verdict;
  /** Words of the line that the transcript does not have, in order. */
  readonly notHeard: readonly string[];
  /** Words of the transcript that the line does not have, in order. */
  readonly extra: readonly string[];
  /** Why the clip may be cut off. Empty when the timings are fine. */
  readonly timing: readonly string[];
}

/** A last word that ends this close to the end of the file may have been cut. */
export const CUT_END_MS = 40;
/** The stretch at the end of a clip whose level is measured. */
export const END_WINDOW_MS = 30;
/**
 * A clip that ends in silence is under -50 dBFS over its last END_WINDOW_MS (most are near -85). One that is louder
 * than this there stops while something is still sounding: the tail of a word, a breath or a click.
 */
export const END_LOUD_DBFS = -45;

/**
 * Names and words from the Odyssey that speech to text spells in more than one way ("Kirke", "Molly", "Achaians").
 * Only these are matched loosely. Every other word must come back letter for letter.
 */
export const GREEK_NAMES: ReadonlySet<string> = new Set([
  "achaeans", "aegis", "charybdis", "circe", "cyclopes", "cyclops", "hermes", "ithaca", "moly", "muse",
  "odysseus", "penelope", "polyphemus", "poseidon", "scylla", "sirens", "troy",
]);

/** Every voice line and the clip that should say it, as a path under public/audio such as "athena/call_jab.mp3". */
export function voiceScript(): ReadonlyMap<string, string> {
  return new Map([
    ...ATHENA_LINES.map((line) => [`athena/${line.id}.mp3`, line.text] as const),
    ...ALL_STORY_LINES.map((line) => [storyClipUrl(line.id).slice("/audio/".length), line.text] as const),
  ]);
}

const NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** The words of a text in lower case, with no punctuation and no accents. "men's" is "mens", "wind-up" is two words, "6" is "six". */
export function normalise(text: string): readonly string[] {
  const plain = text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['‘’]/g, "");
  return plain.split(/[^a-z0-9]+/).filter(Boolean).map((word) => (/^\d+$/.test(word) ? (NUMBERS[Number(word)] ?? word) : word));
}

/** How many single-letter changes turn one word into the other. */
export function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      const change = (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      next.push(Math.min(change, (row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1));
    }
    row = next;
  }
  return row[b.length] ?? 0;
}

/** A rough "how it sounds": the consonants, with ph as f, a soft c as s, a hard c and ch as k, and no doubled letters. */
function skeleton(word: string): string {
  const sounds = word.replace(/ph/g, "f").replace(/ch/g, "k").replace(/c(?=[eiy])/g, "s").replace(/c/g, "k");
  return sounds.replace(/[aeiouyh]/g, "").replace(/(.)\1+/g, "$1");
}

/** Whether a heard word counts as the expected one. A Greek name may be spelled another way; any other word may not. */
export function sameWord(expected: string, heard: string): boolean {
  if (expected === heard) return true;
  if (!GREEK_NAMES.has(expected)) return false;
  // Two consonants are too few to go by: "troy" and "tree" share them.
  const sound = skeleton(expected);
  if (sound.length >= 3 && sound === skeleton(heard)) return true;
  return editDistance(expected, heard) <= (Math.max(expected.length, heard.length) >= 8 ? 2 : 1);
}

/** The words of the line the transcript lacks, and the words of the transcript the line lacks. Both empty when they agree. */
export function compare(expected: string, heard: string): Pick<Report, "notHeard" | "extra"> {
  const want = normalise(expected);
  const got = normalise(heard);
  // lengths[i][j] is how many words want[i..] and got[j..] share, in order.
  const lengths = Array.from({ length: want.length + 1 }, () => new Array<number>(got.length + 1).fill(0));
  const at = (i: number, j: number): number => lengths[i]?.[j] ?? 0;
  for (let i = want.length - 1; i >= 0; i--) {
    for (let j = got.length - 1; j >= 0; j--) {
      const cell = sameWord(want[i] ?? "", got[j] ?? "") ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
      const row = lengths[i];
      if (row) row[j] = cell;
    }
  }
  const notHeard: string[] = [];
  const extra: string[] = [];
  let missing: string[] = [];
  let added: string[] = [];
  /** Closes a stretch where the two disagree. "windup" for "wind up" is the same letters, so it is not a difference. */
  const close = (): void => {
    if (missing.join("") !== added.join("")) {
      notHeard.push(...missing);
      extra.push(...added);
    }
    missing = [];
    added = [];
  };
  let i = 0;
  let j = 0;
  while (i < want.length || j < got.length) {
    const wanted = want[i];
    const heardWord = got[j];
    if (wanted !== undefined && heardWord !== undefined && sameWord(wanted, heardWord) && at(i, j) === at(i + 1, j + 1) + 1) {
      close();
      i++;
      j++;
    } else if (wanted !== undefined && (heardWord === undefined || at(i + 1, j) >= at(i, j + 1))) {
      missing.push(wanted);
      i++;
    } else {
      if (heardWord !== undefined) added.push(heardWord);
      j++;
    }
  }
  close();
  return { notHeard, extra };
}

/** Why the timings say a clip may start or end inside a word. Empty when they are fine, or when there is nothing to go on. */
export function timingFaults(heard: Heard): readonly string[] {
  const first = heard.words[0];
  const last = heard.words.at(-1);
  if (first === undefined || last === undefined) return [];
  const found: string[] = [];
  if (first.startMs <= 0) found.push("the first word starts at 0 ms");
  if (heard.durationMs !== null) {
    const left = Math.round(heard.durationMs - last.endMs);
    if (left <= CUT_END_MS) found.push(`the last word ends ${String(Math.max(0, left))} ms before the end of the file`);
  }
  if (heard.endDb !== null && heard.endDb > END_LOUD_DBFS) {
    found.push(`the last ${String(END_WINDOW_MS)} ms are still at ${heard.endDb.toFixed(0)} dBFS`);
  }
  return found;
}

/** The verdict on one clip: wrong words come first, then a possible cut. */
export function judge(expected: string, heard: Heard): Report {
  const { notHeard, extra } = compare(expected, heard.text);
  const timing = timingFaults(heard);
  const verdict = notHeard.length > 0 || extra.length > 0 ? "differs" : timing.length > 0 ? "cut?" : "same";
  return { verdict, notHeard, extra, timing };
}
