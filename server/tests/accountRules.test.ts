// What the account routes accept and refuse, with no database: the hero name, the password, and the saved game.
import { expect, test } from "vitest";
import {
  CREDENTIALS_BODY_BYTES, NAME_MAX, NAME_MIN, PASSWORD_MAX, PASSWORD_MIN, SAVE_BODY_BYTES, SAVE_DEPTH, SAVE_KEYS_MAX, SAVE_LIST_MAX, SAVE_NUMBER_MAX, SAVE_TEXT_MAX,
  accountName, isPlainText, nameKey, parseCredentials, parseSaveBody, saveSchema, tidy,
} from "../lib/accountRules";

const PASSWORD = "nine oars and a sail";

/** A save as the browser sends it. */
function save(): Record<string, unknown> {
  return {
    version: 1,
    profile: { name: "Odysseus", cleared: ["polyphemus", "circe"], moves: { jab: 12, cross: 3 }, bestScore: 2400, fights: 9, wins: 5 },
    settings: { quality: "high", musicVolume: 0.7, sfxVolume: 1, voiceVolume: 1, mirror: true, keyHints: false },
    character: "athena",
    achievements: ["first_win", "beat_polyphemus"],
  };
}

function withProfile(patch: Record<string, unknown>): Record<string, unknown> {
  const whole = save();
  return { ...whole, profile: { ...(whole.profile as Record<string, unknown>), ...patch } };
}

test("a name is cleaned like the profile name, loses the spaces at its ends, and must be 3 to 20 characters", () => {
  expect(accountName("Odysseus")).toBe("Odysseus");
  expect(accountName("  Odysseus ")).toBe("Odysseus");
  expect(accountName("Ody\u0000ss\u001feus\u007f")).toBe("Odysseus");
  expect(accountName("King of Ithaca")).toBe("King of Ithaca");
  expect(accountName("Ὀδυσσεύς")).toBe("Ὀδυσσεύς");
  // Longer than 20 is cut, as the profile cuts it, so the browser and the server hold the same name.
  expect(accountName("Odysseus, son of Laertes, of Ithaca")).toBe("Odysseus, son of Lae");
  expect(accountName("a".repeat(NAME_MAX))).toBe("a".repeat(NAME_MAX));
  expect(accountName("abc")).toBe("abc");
  for (const bad of ["", "ab", " ab ", "   ", "\u0000\u0001\u0002abc".slice(0, 5), "a\u0000b", 7, null, undefined, {}, ["Odysseus"]]) {
    expect(accountName(bad), JSON.stringify(bad)).toBeNull();
  }
  expect(NAME_MIN).toBe(3);
});

test("characters nobody can see are no part of a name, so two accounts cannot look the same and none is blank", () => {
  // Zero-width space, soft hyphen, zero-width joiner, right-to-left override, a control character of the second block.
  for (const unseen of ["\u200b", "\u00ad", "\u200d", "\u202e", "\u0085", "\ufeff", "\u2060"]) {
    expect(accountName(`Odysseus${unseen}`), JSON.stringify(unseen)).toBe("Odysseus");
    expect(accountName(`${unseen}Ody${unseen}sseus`), JSON.stringify(unseen)).toBe("Odysseus");
    expect(accountName(unseen.repeat(3)), JSON.stringify(unseen)).toBeNull();
    expect(accountName(`ab${unseen}`), JSON.stringify(unseen)).toBeNull();
  }
  // Fillers that draw as nothing: braille blank, Hangul fillers.
  for (const blank of ["\u2800\u2800\u2800", "\u3164\u3164\u3164", "\u115f\u1160\uffa0"]) expect(accountName(blank), JSON.stringify(blank)).toBeNull();
  expect(nameKey(accountName("Odysseus\u200b") ?? "")).toBe(nameKey("odysseus"));
  // Twenty letters and unseen ones between them: the cut is made on what is left.
  expect(accountName(`${"a".repeat(10)}\u200b${"b".repeat(10)}\u200bc`)).toBe(`${"a".repeat(10)}${"b".repeat(10)}`);
});

