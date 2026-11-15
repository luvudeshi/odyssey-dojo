// The rules the clip hearing tool works by: comparing a transcript with a line, and reading the word timings.
// Every transcript here is made up. Nothing is sent anywhere and the tool itself is not run.
import { readdirSync } from "node:fs";
import { expect, test } from "vitest";
import type { Heard } from "../tools/hearRules";
import {
  compare, CUT_END_MS, END_LOUD_DBFS, FAILURES_TO_STOP, GREEK_SPELLINGS, judge, normalise, readAnswer, REQUEST, requestTally, sameWord, stopReason,
  timingFaults, transcriptId, UNSURE_PROBABILITY, unsureWords, voiceScript,
} from "../tools/hearRules";

/** A two second clip that says "Stay sharp" with room at both ends, unless a test says otherwise. */
function heard(changes: Partial<Heard> = {}): Heard {
  return {
    text: "Stay sharp",
    words: [{ text: "Stay", startMs: 120, endMs: 500, logprob: -0.001 }, { text: "sharp", startMs: 540, endMs: 1700, logprob: -0.002 }],
    durationMs: 2000,
    endDb: -85,
    ...changes,
  };
}

test("words are compared without case, punctuation, accents or apostrophes, and a small number is its word", () => {
  expect(normalise("Hands up! Guard!")).toEqual(["hands", "up", "guard"]);
  expect(normalise("his men's ears, and beggar’s rags")).toEqual(["his", "mens", "ears", "and", "beggars", "rags"]);
  expect(normalise("Watch the wind-up.")).toEqual(["watch", "the", "wind", "up"]);
  expect(normalise("Circé: 6 heads")).toEqual(["circe", "six", "heads"]);
  expect(normalise("  ...  ")).toEqual([]);
});

test("a transcript that only differs in case, punctuation or how a number is written is the same line", () => {
  const same = { notHeard: [], extra: [] };
  expect(compare("Hands up! Guard!", "hands up. Guard")).toEqual(same);
  expect(compare("Chain punch! One, two!", "Chain punch. 1, 2.")).toEqual(same);
  expect(compare("Rise, and fight again.", "Rise and fight again!")).toEqual(same);
});

test("one word written as two, or two as one, is not a difference", () => {
  const same = { notHeard: [], extra: [] };
  expect(compare("It changes! Watch the wind-up.", "It changes. Watch the windup")).toEqual(same);
  expect(compare("Not even the Earth-shaker could pull you out", "Not even the Earthshaker could pull you out")).toEqual(same);
  expect(compare("Hold to the fig tree.", "Hold to the figtree")).toEqual(same);
});

test("a Greek name may come back in one of its listed spellings", () => {
  expect(sameWord("circe", "cersei")).toBe(true);
  expect(sameWord("circe", "kirke")).toBe(true);
  expect(sameWord("moly", "molly")).toBe(true);
  expect(sameWord("achaeans", "achaians")).toBe(true);
  expect(sameWord("charybdis", "caribdis")).toBe(true);
  expect(sameWord("scylla", "scilla")).toBe(true);
  expect(sameWord("scylla", "skylla")).toBe(true);
  expect(sameWord("polyphemus", "polyphemos")).toBe(true);
  expect(compare("In her hall Circe turned his men to swine.", "In her hall, Cersei turned his men to swine")).toEqual({ notHeard: [], extra: [] });
  // A spelling belongs to its own name only.
  expect(sameWord("moly", "cersei")).toBe(false);
  expect(sameWord("molly", "moly")).toBe(false);
});

