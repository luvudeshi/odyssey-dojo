// Guards the ending lines: every enemy has one, the lines fit the result screen, only the Suitors is a stand, and docs/endings.md matches.
import { expect, test } from "vitest";
import endingsDoc from "../docs/endings.md?raw";
import { ENDINGS, GENERAL_ENDING, endingFor } from "../src/enemies/endings";
import { ENEMIES } from "../src/enemies/registry";

const ALL = [...Object.entries(ENDINGS), ["general", GENERAL_ENDING] as const];

test("every enemy in the registry has an ending with all four fields", () => {
  expect(ENEMIES.length).toBeGreaterThan(0);
  for (const enemy of ENEMIES) {
    expect(Object.keys(ENDINGS), enemy.id).toContain(enemy.id);
    const ending = endingFor(enemy.id);
    expect(ending, enemy.id).toBe(ENDINGS[enemy.id]);
    expect(["escape", "stand"], enemy.id).toContain(ending.kind);
    expect(ending.win.trim().length, enemy.id).toBeGreaterThan(0);
    expect(ending.loss.trim().length, enemy.id).toBeGreaterThan(0);
    expect(ending.lesson.trim().length, enemy.id).toBeGreaterThan(0);
  }
});

test("no ending is left over for an enemy that does not exist", () => {
  const ids = ENEMIES.map((enemy) => enemy.id);
  for (const id of Object.keys(ENDINGS)) expect(ids, id).toContain(id);
  expect(Object.keys(ENDINGS).length).toBe(ids.length);
});

test("win and loss lines are at most 60 characters and lessons at most 90", () => {
  for (const [id, ending] of ALL) {
    expect(ending.win.length, `${id} win`).toBeLessThanOrEqual(60);
    expect(ending.loss.length, `${id} loss`).toBeLessThanOrEqual(60);
    expect(ending.lesson.length, `${id} lesson`).toBeLessThanOrEqual(90);
    for (const line of [ending.win, ending.loss, ending.lesson]) {
      expect(line, id).toBe(line.trim());
      expect(line, id).not.toContain("|");
    }
  }
});

test("only the Suitors is a stand; every other stop is an escape", () => {
  // Walks the registry, so an enemy added later is held to the same rule without a list to keep in step here.
  expect(ENEMIES.map((enemy) => enemy.id)).toContain("suitors");
  for (const enemy of ENEMIES) {
    expect(endingFor(enemy.id).kind, enemy.id).toBe(enemy.id === "suitors" ? "stand" : "escape");
  }
  const stands = ENEMIES.filter((enemy) => endingFor(enemy.id).kind === "stand").map((enemy) => enemy.id);
  expect(stands).toEqual(["suitors"]);
});

test("the lines are kind: no gore or killing words", () => {
  const harsh = /\b(kill\w*|dead|die[sd]?|death|blood\w*|slay\w*|slain|slaughter\w*|devour\w*|eaten|destroy\w*|corpse)\b/i;
  for (const [id, ending] of ALL) {
    for (const line of [ending.win, ending.loss, ending.lesson]) expect(line, id).not.toMatch(harsh);
  }
});

test("docs/endings.md lists every ending with the same kind, win, loss and lesson", () => {
  const rows = endingsDoc.split("\n").filter((row) => row.startsWith("| "));
  for (const [id, ending] of ALL) {
    const row = rows.find((candidate) => candidate.includes(`(\`${id}\`) |`));
    expect(row, id).toBeDefined();
    expect(row, id).toContain(`(\`${id}\`) | ${ending.kind} | ${ending.win} | ${ending.loss} | ${ending.lesson} |`);
  }
});

test("an unknown id gets the general ending and never throws", () => {
  for (const id of ["nobody", "", "toString", "constructor", "__proto__", "SUITORS"]) {
    expect(endingFor(id), id).toBe(GENERAL_ENDING);
  }
  expect(GENERAL_ENDING.kind).toBe("escape");
});
