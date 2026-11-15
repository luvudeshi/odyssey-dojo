// The pure parts of the "How do you fight?" screen: tidying what the player typed or said, and the example phrases.
export const MAX_PHRASE_LENGTH = 200;

export const EXAMPLE_PHRASES: readonly string[] = [
  "like a drunk kung fu master",
  "like my cat at 3am",
  "like a Texas thunderstorm",
  "like a grandma guarding the last cookie",
  "like a goose that owns the pond",
  "like a mountain that learned to box",
  "like a ballet dancer late for the bus",
  "like a patient old fisherman",
];

/** The longest epithet the server's level request allows. */
export const MAX_EPITHET_LENGTH = 80;

/** One line of plain text, cut to `max` characters without splitting an emoji or leaving a trailing space. */
function tidyLine(raw: string, max: number): string {
  // \p{Cs} only matches a surrogate with no partner, so emoji survive and broken halves do not.
  const tidy = raw.replace(/[\p{Cc}\p{Cs}]/gu, " ").replace(/\s+/g, " ").trim();
  let cut = "";
  for (const symbol of tidy) {
    if (cut.length + symbol.length > max) break;
    cut += symbol;
  }
  return cut.trimEnd();
}

/** One line of plain text the server will accept: no control characters, single spaces, at most 200 characters. Nothing unless some of it can be seen. */
export function cleanPhrase(raw: string): string {
  const cut = tidyLine(raw, MAX_PHRASE_LENGTH);
  // Zero-width and direction marks are kept inside a phrase (a family emoji needs its joiners), but they are not a phrase on their own.
  return /[\p{L}\p{N}\p{P}\p{S}]/u.test(cut) ? cut : "";
}

/** The player's epithet as the level request accepts it (at most 80 characters), or undefined when there is nothing to send. */
export function cleanEpithet(raw: string | undefined): string | undefined {
  const cut = tidyLine(raw ?? "", MAX_EPITHET_LENGTH);
  return cut === "" ? undefined : cut;
}

/** Up to `count` different examples. The same seed always gives the same ones in the same order. */
export function pickExamples(seed: number, count: number): string[] {
  const pool = [...EXAMPLE_PHRASES];
  const picked: string[] = [];
  let state = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) % 2147483647 : 0;
  while (picked.length < count && pool.length > 0) {
    state = (state * 48271 + 11) % 2147483647;
    picked.push(...pool.splice(state % pool.length, 1));
  }
  return picked;
}

/** What the speech recogniser most likely heard, as a phrase: the surest alternative that says anything, without its full stop. */
export function fromSpeech(alternatives: readonly { transcript: string; confidence: number }[]): string {
  let best = "";
  let surest = -Infinity;
  for (const { transcript, confidence } of alternatives) {
    const heard = cleanPhrase(transcript).replace(/[.\s]+$/, "");
    const sure = Number.isFinite(confidence) ? confidence : 0;
    if (heard !== "" && sure > surest) {
      best = heard;
      surest = sure;
    }
  }
  return best;
}
