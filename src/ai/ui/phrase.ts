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

/** One line of plain text the server will accept: no control characters, single spaces, at most 200 characters. */
export function cleanPhrase(raw: string): string {
  // \p{Cs} only matches a surrogate with no partner, so emoji survive and broken halves do not.
  const tidy = raw.replace(/[\p{Cc}\p{Cs}]/gu, " ").replace(/\s+/g, " ").trim();
  let cut = "";
  for (const symbol of tidy) {
    if (cut.length + symbol.length > MAX_PHRASE_LENGTH) break;
    cut += symbol;
  }
  return cut.trimEnd();
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
