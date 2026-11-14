// Athena at every stop: each move has a call, each later phase of each enemy has a line with a clip,
// and Polyphemus's two phase lines are never spoken to anyone else.
import { readFileSync, statSync } from "node:fs";
import { expect, test } from "vitest";
import { ANY_PHASE, ATHENA_LINES, clipUrl, phaseLineId, phaseSlug } from "../src/audio/athenaLines";
import { createVoice, lineFor, parseClipIndex } from "../src/audio/voice";
import { startFight, step } from "../src/combat/engine";
import type { CombatEvent, EnemySpec, FightingStyle } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";

/** Moves that are meant to get the generic "defend" or "strike" call. None today: add an id here only on purpose. */
const GENERIC_ON_PURPOSE: readonly string[] = [];
const POLYPHEMUS_LINES = ["phase_1", "phase_2"];
/** The phase lines each stop should hear today, second phase then third. A renamed phase must bring its line with it. */
const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  polyphemus: ["phase_1", "phase_2"],
  circe: ["phase_the_wand", "phase_unmasked"],
  sirens: ["phase_the_song", "phase_the_meadow_of_bones"],
  scylla: ["phase_six_heads", "phase_the_toll"],
  charybdis: ["phase_the_spew", "phase_the_fig_tree"],
  suitors: ["phase_eurymachus", "phase_the_volley"],
};
/** The clips are 128 kbps, so 16,000 bytes a second: 0.3 s at the least, and voice.ts gives up on a clip after 15 s. */
const MIN_CLIP_BYTES = 4_800;
const MAX_CLIP_BYTES = 240_000;
const STEP_MS = 50;

const lineIds = new Set(ATHENA_LINES.map((line) => line.id));
const listed = parseClipIndex(JSON.parse(readFileSync("public/audio/athena/index.json", "utf8")));
const style: FightingStyle = { id: "s", name: "S", blurb: "", strikes: ["jab", "cross", "hook", "overhead_strike"] };

function laterPhases(enemy: EnemySpec): CombatEvent[] {
  return (enemy.phases ?? []).slice(1).map((phase, at) => ({ type: "phaseChanged", index: at + 1, name: phase.name }));
}

/** Fails unless the line is in the script, listed in the index and backed by an MP3 of a believable length. */
function expectClip(id: string, label: string): void {
  expect(lineIds.has(id), label).toBe(true);
  expect(listed.has(id), label).toBe(true);
  const path = `public${clipUrl(id)}`;
  const head = readFileSync(path).subarray(0, 3);
  expect(head.toString("latin1") === "ID3" || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0), label).toBe(true);
  expect(statSync(path).size, label).toBeGreaterThan(MIN_CLIP_BYTES);
  expect(statSync(path).size, label).toBeLessThan(MAX_CLIP_BYTES);
}

/** A won fight through the real engine, with only the listed clips available. Returns the phase lines Athena spoke. */
function phaseLinesHeard(enemy: EnemySpec): string[] {
  const spoken: string[] = [];
  const voice = createVoice({
    available: (id) => listed.has(id),
    play: (id, done) => {
      spoken.push(id);
      // Every clip is over at once, so no line is skipped because another is still playing.
      done();
      return () => undefined;
    },
    random: () => 0,
  });
  let state = startFight(enemy, 7);
  for (let tick = 0; tick < 8000 && state.phase.kind !== "won" && state.phase.kind !== "lost"; tick += 1) {
    const phase = state.phase;
    const held = new Set(phase.kind === "defend" ? [phase.attack.counter] : []);
    const struck = phase.kind === "strike" || phase.kind === "finisher" ? [{ move: phase.move, quality: 1, player: 0 as const }] : [];
    const result = step(state, enemy, style, { held, struck }, STEP_MS);
    state = result.state;
    voice.handle(result.events, state.phase);
  }
  expect(state.phase.kind, enemy.id).toBe("won");
  return spoken.filter((id) => id.startsWith("phase_"));
}

