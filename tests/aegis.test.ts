import { expect, test } from "vitest";
import { createPool, emit, stepPool } from "../src/render/effects/sparks";

test("sparks are gold unless a tint is given, and the aegis's are blue", () => {
  const gold = createPool(4);
  emit(gold, [0, 1, 0], 1, 2, () => 0.5);
  stepPool(gold, 0.01);
  expect(gold.colors[0]).toBeGreaterThan(gold.colors[2] ?? 0);
  const blue = createPool(4);
  emit(blue, [0, 1, 0], 1, 2, () => 0.5);
  stepPool(blue, 0.01, [0.4, 0.72, 1]);
  expect(blue.colors[2]).toBeGreaterThan(blue.colors[0] ?? 0);
});
