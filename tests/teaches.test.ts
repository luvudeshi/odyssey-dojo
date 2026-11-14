// Guards the self-defense line each move shows: every registered move has one, short enough for the prompt card.
import { expect, test } from "vitest";
import { MOVES } from "../src/moves/registry";

test("every move says what it teaches in 1 to 90 characters", () => {
  expect(MOVES.size).toBeGreaterThan(0);
  for (const move of MOVES.values()) {
    const line = move.teaches ?? "";
    expect(line.trim().length, move.id).toBeGreaterThanOrEqual(1);
    expect(line.length, move.id).toBeLessThanOrEqual(90);
  }
});
