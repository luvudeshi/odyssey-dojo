// Guards Athena's script: the ids clips are named after, the length of each kind of line, which lines may name an enemy, and the doc that mirrors it.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import doc from "../docs/athena-lines.md?raw";
import { ATHENA_LINES, clipUrl } from "../src/audio/athenaLines";
import { startFight } from "../src/combat/engine";
import { enemy as polyphemus } from "../src/enemies/defs/polyphemus";

const CALLS = [
  "block", "duck", "dodge_left", "dodge_right", "jump", "jab", "cross", "hook", "overhead_strike", "spear_thrust",
  "uppercut", "reverse_punch", "knife_hand", "hammer_fist", "double_palm", "chain_punch", "rising_palm",
  "front_kick", "knee",
  "thunderbolt", "trident_sweep", "aegis_push", "swift_dash", "moon_arrow", "sun_burst",
  "any_defend", "any_strike", "stake_thrust",
];
const SHORT = ["praise_1", "praise_2", "praise_3", "warn_1", "warn_2", "warn_3"];
/** Each belongs to one phase of one enemy, so it may name or point at that enemy. */
const ENEMY_PHASES = [
  "phase_1", "phase_2", "phase_the_wand", "phase_unmasked", "phase_the_song", "phase_the_meadow_of_bones",
  "phase_six_heads", "phase_the_toll", "phase_the_spew", "phase_the_fig_tree", "phase_eurymachus", "phase_the_volley",
];
const MOMENTS = [...ENEMY_PHASES, "phase_any", "fight_start", "win", "loss"];
const ONE_ENEMY_ONLY = ["call_stake_thrust", ...ENEMY_PHASES];

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Table rows of the doc as [id, when, text], without the header and the divider under it. */
function docRows(markdown: string): string[][] {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim().replaceAll("`", "")));
}

test("the script has exactly the fixed line ids, each once", () => {
  const expected = [...CALLS.map((move) => `call_${move}`), ...SHORT, ...MOMENTS];
  expect(ATHENA_LINES.map((line) => line.id).sort()).toEqual([...expected].sort());
  expect(clipUrl("call_block")).toBe("/audio/athena/call_block.mp3");
});

test("lines fit the gaps between beats: calls 2 to 4 words, praise and warnings 2, fight start and phases 5", () => {
  for (const line of ATHENA_LINES) {
    expect(line.text.trim(), line.id).toBe(line.text);
    expect(line.when, line.id).not.toBe("");
    expect(words(line.text), line.id).toBeGreaterThanOrEqual(2);
    // The finishing call is the one call allowed to run long.
    if (line.id.startsWith("call_")) expect(words(line.text), line.id).toBeLessThanOrEqual(line.id === "call_stake_thrust" ? 6 : 4);
    if (SHORT.includes(line.id)) expect(words(line.text), line.id).toBeLessThanOrEqual(2);
    if (line.id === "fight_start" || line.id.startsWith("phase_")) expect(words(line.text), line.id).toBeLessThanOrEqual(5);
  }
});

test("only the finishing call and each enemy's own phase lines name or point at an enemy; the rest play in every fight", () => {
  for (const line of ATHENA_LINES.filter((each) => !ONE_ENEMY_ONLY.includes(each.id))) {
    expect(`${line.when} ${line.text}`, line.id).not.toMatch(/cyclops|polyphemus|circe|siren|scylla|charybdis|suitor/i);
    expect(line.text, line.id).not.toMatch(/\b(he|him|his|she|her|they|them)\b/i);
  }
});

/** The longest the opening line's clip may run, end to end. */
const OPENING_MAX_MS = 1300;
/** A clip starts a little after it is asked for: about 110 ms in the fight that was recorded. This allows for more. */
const CLIP_START_MS = 200;
const MP3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_HZ = [44100, 48000, 32000];

/**
 * How long an MP3 clip plays, in ms, counted from its frames (MPEG-1 Layer III, 1152 samples each), the way a browser
 * counts it. The first frame is left out when it is the "Info" frame, which carries no sound.
 */
function clipMs(path: string): number {
  const bytes = readFileSync(path);
  // An ID3v2 tag comes first: ten bytes of header, then as many bytes as its four 7-bit size digits say.
  const tagged = bytes.toString("latin1", 0, 3) === "ID3";
  let at = tagged ? 10 + (((bytes[6] ?? 0) << 21) | ((bytes[7] ?? 0) << 14) | ((bytes[8] ?? 0) << 7) | (bytes[9] ?? 0)) : 0;
  let ms = 0;
  let frames = 0;
  while (at + 4 <= bytes.length) {
    const [sync, version, rates] = [bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0];
    const kbps = MP3_KBPS[rates >> 4] ?? 0;
    const hz = MP3_HZ[(rates >> 2) & 3] ?? 0;
    if (sync !== 0xff || (version & 0xfe) !== 0xfa || kbps === 0 || hz === 0) throw new Error(`${path}: not an MPEG-1 Layer III frame at byte ${String(at)}`);
    const silent = frames === 0 && /Info|Xing/.test(bytes.toString("latin1", at + 4, at + 40));
    if (!silent) ms += (1152 / hz) * 1000;
    frames += 1;
    at += Math.floor((144000 * kbps) / hz) + ((rates >> 1) & 1);
  }
  return ms;
}

test("the opening line's clip is over before the first attack is called", () => {
  // Every fight opens with an intro (INTRO_MS in src/combat/engine.ts, 1500 ms), and the first telegraph comes when it
  // ends. Athena's call for that attack cuts whatever she is saying, so the opening line must be over by then.
  const opening = startFight(polyphemus, 1).phase;
  const introMs = opening.kind === "intro" ? opening.msLeft : 0;
  const ms = clipMs(`public${clipUrl("fight_start")}`);
  expect(ms).toBeGreaterThan(500);
  expect(ms).toBeLessThan(OPENING_MAX_MS);
  expect(ms + CLIP_START_MS).toBeLessThanOrEqual(introMs);
  // The same count gives the lengths written in tests/voicePriorities.test.ts, for this clip and for one that was not changed.
  expect(Math.round(ms / 10) * 10).toBe(1280);
  expect(Math.round(clipMs(`public${clipUrl("call_cross")}`) / 10) * 10).toBe(2040);
});

test("docs/athena-lines.md lists the same ids, moments and texts as the script", () => {
  expect(docRows(doc)).toEqual(ATHENA_LINES.map((line) => [line.id, line.when, line.text]));
});