test("a real word that only sounds or looks like a Greek name is a different word", () => {
  const nearMisses: Readonly<Record<string, readonly string[]>> = {
    circe: ["series", "circle", "sirs", "circus"],
    hermes: ["arms", "herpes"],
    muse: ["must", "mouse", "use"],
    troy: ["roy", "try", "toy", "tree"],
    achaeans: ["coins", "asians"],
    moly: ["holy", "mole", "slowly"],
    sirens: ["siren"],
    odysseus: ["odyssey", "nobody"],
    cyclopes: ["cyclops"],
    scylla: ["silly", "cellar"],
    charybdis: ["caribbean"],
    ithaca: ["attica"],
    poseidon: ["poison"],
  };
  for (const [name, words] of Object.entries(nearMisses)) {
    for (const word of words) expect(sameWord(name, word), `${name} heard as ${word}`).toBe(false);
  }
  expect(compare("Circe waits.", "Circle waits.")).toEqual({ notHeard: ["circe"], extra: ["circle"] });
  expect(compare("The moly holds.", "The holy holds.")).toEqual({ notHeard: ["moly"], extra: ["holy"] });
});

test("any other word must come back letter for letter", () => {
  expect(sameWord("hands", "hand")).toBe(false);
  expect(sameWord("thrust", "trust")).toBe(false);
  expect(compare("Knee! Drive it high!", "Me, drive it high")).toEqual({ notHeard: ["knee"], extra: ["me"] });
  expect(compare("Hands up! Guard!", "Hand up. Guard")).toEqual({ notHeard: ["hands"], extra: ["hand"] });
});

test("words missing from the transcript and words added to it are both reported, in order", () => {
  expect(compare("Rise, Odysseus. Ithaca still waits for you.", "Rise, Odysseus. Ithaca still waits")).toEqual({ notHeard: ["for", "you"], extra: [] });
  expect(compare("Dodge left!", "Dodge, dodge left now")).toEqual({ notHeard: [], extra: ["dodge", "now"] });
  expect(compare("She wants six men! Guard!", "She wants men. God")).toEqual({ notHeard: ["six", "guard"], extra: ["god"] });
  expect(compare("Strike now!", "")).toEqual({ notHeard: ["strike", "now"], extra: [] });
});

test("a clip with room at both ends and a quiet end has no timing fault", () => {
  expect(timingFaults(heard())).toEqual([]);
});

test("a last word that ends at the end of the file may be cut", () => {
  expect(timingFaults(heard({ durationMs: 1700 + CUT_END_MS }))).toEqual(["the last word ends 40 ms before the end of the file"]);
  expect(timingFaults(heard({ durationMs: 1700 + CUT_END_MS + 1 }))).toEqual([]);
  // A word the transcript ends after the file does is still reported as 0 ms, never as a negative time.
  expect(timingFaults(heard({ durationMs: 1690 }))).toEqual(["the last word ends 0 ms before the end of the file"]);
});

test("a first word that starts at 0 ms may be cut", () => {
  const words = [{ text: "Stay", startMs: 0, endMs: 500, logprob: -0.001 }, { text: "sharp", startMs: 540, endMs: 1700, logprob: -0.002 }];
  expect(timingFaults(heard({ words }))).toEqual(["the first word starts at 0 ms"]);
});

test("a clip that is still sounding in its last moments may be cut", () => {
  expect(timingFaults(heard({ endDb: -34.4 }))).toEqual(["the last 30 ms are still at -34 dBFS"]);
  expect(timingFaults(heard({ endDb: END_LOUD_DBFS }))).toEqual([]);
});

test("with no word times, no length or no level there is nothing to flag", () => {
  expect(timingFaults(heard({ words: [], durationMs: 100, endDb: -10 }))).toEqual([]);
  expect(timingFaults(heard({ durationMs: null, endDb: null }))).toEqual([]);
});

/** The knee call as speech to text gave it: the right words, the first at the given probability. */
function knee(probability: number | null): Heard {
  return heard({
    text: "Knee. Drive it high",
    words: [
      { text: "Knee.", startMs: 100, endMs: 400, logprob: probability === null ? null : Math.log(probability) },
      { text: "Drive", startMs: 700, endMs: 1000, logprob: -0.0001 },
      { text: "it", startMs: 1000, endMs: 1100, logprob: -0.0001 },
      { text: "high", startMs: 1100, endMs: 1700, logprob: -0.0001 },
    ],
  });
}