test("a name cut in the middle of an emoji is refused, not stored broken", () => {
  // Nineteen letters and an emoji: the cut at 20 leaves the first half of the emoji.
  expect(accountName(`${"a".repeat(19)}\ud83c\udfdb`)).toBeNull();
  expect(accountName(`${"a".repeat(18)}\ud83c\udfdb`)).toBe(`${"a".repeat(18)}\ud83c\udfdb`);
  expect(accountName("ab\ud83c")).toBeNull();
});

test("two names are the same account without regard to case, the form of an accent or the spaces between words", () => {
  expect(nameKey("Odysseus")).toBe("odysseus");
  expect(nameKey("ODYSSEUS")).toBe(nameKey("odysseus"));
  expect(nameKey("King  of   Ithaca")).toBe("king of ithaca");
  // One character, or a letter and a combining accent.
  expect(nameKey("Pénélope")).toBe(nameKey("Pe\u0301ne\u0301lope"));
  // A full-width letter and a no-break space, as some keyboards type them.
  expect(nameKey("\uff2fdysseus\u00a0I")).toBe("odysseus i");
  expect(nameKey("Odysseus")).not.toBe(nameKey("Odysseas"));
});

test("a sign-up body needs a name and a password of 8 to 200 characters, and says which one is wrong", () => {
  expect(parseCredentials({ name: " Odysseus ", password: PASSWORD })).toEqual({ name: "Odysseus", password: PASSWORD });
  expect(parseCredentials({ name: "Odysseus", password: "x".repeat(PASSWORD_MIN) })).toEqual({ name: "Odysseus", password: "x".repeat(PASSWORD_MIN) });
  expect(parseCredentials({ name: "Odysseus", password: "x".repeat(PASSWORD_MAX) })).toHaveProperty("password");
  // The password is kept as typed: its spaces are part of it.
  expect(parseCredentials({ name: "Odysseus", password: "  spaces  " })).toEqual({ name: "Odysseus", password: "  spaces  " });
  // Fields nobody asked for are dropped.
  expect(parseCredentials({ name: "Odysseus", password: PASSWORD, admin: true })).toEqual({ name: "Odysseus", password: PASSWORD });

  expect(parseCredentials({ name: "Od", password: PASSWORD })).toEqual({ field: "name" });
  expect(parseCredentials({ name: 12345, password: PASSWORD })).toEqual({ field: "name" });
  expect(parseCredentials({ password: PASSWORD })).toEqual({ field: "name" });
  expect(parseCredentials({ name: "Odysseus", password: "x".repeat(PASSWORD_MIN - 1) })).toEqual({ field: "password" });
  expect(parseCredentials({ name: "Odysseus", password: "x".repeat(PASSWORD_MAX + 1) })).toEqual({ field: "password" });
  expect(parseCredentials({ name: "Odysseus", password: ["12345678"] })).toEqual({ field: "password" });
  expect(parseCredentials({ name: "Odysseus" })).toEqual({ field: "password" });
  for (const body of [undefined, null, "name=Odysseus", 5, [], [{ name: "Odysseus", password: PASSWORD }]]) {
    expect(parseCredentials(body), JSON.stringify(body)).toEqual({ field: "body" });
  }
});

test("the widest name and password the rules allow fit in the sign-up body limit", () => {
  // Control characters are the longest in JSON: six bytes each.
  const body = JSON.stringify({ name: "\u0001".repeat(NAME_MAX), password: "\u0001".repeat(PASSWORD_MAX) });
  expect(Buffer.byteLength(body)).toBeLessThanOrEqual(CREDENTIALS_BODY_BYTES);
});

test("a save as the browser sends it is accepted and comes back the same", () => {
  expect(parseSaveBody({ save: save() })).toEqual(save());
  // The smallest save: a new player.
  const empty = { version: 1, profile: {}, settings: {}, character: null };
  expect(parseSaveBody({ save: empty })).toEqual(empty);
  // A character may be an id, a small object, or nothing.
  const dressed = { ...save(), character: { id: "zeus", cloth: "#f3efe4" } };
  expect(parseSaveBody({ save: dressed })).toEqual(dressed);
});

