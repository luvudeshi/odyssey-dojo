// Pause menu logic: what Esc does, the clock shift, and the fight-flow actions behind Restart and Quit.
import { expect, test } from "vitest";
import { battle, resetBattle } from "../src/render/battle";
import { flowReducer, START } from "../src/screens/flow";
import type { Flow } from "../src/screens/flow";
import { pressEscape, shiftBattleTimes } from "../src/ui/pauseState";

test("Esc opens the menu, closes it, and backs out of settings one step", () => {
  expect(pressEscape("off", false)).toBe("menu");
  expect(pressEscape("menu", false)).toBe("off");
  expect(pressEscape("settings", false)).toBe("menu");
});

test("Esc does nothing once the fight is over", () => {
  expect(pressEscape("off", true)).toBe("off");
  expect(pressEscape("menu", true)).toBe("off");
});

test("a pause pushes every effect time on and leaves never-happened ones at minus infinity", () => {
  resetBattle();
  battle.enemyHitAt = 10;
  shiftBattleTimes(battle, 2500);
  expect(battle.enemyHitAt).toBeCloseTo(12.5);
  expect(battle.wonAt).toBe(-Infinity);
  resetBattle();
});

const fighting: Flow = { ...START, screen: "fight", seed: 1, index: 2 };

test("restart keeps the fight and changes the seed; quit goes to the map", () => {
  expect(flowReducer(fighting, { type: "restart", seed: 9 })).toEqual({ ...fighting, seed: 9 });
  expect(flowReducer(fighting, { type: "quit" })).toEqual({ ...fighting, screen: "map" });
});

test("restart and quit are ignored outside a fight", () => {
  const map: Flow = { ...START, screen: "map" };
  expect(flowReducer(map, { type: "restart", seed: 9 })).toBe(map);
  expect(flowReducer(map, { type: "quit" })).toBe(map);
});
