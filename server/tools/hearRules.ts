// The rules hearClips.ts works by: how a transcript is compared with the line a clip is meant to say, and what in the
// word timings says a clip may be cut off. Pure: no files, no network and no ffmpeg, so the tests run it.
// docs/audio-heard.md explains what the verdicts mean.
import { z } from "zod";
import { ATHENA_LINES } from "../../src/audio/athenaLines";
import { ALL_STORY_LINES, storyClipUrl } from "../../src/audio/narrationLines";
import { TITLE_LINES } from "../../src/audio/storyLines";

/** One word of a transcript, with when it starts and ends in the clip. */
export interface HeardWord {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  /** How sure speech to text was of this word, as a log probability (0 is certain), or null when it did not say. */
  readonly logprob: number | null;
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

/**
 * "cut?" means the words are right but the timings say the clip may start or end inside a word.
 * "unsure?" means the words are right and nothing looks cut, but speech to text was not sure of one of them.
 */
export type Verdict = "same" | "differs" | "cut?" | "unsure?";

export interface Report {
  readonly verdict: Verdict;
  /** Words of the line that the transcript does not have, in order. */
  readonly notHeard: readonly string[];
  /** Words of the transcript that the line does not have, in order. */
  readonly extra: readonly string[];
  /** Why the clip may be cut off. Empty when the timings are fine. */
  readonly timing: readonly string[];
  /** The words speech to text was not sure of, each with its probability, such as "Knee (0.91)". */
  readonly unsure: readonly string[];
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
 * A word speech to text gives less than this probability is one it half guessed. The first take of Athena's knee call
 * came back as "Me", and the second as "Knee" at 0.91 while another engine still heard "Me".
 */
export const UNSURE_PROBABILITY = 0.95;

/** What is asked of speech to text for every clip. Sound tagging is on so a laugh or a sigh comes back as an extra word. */
export const REQUEST = { model_id: "scribe_v2", language_code: "en", tag_audio_events: "true", timestamps_granularity: "word" } as const;

/** The name a clip's transcript is kept under: what was asked, and the hash of the clip. A changed setting is a new name, so old answers are not reused. */
export function transcriptId(settings: Readonly<Record<string, string>>, hash: string): string {
  const asked = Object.entries(settings).map(([name, value]) => `${name}=${value}`).sort().join("&");
  return `${asked}:${hash}`;
}

/** The part of the API's answer this tool reads. Spaces between words come back as items of their own. */
const Answer = z.object({
  text: z.string(),
  words: z.array(z.object({ text: z.string(), type: z.string(), start: z.number().nullish(), end: z.number().nullish(), logprob: z.number().nullish() })),
  audio_duration_secs: z.number().nullish(),
});

/**
 * Reads the body of a 200 answer. The errors name what is wrong and never quote the body, so nothing an upstream
 * sends back (a key echoed in an error page, say) reaches the terminal.
 */
export function readAnswer(body: string): Pick<Heard, "text" | "words" | "durationMs"> {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error("the answer was not JSON");
  }
  const parsed = Answer.safeParse(json);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".") || "the answer"))];
    throw new Error(`the answer does not have the shape the API reference gives (${fields.slice(0, 5).join(", ")})`);
  }
  const answer = parsed.data;
  const words = answer.words.flatMap((word) =>
    word.type === "word" && typeof word.start === "number" && typeof word.end === "number"
      ? [{ text: word.text, startMs: Math.round(word.start * 1000), endMs: Math.round(word.end * 1000), logprob: word.logprob ?? null }]
      : [],
  );
  const seconds = answer.audio_duration_secs;
  return { text: answer.text, words, durationMs: typeof seconds === "number" ? Math.round(seconds * 1000) : null };
}

/** How many failed requests in a row end the run. */
export const FAILURES_TO_STOP = 3;

/**
 * Why the run should send nothing more after a failed request, or null to go on to the next clip. A refused key, a
 * rate limit and a stalled upstream fail the same way for every clip, so the first one stops the run; anything else
 * stops it after FAILURES_TO_STOP in a row.
 */
