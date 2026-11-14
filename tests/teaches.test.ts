// Guards the self-defense line each move shows: every registered move has one, short enough for the prompt card and matching docs/moves.md.
import { expect, test } from "vitest";
import movesDoc from "../docs/moves.md?raw";
import { MOVES } from "../src/moves/registry";

test("every move says what it teaches in 1 to 90 characters", () => {
  expect(MOVES.size).toBeGreaterThan(0);
  for (const move of MOVES.values()) {
    const line = move.teaches ?? "";
    expect(line.trim().length, move.id).toBeGreaterThanOrEqual(1);
    expect(line.length, move.id).toBeLessThanOrEqual(90);
  }
});

test("docs/moves.md lists every move with the same teaches line and a source link", () => {
  const rows = movesDoc.split("\n").filter((row) => row.startsWith("| "));
  for (const move of MOVES.values()) {
    const row = rows.find((candidate) => candidate.includes(`(\`${move.id}\`) |`));
    expect(row, move.id).toBeDefined();
    expect(row, move.id).toContain(`| ${move.teaches ?? ""} | [`);
  }
});

test("teaches lines use plain words, not boxing terms a beginner would not know", () => {
  const jargon = /\b(lead hand|rear hand|orthodox|southpaw|parry)\b/i;
  for (const move of MOVES.values()) expect(move.teaches ?? "", move.id).not.toMatch(jargon);
});
