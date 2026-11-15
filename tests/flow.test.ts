import { expect, test } from "vitest";
import type { Assessment } from "../src/coach/contract";
import type { EnemySpec } from "../src/core/types";
import { ENEMIES as REAL_ENEMIES } from "../src/enemies/registry";
import { enemyFor, flowReducer, playable, START } from "../src/screens/flow";
import type { Flow, FlowAction } from "../src/screens/flow";
import { routePoints, shipSpot } from "../src/screens/QuestMap";
import { STYLES } from "../src/styles/registry";

const style = STYLES[0];
if (!style) throw new Error("no styles");
const stop = (id: string): EnemySpec => ({ id }) as EnemySpec;
const ENEMIES = [stop("a"), stop("b"), stop("c"), stop("d")];

const run = (actions: readonly FlowAction[], from: Flow = START): Flow => actions.reduce(flowReducer, from);

test("title to style to map to fight to result to map: a stop on the map starts its fight at once", () => {
  const steps: [FlowAction, string][] = [
    [{ type: "ready" }, "style"],
    [{ type: "pickStyle", style }, "map"],
    [{ type: "enter", index: 0, seed: 7 }, "fight"],
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
  const atFight = run([{ type: "ready" }, { type: "pickStyle", style }, { type: "enter", index: 0, seed: 1 }]);
  const lost = flowReducer(atFight, { type: "ended", enemyId: "a", won: false });
  expect(lost.cleared).toEqual([]);
  const retried = flowReducer(lost, { type: "retry", seed: 2 });
  expect(retried).toMatchObject({ screen: "fight", seed: 2 });
  const won = run([{ type: "ended", enemyId: "a", won: true }], retried);
  const again = run([{ type: "toMap" }, { type: "enter", index: 0, seed: 3 }, { type: "ended", enemyId: "a", won: true }], won);
  expect(again.cleared).toEqual(["a"]);
});

test("actions from the wrong screen are ignored", () => {
  expect(flowReducer(START, { type: "enter", index: 1, seed: 1 })).toBe(START);
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

test("every stop with a model is playable from the start; unbuilt ones are not", () => {
  expect(playable(ENEMIES, new Map([["a", 1], ["b", 1]]))).toEqual([true, true, false, false]);
});

test("route has a point for each stop plus Troy and Ithaca, inside the 1600 x 900 scene", () => {
  const points = routePoints(5);
  expect(points).toHaveLength(7);
  for (const [x, y] of points) {
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(1600);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(900);
  }
});

test("the ship sits mid-leg on open water, and moves off a place or a name that covers the middle", () => {
  const leg = [[0, 0], [100, 0], [200, 0], [300, 0]] as const;
  expect(shipSpot(leg, [])).toEqual([150, 0]);
  const name = [100, -80, 100, 120] as const;
  const [x, y] = shipSpot(leg, [name]);
  const shipBox = [x - 44, y - 58, 88, 80] as const;
  const clear = shipBox[0] + shipBox[2] <= name[0] || name[0] + name[2] <= shipBox[0] || shipBox[1] + shipBox[3] <= name[1] || name[1] + name[3] <= shipBox[1];
  expect(clear).toBe(true);
});

// The main menu: Story mode, and back to it from the map.
test("the main menu is reachable from the style screen and the map, and Story mode returns to the map once a style is chosen", () => {
  const atStyle = run([{ type: "ready" }]);
  expect(flowReducer(atStyle, { type: "toTitle" }).screen).toBe("title");
  const atMap = run([{ type: "pickStyle", style }], atStyle);
  const menu = flowReducer(atMap, { type: "toTitle" });
  expect(menu.screen).toBe("title");
  expect(flowReducer(menu, { type: "ready" }).screen).toBe("map");
  const fighting = flowReducer(atMap, { type: "enter", index: 0, seed: 1 });
  expect(flowReducer(fighting, { type: "toTitle" })).toBe(fighting);
});

test("rooms are hosted and joined from the title: there is no room menu in between", () => {
  expect(flowReducer(START, { type: "hostRoom" }).screen).toBe("host");
  expect(flowReducer(START, { type: "joinRoom" }).screen).toBe("join");
  // The Multiplayer screen holds both: a host can join someone else's room instead, and the other way round.
  expect(run([{ type: "hostRoom" }, { type: "joinRoom" }]).screen).toBe("join");
  expect(run([{ type: "joinRoom" }, { type: "hostRoom" }]).screen).toBe("host");
  expect(run([{ type: "hostRoom" }, { type: "toTitle" }]).screen).toBe("title");
  const atMap = run([{ type: "ready" }, { type: "pickStyle", style }]);
  expect(flowReducer(atMap, { type: "hostRoom" })).toBe(atMap);
});

// The Training Dojo's result tunes the monsters.
const beginner: Assessment = { level: "beginner", focus: [], strong: [], habits: [], steps: [] };
const firstReal = (): EnemySpec => {
  const real = REAL_ENEMIES[0];
  if (!real) throw new Error("no enemies");
  return real;
};

test("a training result is kept from the title through the fights and never changes the screen", () => {
  const trained = flowReducer(START, { type: "warmed", assessment: beginner });
  expect(trained.screen).toBe("title");
  expect(trained.assessment).toBe(beginner);
  const fighting = run([{ type: "ready" }, { type: "pickStyle", style }, { type: "enter", index: 0, seed: 3 }], trained);
  expect(fighting.screen).toBe("fight");
  expect(run([{ type: "ended", enemyId: "a", won: true }, { type: "toMap" }], fighting).assessment).toBe(beginner);
});

test("a quest with no training result is untouched", () => {
  expect(START.assessment).toBeNull();
  expect(enemyFor(firstReal(), null)).toBe(firstReal());
});

test("a beginner's monster gives more warning; an average player gets the same one", () => {
  const real = firstReal();
  expect(enemyFor(real, beginner).attacks[0].telegraphMs).toBeGreaterThan(real.attacks[0].telegraphMs);
  expect(enemyFor(real, { ...beginner, level: "average" })).toBe(real);
});
