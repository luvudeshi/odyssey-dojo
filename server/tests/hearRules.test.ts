// The rules the clip hearing tool works by: comparing a transcript with a line, and reading the word timings.
// Every transcript here is made up. Nothing is sent anywhere and the tool itself is not run.
import { readdirSync } from "node:fs";
import { expect, test } from "vitest";
import type { Heard } from "../tools/hearRules";
import { compare, CUT_END_MS, editDistance, END_LOUD_DBFS, GREEK_NAMES, judge, normalise, sameWord, timingFaults, voiceScript } from "../tools/hearRules";

/** A two second clip that says "Stay sharp" with room at both ends, unless a test says otherwise. */
function heard(changes: Partial<Heard> = {}): Heard {
  return {
    text: "Stay sharp",
    words: [{ text: "Stay", startMs: 120, endMs: 500 }, { text: "sharp", startMs: 540, endMs: 1700 }],
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

test("a Greek name may come back spelled another way", () => {
  expect(sameWord("circe", "cersei")).toBe(true);
  expect(sameWord("moly", "molly")).toBe(true);
  expect(sameWord("achaeans", "achaians")).toBe(true);
  expect(sameWord("charybdis", "caribdis")).toBe(true);
  expect(sameWord("scylla", "scilla")).toBe(true);
  expect(sameWord("odysseus", "odiseus")).toBe(true);
  expect(sameWord("polyphemus", "polifemus")).toBe(true);
  expect(compare("In her hall Circe turned his men to swine.", "In her hall, Cersei turned his men to swine")).toEqual({ notHeard: [], extra: [] });
  // A different word is still a different word.
  expect(sameWord("circe", "circus")).toBe(false);
  expect(sameWord("troy", "tree")).toBe(false);
  expect(sameWord("odysseus", "nobody")).toBe(false);
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

test("the letters between two words are counted", () => {
  expect(editDistance("moly", "molly")).toBe(1);
  expect(editDistance("scylla", "skilla")).toBe(2);
  expect(editDistance("", "troy")).toBe(4);
  expect(editDistance("troy", "troy")).toBe(0);
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
  const words = [{ text: "Stay", startMs: 0, endMs: 500 }, { text: "sharp", startMs: 540, endMs: 1700 }];
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

test("the verdict is differs for wrong words, cut? for right words with a timing fault, and same otherwise", () => {
  expect(judge("Stay sharp!", heard())).toEqual({ verdict: "same", notHeard: [], extra: [], timing: [] });
  expect(judge("Stay sharp!", heard({ endDb: -20 })).verdict).toBe("cut?");
  const wrong = judge("Stay sharp!", heard({ text: "Stay sha", endDb: -20 }));
  expect(wrong.verdict).toBe("differs");
  expect(wrong.notHeard).toEqual(["sharp"]);
  expect(wrong.extra).toEqual(["sha"]);
  // Wrong words come first, but the timing fault is still listed.
  expect(wrong.timing).toHaveLength(1);
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

test("every name that is matched loosely is a word some line says", () => {
  const spoken = new Set([...voiceScript().values()].flatMap((text) => normalise(text)));
  expect([...GREEK_NAMES].filter((name) => !spoken.has(name))).toEqual([]);
});