test("a word speech to text gave a low probability is reported with that probability", () => {
  expect(unsureWords(knee(0.91))).toEqual(["Knee. (0.91)"]);
  expect(unsureWords(knee(0.5))).toEqual(["Knee. (0.50)"]);
  expect(unsureWords(knee(UNSURE_PROBABILITY))).toEqual([]);
  expect(unsureWords(knee(0.999))).toEqual([]);
  // No probability in the answer is not a low one.
  expect(unsureWords(knee(null))).toEqual([]);
  expect(unsureWords(heard({ words: [] }))).toEqual([]);
});

test("the verdict is differs for wrong words, cut? for a timing fault, unsure? for a half guessed word, and same otherwise", () => {
  expect(judge("Stay sharp!", heard())).toEqual({ verdict: "same", notHeard: [], extra: [], timing: [], unsure: [] });
  expect(judge("Stay sharp!", heard({ endDb: -20 })).verdict).toBe("cut?");
  const wrong = judge("Stay sharp!", heard({ text: "Stay sha", endDb: -20 }));
  expect(wrong.verdict).toBe("differs");
  expect(wrong.notHeard).toEqual(["sharp"]);
  expect(wrong.extra).toEqual(["sha"]);
  // Wrong words come first, but the timing fault is still listed.
  expect(wrong.timing).toHaveLength(1);
  // The right words with one of them half guessed is not "same".
  expect(judge("Knee! Drive it high!", knee(0.91))).toEqual({ verdict: "unsure?", notHeard: [], extra: [], timing: [], unsure: ["Knee. (0.91)"] });
  expect(judge("Knee! Drive it high!", knee(0.99)).verdict).toBe("same");
  // A possible cut comes before it, and the unsure word is still listed.
  const both = judge("Knee! Drive it high!", { ...knee(0.91), endDb: -20 });
  expect(both.verdict).toBe("cut?");
  expect(both.unsure).toEqual(["Knee. (0.91)"]);
});

test("a tagged sound in the transcript is a word the line does not have", () => {
  expect(compare("Strike now!", "(laughs) Strike now!")).toEqual({ notHeard: [], extra: ["laughs"] });
  expect(judge("Stay sharp!", heard({ text: "Stay sharp. (sighs)" })).verdict).toBe("differs");
});

test("an answer is read into words with their times and probabilities, and spaces and tagged sounds are not words", () => {
  const body = JSON.stringify({
    language_code: "eng",
    text: "Stay sharp (sighs)",
    words: [
      { text: "Stay", type: "word", start: 0.12, end: 0.5, logprob: -0.05 },
      { text: " ", type: "spacing", start: 0.5, end: 0.54, logprob: 0 },
      { text: "sharp", type: "word", start: 0.54, end: 1.7, logprob: -0.2 },
      { text: "(sighs)", type: "audio_event", start: 1.7, end: 1.9, logprob: -0.3 },
      { text: "lost", type: "word", start: null, end: null, logprob: -0.1 },
    ],
    audio_duration_secs: 2.0004,
  });
  expect(readAnswer(body)).toEqual({
    text: "Stay sharp (sighs)",
    words: [{ text: "Stay", startMs: 120, endMs: 500, logprob: -0.05 }, { text: "sharp", startMs: 540, endMs: 1700, logprob: -0.2 }],
    durationMs: 2000,
  });
  // An answer with no probabilities and no length is still read.
  expect(readAnswer(JSON.stringify({ text: "Hi", words: [{ text: "Hi", type: "word", start: 0.1, end: 0.2 }] }))).toEqual({
    text: "Hi",
    words: [{ text: "Hi", startMs: 100, endMs: 200, logprob: null }],
    durationMs: null,
  });
});

