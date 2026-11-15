// Each hero fights with one god's power; the five powers are all different and all spend the meter.
import { expect, test } from "vitest";
import { GODS } from "../src/ai/gods/gods";
import { CHARACTERS } from "../src/characters/characters";
import { HERO_POWER } from "../src/characters/godCharacter";
import { POWER_MOVES } from "../src/combat/engine";

test("every hero has a power that spends the meter, and no two heroes share one", () => {
  const moves = CHARACTERS.map((hero) => GODS[HERO_POWER[hero.id]].power.moveId);
  expect(moves).toHaveLength(5);
  for (const move of moves) expect(POWER_MOVES.has(move)).toBe(true);
  expect(new Set(moves).size).toBe(5);
  expect(Object.keys(HERO_POWER).sort()).toEqual(CHARACTERS.map((hero) => hero.id).sort());
});
