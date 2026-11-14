// Which ElevenLabs voice records each monster's taunts, so every stop of the quest sounds like someone else.
import { afterEach, expect, test, vi } from "vitest";
import type { Voice } from "../ai/types";
import { forcedMonsterVoice, forcedVoice, pickMonsterVoice, pickVoice } from "../ai/voices";

/** The voice names the account had when the clips were made. */
const NAMES = [
  "Bella", "Roger", "Sarah", "Laura", "Charlie", "George", "Callum", "River", "Harry", "Liam", "Alice",
  "Matilda", "Will", "Jessica", "Eric", "Chris", "Brian", "Daniel", "Lily", "Adam", "Bill",
];
const voices: readonly Voice[] = NAMES.map((name) => ({ id: `id-${name.toLowerCase()}`, name: `${name} - Some Description` }));
const MONSTERS = ["circe", "sirens", "scylla", "charybdis", "suitors"];

afterEach(() => {
  vi.unstubAllEnvs();
});

test("each monster, Homer and Athena get a voice of their own", () => {
  const picked = [
    pickVoice("athena", voices, undefined),
    pickVoice("homer", voices, undefined),
    pickMonsterVoice("polyphemus", voices, undefined),
    ...MONSTERS.map((enemyId) => pickMonsterVoice(enemyId, voices, undefined)),
  ].map((voice) => voice?.name.split(" ")[0]);
  expect(picked).toEqual(["Sarah", "George", "Callum", "Lily", "Jessica", "Harry", "Brian", "Liam"]);
  expect(new Set(picked).size).toBe(picked.length);
});

test("Polyphemus and a monster with no list of its own speak with the monster voice", () => {
  const monster = pickVoice("monster", voices, undefined);
  expect(pickMonsterVoice("polyphemus", voices, undefined)).toEqual(monster);
  expect(pickMonsterVoice("a generated fight", voices, undefined)).toEqual(monster);
  // Names every object has must not be read as a monster's list.
  expect(pickMonsterVoice("constructor", voices, undefined)).toEqual(monster);
  expect(pickMonsterVoice("toString", voices, undefined)).toEqual(monster);
});

test("a monster's voice falls back down its list, then to whatever exists, then to nothing", () => {
  const withoutLily = voices.filter((voice) => !voice.name.startsWith("Lily"));
  expect(pickMonsterVoice("circe", withoutLily, undefined)?.name).toMatch(/^Matilda/);
  const stranger: Voice = { id: "x", name: "Someone Else" };
  expect(pickMonsterVoice("circe", [stranger], undefined)).toEqual(stranger);
  expect(pickMonsterVoice("circe", [], undefined)).toBeNull();
});

test("a forced voice id wins, and an id the account does not have is ignored", () => {
  expect(pickMonsterVoice("sirens", voices, "id-bella")?.name).toMatch(/^Bella/);
  expect(pickMonsterVoice("sirens", voices, "no-such-id")?.name).toMatch(/^Jessica/);
});

test("each monster reads its own variable; Polyphemus and unlisted monsters read MONSTER_VOICE_ID", () => {
  vi.stubEnv("CIRCE_VOICE_ID", "forced-circe");
  vi.stubEnv("MONSTER_VOICE_ID", "forced-monster");
  vi.stubEnv("HOMER_VOICE_ID", "forced-homer");
  expect(forcedMonsterVoice("circe")).toBe("forced-circe");
  expect(forcedMonsterVoice("polyphemus")).toBe("forced-monster");
  expect(forcedMonsterVoice("a generated fight")).toBe("forced-monster");
  expect(forcedVoice("homer")).toBe("forced-homer");
  expect(forcedVoice("monster")).toBe("forced-monster");
  vi.stubEnv("SIRENS_VOICE_ID", undefined);
  expect(forcedMonsterVoice("sirens")).toBeUndefined();
});