test("an answer that cannot be read is reported without quoting anything it holds", () => {
  const key = "made-up-key-0123456789";
  expect(() => readAnswer(`<html>${key}</html>`)).toThrow(/^the answer was not JSON$/);
  expect(() => readAnswer("")).toThrow(/^the answer was not JSON$/);
  for (const body of [JSON.stringify({ foo: 1, secret: key }), JSON.stringify({ text: key, words: [{ text: key, type: 7 }] }), JSON.stringify(key), "null"]) {
    let message = "";
    try {
      readAnswer(body);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message, body).toMatch(/^the answer does not have the shape the API reference gives \(/);
    expect(message, body).not.toContain(key);
  }
  expect(() => readAnswer(JSON.stringify({ text: "Hi", words: [{ text: "Hi", type: 7 }] }))).toThrow("(words.0.type)");
});

test("a transcript is kept under what was asked as well as the clip, so a changed setting is asked again", () => {
  const hash = "ab".repeat(32);
  const id = transcriptId(REQUEST, hash);
  expect(id).toContain(hash);
  expect(id).toContain("model_id=scribe_v2");
  expect(transcriptId({ ...REQUEST, tag_audio_events: "false" }, hash)).not.toBe(id);
  expect(transcriptId({ ...REQUEST, model_id: "scribe_v3" }, hash)).not.toBe(id);
  expect(transcriptId(REQUEST, "cd".repeat(32))).not.toBe(id);
  // The order the settings are written in does not matter.
  expect(transcriptId(Object.fromEntries(Object.entries(REQUEST).reverse()), hash)).toBe(id);
});

test("a refused key, a rate limit or a stalled upstream stops the run at once, and anything else after three in a row", () => {
  const other = { httpStatus: null, timedOut: false };
  for (const httpStatus of [401, 402, 403, 429]) expect(stopReason({ httpStatus, timedOut: false }, 1), String(httpStatus)).toContain(String(httpStatus));
  expect(stopReason({ httpStatus: null, timedOut: true }, 1)).toBe("speech to text did not answer in time");
  expect(stopReason({ httpStatus: 500, timedOut: false }, 1)).toBeNull();
  expect(stopReason({ httpStatus: 500, timedOut: false }, FAILURES_TO_STOP - 1)).toBeNull();
  expect(stopReason({ httpStatus: 500, timedOut: false }, FAILURES_TO_STOP)).toBe("3 requests in a row failed");
  expect(stopReason(other, 1)).toBeNull();
  expect(stopReason(other, FAILURES_TO_STOP)).toBe("3 requests in a row failed");
});

test("the last line counts the requests that were made, not only the ones that were answered", () => {
  expect(requestTally(82, 0)).toBe("82 requests made, 0 answered");
  expect(requestTally(1, 1)).toBe("1 request made, 1 answered");
  expect(requestTally(3, 2)).toBe("3 requests made, 2 answered");
  expect(requestTally(0, 0)).toBe("no request made");
});

test("the script names exactly the voice clips that are on disk, and every line reads the same as itself", () => {
  const script = voiceScript();
  const onDisk = ["athena", "narration", "taunts"].flatMap((folder) =>
    readdirSync(`public/audio/${folder}`).filter((file) => file.endsWith(".mp3")).map((file) => `${folder}/${file}`),
  );
  expect([...script.keys()].sort()).toEqual(onDisk.sort());
  for (const [path, text] of script) {
    expect(normalise(text).length, path).toBeGreaterThan(1);
    expect(compare(text, text.toUpperCase()), path).toEqual({ notHeard: [], extra: [] });
  }
});

test("every name that has other spellings is a word some line says, and no spelling is a word of any line", () => {
  const spoken = new Set([...voiceScript().values()].flatMap((text) => normalise(text)));
  expect(Object.keys(GREEK_SPELLINGS).filter((name) => !spoken.has(name))).toEqual([]);
  expect(Object.values(GREEK_SPELLINGS).flat().filter((spelling) => spoken.has(spelling))).toEqual([]);
  // Each spelling is written the way a transcript is compared: lower case letters only.
  expect(Object.values(GREEK_SPELLINGS).flat().filter((spelling) => normalise(spelling).join(" ") !== spelling)).toEqual([]);
});
