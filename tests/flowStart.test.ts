import { expect, test } from "vitest";
import { ENEMIES } from "../src/enemies/registry";
import { START, startAt } from "../src/screens/flow";

test("?stop=<id> opens the game with every earlier stop beaten, and nothing else changed", () => {
  const third = ENEMIES[2];
  if (!third) throw new Error("the quest needs at least three stops");
  const flow = startAt(ENEMIES, third.id);
  expect(flow.cleared).toEqual(ENEMIES.slice(0, 2).map((enemy) => enemy.id));
  expect({ ...flow, cleared: [] }).toEqual(START);
});

test("no stop, the first stop or an unknown id opens the game as usual", () => {
  expect(startAt(ENEMIES, null)).toBe(START);
  expect(startAt(ENEMIES, "nobody")).toBe(START);
  expect(startAt(ENEMIES, ENEMIES[0]?.id ?? "")).toEqual(START);
});