export function stopReason(failure: { readonly httpStatus: number | null; readonly timedOut: boolean }, failuresInARow: number): string | null {
  const { httpStatus, timedOut } = failure;
  if (httpStatus === 401 || httpStatus === 402 || httpStatus === 403) return `the key or plan was refused (HTTP ${String(httpStatus)})`;
  if (httpStatus === 429) return "speech to text said too many requests (HTTP 429)";
  if (timedOut) return "speech to text did not answer in time";
  if (failuresInARow >= FAILURES_TO_STOP) return `${String(failuresInARow)} requests in a row failed`;
  return null;
}

/** The count of requests in the last line of a run. A failed request is counted as made, not as "read from the cache". */
export function requestTally(made: number, answered: number): string {
  if (made === 0) return "no request made";
  return `${String(made)} ${made === 1 ? "request" : "requests"} made, ${String(answered)} answered`;
}

/**
 * Names and words from the Odyssey, each with the other spellings speech to text may give it. Only these spellings
 * count as the name. Anything else, however close ("circle" for Circe, "holy" for moly), differs, so a person looks.
 * Every other word must come back letter for letter.
 */
export const GREEK_SPELLINGS: Readonly<Record<string, readonly string[]>> = {
  achaeans: ["achaians", "acheans", "akhaians"],
  aegis: ["egis"],
  charybdis: ["caribdis", "charibdis", "karybdis"],
  circe: ["cersei", "kirke"],
  ithaca: ["ithaka"],
  moly: ["molly"],
  polyphemus: ["polyphemos", "polifemus"],
  scylla: ["scilla", "skylla"],
};

/** Every voice line and the clip that should say it, as a path under public/audio such as "athena/call_jab.mp3". */
export function voiceScript(): ReadonlyMap<string, string> {
  return new Map([
    ...ATHENA_LINES.map((line) => [`athena/${line.id}.mp3`, line.text] as const),
    ...ALL_STORY_LINES.map((line) => [storyClipUrl(line.id).slice("/audio/".length), line.text] as const),
    // Homer's lines for the menu's Story button, kept beside his first four. The first is one of the story lines above.
    ...TITLE_LINES.map((line) => [`athena/${line.id}.mp3`, line.text] as const),
  ]);
}

const NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** The words of a text in lower case, with no punctuation and no accents. "men's" is "mens", "wind-up" is two words, "6" is "six". */
export function normalise(text: string): readonly string[] {
  const plain = text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['‘’]/g, "");
  return plain.split(/[^a-z0-9]+/).filter(Boolean).map((word) => (/^\d+$/.test(word) ? (NUMBERS[Number(word)] ?? word) : word));
}

/** Whether a heard word counts as the expected one: the same letters, or a listed spelling of a Greek name. */
export function sameWord(expected: string, heard: string): boolean {
  return expected === heard || (GREEK_SPELLINGS[expected]?.includes(heard) ?? false);
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

/** The words speech to text gave less than UNSURE_PROBABILITY, each with its probability. Empty when it was sure, or did not say. */
export function unsureWords(heard: Heard): readonly string[] {
  return heard.words.flatMap((word) => {
    if (word.logprob === null) return [];
    const probability = Math.exp(word.logprob);
    return probability < UNSURE_PROBABILITY ? [`${word.text} (${probability.toFixed(2)})`] : [];
  });
}

/** The verdict on one clip: wrong words come first, then a possible cut, then a word speech to text was not sure of. */
export function judge(expected: string, heard: Heard): Report {
  const { notHeard, extra } = compare(expected, heard.text);
  const timing = timingFaults(heard);
  const unsure = unsureWords(heard);
  const verdict = notHeard.length > 0 || extra.length > 0 ? "differs" : timing.length > 0 ? "cut?" : unsure.length > 0 ? "unsure?" : "same";
  return { verdict, notHeard, extra, timing, unsure };
}