test("a field the game adds to the profile or the settings later is stored and given back, not dropped", () => {
  const grown = {
    ...withProfile({ powers: 4, blocks: 31, dodges: 12, bestCombo: 9, unhit: 1, styles: ["boxer", "jiu_jitsu"], dojo: 2, dojoPerfect: 1, rooms: 3, medals: { gold: 2, names: ["first"] }, rival: null }),
    settings: { controls: "keyboard", quality: "low", musicVolume: 0.25, somethingNew: { nested: [1, 2, 3] } },
  };
  expect(parseSaveBody({ save: grown })).toEqual(grown);
});

test("fields beside the parts of a save are left out", () => {
  const parsed = parseSaveBody({ save: { ...save(), isAdmin: true, accountId: "someone-else" }, accountId: "someone-else" });
  expect(parsed).toEqual(save());
});

test("a save of the wrong shape is refused", () => {
  const bad: readonly unknown[] = [
    undefined, null, "save", [], {}, { save: null }, { save: "x" }, { save: [] }, save(),
    { save: { ...save(), version: 2 } },
    { save: { ...save(), version: "1" } },
    { save: { ...save(), profile: null } },
    { save: { ...save(), profile: [] } },
    { save: { ...save(), profile: "Odysseus" } },
    { save: { ...save(), settings: [] } },
    { save: { ...save(), settings: "loud" } },
    { save: { ...save(), character: 7 } },
    { save: { ...save(), character: ["athena"] } },
    { save: { ...save(), achievements: "first_win" } },
    { save: { ...save(), achievements: [1] } },
    { save: withProfile({ fights: Number.POSITIVE_INFINITY }) },
    { save: withProfile({ wins: Number.NaN }) },
  ];
  for (const body of bad) expect(parseSaveBody(body), JSON.stringify(body)).toBeNull();
  // 1e400 in a body is read by JSON as a number too large to hold.
  expect(parseSaveBody(JSON.parse(`{"save":${JSON.stringify(save()).replace('"fights":9', '"fights":1e400')}}`))).toBeNull();
});

test("every part of a save has a bound: how deep, how many, how long, how large", () => {
  const long = (length: number): string => "a".repeat(length);
  const many = (count: number): string[] => Array.from({ length: count }, (_, index) => `id_${String(index)}`);
  const keys = (count: number, value: unknown): Record<string, unknown> => Object.fromEntries(many(count).map((key) => [key, value]));
  /** A value with `depth` objects inside each other. */
  const deep = (depth: number): unknown => (depth === 0 ? 1 : { in: deep(depth - 1) });
  const fits: readonly unknown[] = [
    withProfile({ name: long(SAVE_TEXT_MAX) }), withProfile({ cleared: many(SAVE_LIST_MAX) }), withProfile({ moves: keys(SAVE_KEYS_MAX, SAVE_NUMBER_MAX) }),
    withProfile({ field: deep(SAVE_DEPTH) }), withProfile({ list: [[["deep"]]] }), withProfile({ [long(60)]: -SAVE_NUMBER_MAX }),
    { ...save(), profile: keys(SAVE_KEYS_MAX, 1) }, { ...save(), settings: keys(SAVE_KEYS_MAX, long(SAVE_TEXT_MAX)) },
    { ...save(), character: long(60) }, { ...save(), character: keys(40, 1) }, { ...save(), achievements: many(SAVE_LIST_MAX) },
  ];
  for (const whole of fits) expect(parseSaveBody({ save: whole }), JSON.stringify(whole).slice(0, 80)).not.toBeNull();
  const over: readonly unknown[] = [
    withProfile({ name: long(SAVE_TEXT_MAX + 1) }), withProfile({ cleared: many(SAVE_LIST_MAX + 1) }), withProfile({ moves: keys(SAVE_KEYS_MAX + 1, 1) }),
    withProfile({ field: deep(SAVE_DEPTH + 1) }), withProfile({ list: [[[["too deep"]]]] }), withProfile({ [long(61)]: 1 }), withProfile({ "": 1 }),
    withProfile({ bestScore: SAVE_NUMBER_MAX + 1 }), withProfile({ bestScore: -SAVE_NUMBER_MAX - 1 }),
    { ...save(), profile: keys(SAVE_KEYS_MAX + 1, 1) }, { ...save(), settings: keys(SAVE_KEYS_MAX + 1, 1) }, { ...save(), settings: { a: long(SAVE_TEXT_MAX + 1) } },
    { ...save(), settings: { a: deep(SAVE_DEPTH + 1) } },
    { ...save(), character: long(61) }, { ...save(), character: { id: deep(SAVE_DEPTH + 1) } }, { ...save(), achievements: many(SAVE_LIST_MAX + 1) },
    { ...save(), achievements: [long(61)] }, { ...save(), achievements: [""] },
  ];
  for (const whole of over) expect(parseSaveBody({ save: whole }), JSON.stringify(whole).slice(0, 80)).toBeNull();
  // The widest save the bounds allow is far past the body limit, so the body limit is the bound on the whole.
  const widest = { ...save(), profile: keys(SAVE_KEYS_MAX, keys(SAVE_KEYS_MAX, long(SAVE_TEXT_MAX))) };
  expect(parseSaveBody({ save: widest })).not.toBeNull();
  expect(Buffer.byteLength(JSON.stringify(widest))).toBeGreaterThan(SAVE_BODY_BYTES);
  expect(SAVE_BODY_BYTES).toBe(32 * 1024);
});

