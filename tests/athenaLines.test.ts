// Guards Athena's script: the ids clips are named after, the length of each kind of line, which lines may name an enemy, and the doc that mirrors it.
import { expect, test } from "vitest";
import doc from "../docs/athena-lines.md?raw";
import { ATHENA_LINES, clipUrl } from "../src/audio/athenaLines";

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

test("docs/athena-lines.md lists the same ids, moments and texts as the script", () => {
  expect(docRows(doc)).toEqual(ATHENA_LINES.map((line) => [line.id, line.when, line.text]));
});