test("every move in the registry has a call of its own with a clip, unless it is generic on purpose", () => {
  expect(MOVES.size).toBeGreaterThan(20);
  for (const id of MOVES.keys()) {
    if (GENERIC_ON_PURPOSE.includes(id)) continue;
    expectClip(`call_${id}`, `call_${id}: add a line to src/audio/athenaLines.ts and generate its clip`);
  }
  for (const id of GENERIC_ON_PURPOSE) expect(MOVES.has(id), id).toBe(true);
  for (const id of ["call_any_defend", "call_any_strike"]) expectClip(id, id);
});

test("every later phase of every enemy resolves to a line that has a clip", () => {
  expect(ENEMIES.length).toBeGreaterThanOrEqual(6);
  for (const enemy of ENEMIES) {
    for (const event of laterPhases(enemy)) {
      const id = lineFor(event, () => 0);
      expect(id, `${enemy.id} ${JSON.stringify(event)}`).not.toBeNull();
      expectClip(id ?? "", `${enemy.id} ${JSON.stringify(event)}`);
    }
  }
  expectClip(ANY_PHASE, ANY_PHASE);
});

test("each stop's later phases have a line of their own", () => {
  for (const enemy of ENEMIES) {
    const heard = laterPhases(enemy).map((event) => lineFor(event, () => 0));
    const names = (enemy.phases ?? []).slice(1).map((phase) => `phase_${phaseSlug(phase.name)}`).join(", ");
    expect(heard, `${enemy.id}: a new or renamed phase needs a line in src/audio/athenaLines.ts (${names})`).toEqual(EXPECTED[enemy.id]);
  }
});

test("no enemy but Polyphemus is ever given phase_1 or phase_2, and he still is", () => {
  for (const enemy of ENEMIES) {
    const heard = laterPhases(enemy).map((event) => lineFor(event, () => 0));
    if (enemy.id === "polyphemus") expect(heard).toEqual(POLYPHEMUS_LINES);
    else for (const id of POLYPHEMUS_LINES) expect(heard, enemy.id).not.toContain(id);
  }
});

test("a fight through the engine speaks each stop's own phase lines, in order", () => {
  for (const enemy of ENEMIES) expect(phaseLinesHeard(enemy), enemy.id).toEqual(EXPECTED[enemy.id]);
});

test("a phase with no line of its own gets the generic line, never a Polyphemus line", () => {
  const first = (): number => 0;
  for (const name of ["Enraged", "Wild", "1", "2", "", "constructor", "The  Club?!"]) {
    for (const index of [1, 2, 3]) {
      const id = lineFor({ type: "phaseChanged", index, name }, first);
      expect(id, `${name} at ${String(index)}`).toBe(name === "The  Club?!" ? "phase_1" : ANY_PHASE);
    }
  }
  // The opening phase is silent whatever it is called.
  expect(lineFor({ type: "phaseChanged", index: 0, name: "The Wand" }, first)).toBeNull();
  // The same name gives the same line at any index: the name decides, not the number.
  expect(lineFor({ type: "phaseChanged", index: 2, name: "The Wand" }, first)).toBe("phase_the_wand");
  expect(lineFor({ type: "phaseChanged", index: 1, name: "Blinded" }, first)).toBe("phase_2");
  expect(phaseSlug("The Meadow of Bones")).toBe("the_meadow_of_bones");
  expect(phaseLineId("the meadow of bones")).toBe("phase_the_meadow_of_bones");
  expect(ANY_PHASE).toBe("phase_any");
});

test("the generic phase line names no one, and every phase line is used by some phase", () => {
  const generic = ATHENA_LINES.find((line) => line.id === ANY_PHASE);
  expect(generic?.text).not.toMatch(/\b(he|him|his|she|her|they|them)\b/i);
  const used = new Set(Object.values(EXPECTED).flat());
  for (const line of ATHENA_LINES.filter((each) => each.id.startsWith("phase_") && each.id !== ANY_PHASE)) {
    expect(used.has(line.id), line.id).toBe(true);
  }
});