test("a text Postgres cannot store is tidied in a value and refused in an id or a key", () => {
  expect(isPlainText("Odysseus of Ithaca \ud83c\udfdb")).toBe(true);
  for (const odd of ["a\u0000b", "a\nb", "a\tb", "a\u007fb", "a\ud83cb", "\udfdba"]) expect(isPlainText(odd), JSON.stringify(odd)).toBe(false);
  expect(tidy("a\u0000b\nc\ud83c")).toBe("abc\ufffd");
  expect(tidy("whole \ud83c\udfdb stays")).toBe("whole \ud83c\udfdb stays");

  // A zero byte or half a character in a document makes Postgres refuse the whole write. Values are mended on the way in, at any depth.
  const parsed = parseSaveBody({ save: { ...withProfile({ name: `${"a".repeat(19)}\ud83c`, cleared: ["poly\u0000phemus"], notes: { deep: ["a\u0000b"] } }), settings: { note: "a\u0000b" }, character: "zeus\u0000" } });
  expect(parsed?.profile.name).toBe(`${"a".repeat(19)}\ufffd`);
  expect(parsed?.profile.cleared).toEqual(["polyphemus"]);
  expect(parsed?.profile.notes).toEqual({ deep: ["ab"] });
  expect(parsed?.settings).toEqual({ note: "ab" });
  expect(parsed?.character).toBe("zeus");
  expect(JSON.stringify(parsed)).not.toMatch(/\\u0000|\\ud83c/);

  for (const whole of [
    withProfile({ moves: { "jab\u0000": 1 } }), withProfile({ moves: { "\ud83c": 1 } }), withProfile({ "fights\u0000": 1 }),
    { ...save(), settings: { "volume\n": 1 } }, { ...save(), character: { "id\u0000": "zeus" } }, { ...save(), achievements: ["first\u0000win"] },
  ]) expect(parseSaveBody({ save: whole }), JSON.stringify(whole).slice(0, 120)).toBeNull();
});

test("a key named like an object's own parts changes nothing outside the save", () => {
  const body: unknown = JSON.parse('{"save":{"version":1,"profile":{"name":"x","cleared":[],"moves":{"__proto__":5,"constructor":2},"bestScore":0,"fights":0,"wins":0},"settings":{"__proto__":{"polluted":true}},"character":null}}');
  const parsed = saveSchema.safeParse((body as { save: unknown }).save);
  // Whether the check refuses it or drops the key, nothing leaks into other objects.
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  if (parsed.success) {
    expect((parsed.data.settings as Record<string, unknown>).polluted).toBeUndefined();
    expect(JSON.parse(JSON.stringify(parsed.data))).not.toHaveProperty("settings.polluted");
  }
});
