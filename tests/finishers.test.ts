// Issue #33: every stop ends on one called move, and no part of a fight shows the same card over and over.
import { expect, test } from "vitest";
import { endingFor } from "../src/enemies/endings";
import { FINISHER_LINES, FINISHER_LINE_MAX_LENGTH, GENERAL_FINISHER_LINE, finisherLine } from "../src/enemies/finishers";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";
import { askable } from "../src/moves/waistUp";

const STOPS = ["polyphemus", "circe", "sirens", "scylla", "charybdis", "suitors"];

test("the six stops are the ones this file checks", () => {
  expect(ENEMIES.map((enemy) => enemy.id).sort()).toEqual([...STOPS].sort());
});

test("every stop has a last move that is a real strike and can be asked of a player seen from the waist up", () => {
  for (const enemy of ENEMIES) {
    const finisher = enemy.finisher;
    expect(finisher, `${enemy.id} has no finisher`).toBeDefined();
    if (finisher === undefined) continue;
    const move = MOVES.get(finisher);
    expect(move, `${enemy.id}: ${finisher} is not a move`).toBeDefined();
    expect(move?.kind, `${enemy.id}: ${finisher}`).toBe("strike");
    expect(askable(finisher, false), `${enemy.id}: ${finisher} needs the legs`).toBe(true);
    // The card's word and its one-key stand-in are what the player reads at the end.
    expect(move?.prompt.length, `${enemy.id}: ${finisher} prompt`).toBeGreaterThan(0);
    expect(move?.key.length, `${enemy.id}: ${finisher} key`).toBeGreaterThan(0);
  }
});

test("no phase of any stop has one attack only, so no card is shown over and over", () => {
  for (const enemy of ENEMIES) {
    const phases = enemy.phases ?? [{ name: "the whole fight", attackIds: enemy.attacks.map((attack) => attack.id) }];
    for (const phase of phases) {
      const attacks = phase.attackIds.map((id) => enemy.attacks.find((attack) => attack.id === id));
      expect(attacks.every((attack) => attack !== undefined), `${enemy.id}/${phase.name}`).toBe(true);
      expect(new Set(phase.attackIds).size, `${enemy.id}/${phase.name}: attacks`).toBeGreaterThanOrEqual(2);
      const counters = new Set(attacks.map((attack) => attack?.counter));
      expect(counters.size, `${enemy.id}/${phase.name}: different cards`).toBeGreaterThanOrEqual(2);
    }
  }
});

test("the Sirens' first phase is still their easiest: slowest warnings, and nothing that hits harder than the song", () => {
  const sirens = ENEMIES.find((enemy) => enemy.id === "sirens");
  const phases = sirens?.phases ?? [];
  const first = phases[0];
  expect(first).toBeDefined();
  if (!sirens || !first) return;
  for (const later of phases.slice(1)) {
    expect(first.telegraphScale).toBeGreaterThan(later.telegraphScale);
    expect(first.attackIds.length).toBeLessThan(later.attackIds.length);
    for (const id of first.attackIds) expect(later.attackIds, `${later.name} keeps ${id}`).toContain(id);
  }
  const song = sirens.attacks.find((attack) => attack.id === "song");
  for (const id of first.attackIds) {
    const attack = sirens.attacks.find((candidate) => candidate.id === id);
    expect(attack?.damage ?? Infinity, id).toBeLessThanOrEqual(song?.damage ?? 0);
  }
});

test("every stop has a short line for its FINISH card, and the three escapes do not say to finish anyone", () => {
  for (const enemy of ENEMIES) {
    const line = finisherLine(enemy.id);
    expect(Object.hasOwn(FINISHER_LINES, enemy.id), `${enemy.id} has no line of its own`).toBe(true);
    expect(line.length, enemy.id).toBeGreaterThan(0);
    expect(line.length, `${enemy.id}: "${line}"`).toBeLessThanOrEqual(FINISHER_LINE_MAX_LENGTH);
    if (endingFor(enemy.id).kind === "escape" && ["sirens", "scylla", "charybdis"].includes(enemy.id)) {
      expect(line.toLowerCase(), enemy.id).not.toContain("finish");
    }
  }
  expect(Object.keys(FINISHER_LINES).sort()).toEqual(ENEMIES.map((enemy) => enemy.id).sort());
  expect(finisherLine("nobody")).toBe(GENERAL_FINISHER_LINE);
  expect(finisherLine("toString")).toBe(GENERAL_FINISHER_LINE);
});
