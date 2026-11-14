import { expect, test } from "vitest";
import type { EnemySpec } from "../src/core/types";
import { flowReducer, playable, START, unlocked } from "../src/screens/flow";
import type { Flow, FlowAction } from "../src/screens/flow";
import { routePoints } from "../src/screens/QuestMap";
import { STYLES } from "../src/styles/registry";

const style = STYLES[0];
if (!style) throw new Error("no styles");
const stop = (id: string): EnemySpec => ({ id }) as EnemySpec;
const ENEMIES = [stop("a"), stop("b"), stop("c"), stop("d")];

const run = (actions: readonly FlowAction[], from: Flow = START): Flow => actions.reduce(flowReducer, from);

test("title to style to map to intro to fight to result to map", () => {
  const steps: [FlowAction, string][] = [
    [{ type: "ready" }, "style"],
    [{ type: "pickStyle", style }, "map"],
    [{ type: "enter", index: 0 }, "intro"],
    [{ type: "begin", seed: 7 }, "fight"],
    [{ type: "ended", enemyId: "a", won: true }, "result"],
    [{ type: "toMap" }, "map"],
  ];
  let flow = START;
  for (const [action, screen] of steps) {
    flow = flowReducer(flow, action);
    expect(flow.screen).toBe(screen);
  }
  expect(flow.cleared).toEqual(["a"]);
  expect(flow.seed).toBe(7);
});

test("a loss records nothing, a repeat win records once, retry reseeds", () => {
  const atFight = run([{ type: "ready" }, { type: "pickStyle", style }, { type: "enter", index: 0 }, { type: "begin", seed: 1 }]);
  const lost = flowReducer(atFight, { type: "ended", enemyId: "a", won: false });
  expect(lost.cleared).toEqual([]);
  const retried = flowReducer(lost, { type: "retry", seed: 2 });
  expect(retried).toMatchObject({ screen: "fight", seed: 2 });
  const won = run([{ type: "ended", enemyId: "a", won: true }], retried);
  const again = run([{ type: "toMap" }, { type: "enter", index: 0 }, { type: "begin", seed: 3 }, { type: "ended", enemyId: "a", won: true }], won);
  expect(again.cleared).toEqual(["a"]);
});

test("actions from the wrong screen are ignored", () => {
  expect(flowReducer(START, { type: "enter", index: 1 })).toBe(START);
  expect(flowReducer(START, { type: "begin", seed: 1 })).toBe(START);
  expect(flowReducer(START, { type: "ended", enemyId: "a", won: true })).toBe(START);
  expect(flowReducer(START, { type: "retry", seed: 1 })).toBe(START);
  expect(flowReducer(START, { type: "toMap" })).toBe(START);
  expect(flowReducer(START, { type: "pickStyle", style })).toBe(START);
  expect(flowReducer(START, { type: "changeStyle" })).toBe(START);
  const styled = run([{ type: "ready" }]);
  expect(flowReducer(styled, { type: "ready" })).toBe(styled);
});

test("change style goes back to the style screen and the map keeps progress", () => {
  const flow = run([{ type: "ready" }, { type: "pickStyle", style }, { type: "changeStyle" }]);
  expect(flow.screen).toBe("style");
});

test("only playable stops open, in order; unbuilt ones stay locked", () => {
  const canPlay = playable(ENEMIES, new Map([["a", 1], ["b", 1]]));
  expect(canPlay).toEqual([true, true, false, false]);
  expect([0, 1, 2, 3].map((i) => unlocked(ENEMIES, canPlay, [], i))).toEqual([true, false, false, false]);
  expect([0, 1, 2, 3].map((i) => unlocked(ENEMIES, canPlay, ["a"], i))).toEqual([true, true, false, false]);
  expect(unlocked(ENEMIES, canPlay, ["a", "b"], 2)).toBe(false);
});

test("route has a point for each stop plus Troy and Ithaca, inside the chart", () => {
  const points = routePoints(5);
  expect(points).toHaveLength(7);
  for (const [x, y] of points) {
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(1000);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(420);
  }
});
