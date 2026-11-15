import { expect, test } from "vitest";
import { createMissWatch } from "../src/input/missWatch";
import type { CombatInput, CombatPhase } from "../src/core/types";
import { createPoseInput } from "../src/input/poseInput";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../src/pose/signals";
import { LEFT_OUT, READY, RIGHT_OUT, STANDING, blend, pose, recording } from "./poseFixture";
import type { Step } from "./poseFixture";

const strikePhase = (move: string): CombatPhase => ({ kind: "strike", weakSpot: { x: 0, y: 0 } as never, move, msLeft: 1000, totalMs: 2000 });
const idle: CombatInput = { held: new Set(), struck: [] };
const threw = (move: string): CombatInput => ({ held: new Set(), struck: [{ move, quality: 0.7, player: 0 }] });

test("a wrong strike during a strike prompt flashes MISS once", () => {
  const watch = createMissWatch();
  expect(watch(strikePhase("jab"), idle, [])).toBe(false);
  expect(watch(strikePhase("jab"), threw("cross"), [])).toBe(true);
  expect(watch(strikePhase("jab"), threw("hook"), [])).toBe(false);
});

test("no MISS when the prompted strike counted on the same frame as another strike", () => {
  const watch = createMissWatch();
  const both: CombatInput = { held: new Set(), struck: [{ move: "rising_palm", quality: 0.7, player: 0 }, { move: "jab", quality: 0.7, player: 0 }] };
  expect(watch(strikePhase("jab"), both, [])).toBe(false);
});

test("the right strike, or standing still, never flashes MISS", () => {
  const watch = createMissWatch();
  for (let i = 0; i < 300; i++) expect(watch(strikePhase("jab"), idle, [])).toBe(false);
  expect(watch(strikePhase("jab"), threw("jab"), [])).toBe(false);
});

test("a near miss flashes MISS only when the window runs out", () => {
  const watch = createMissWatch();
  const near: CombatInput = { held: new Set(), struck: [], tried: new Set(["jab"]) };
  expect(watch(strikePhase("jab"), near, [])).toBe(false);
  expect(watch(strikePhase("jab"), idle, [{ type: "whiffed" }])).toBe(true);
});

test("a window that runs out with no try shows no MISS", () => {
  const watch = createMissWatch();
  expect(watch(strikePhase("jab"), idle, [{ type: "whiffed" }])).toBe(false);
});

test("a different defend held during a defend prompt flashes MISS", () => {
  const watch = createMissWatch();
  const attack = { counter: "block" } as never;
  const phase: CombatPhase = { kind: "defend", attack, msLeft: 800, totalMs: 1000 };
  expect(watch(phase, idle, [])).toBe(false);
  expect(watch(phase, { held: new Set(["duck"]), struck: [] }, [])).toBe(true);
  expect(watch(phase, { held: new Set(["duck"]), struck: [] }, [])).toBe(false);
});

test("a defend already held when the prompt starts is not a try", () => {
  const watch = createMissWatch();
  const phase: CombatPhase = { kind: "defend", attack: { counter: "block" } as never, msLeft: 800, totalMs: 1000 };
  expect(watch(phase, { held: new Set(["duck"]), struck: [] }, [])).toBe(false);
});

/** The whole path the fight screen takes: pose input, then the watch, against a strike prompt for `ask`. */
function missesDuring(steps: readonly Step[], ask: string): number {
  const read = createPoseInput(MOVES);
  const watch = createMissWatch();
  let history = EMPTY_HISTORY;
  let shown = 0;
  for (const frame of recording(steps)) {
    history = pushFrame(history, frame);
    if (frame.t < 20 * 33) { read(history); continue; }
    if (watch(strikePhase(ask), read(history), [])) shown += 1;
  }
  return shown;
}

test("a rough right punch while a left jab is asked for flashes MISS exactly once", () => {
  const right = pose(RIGHT_OUT, READY);
  expect(missesDuring([[READY, 300], [blend(READY, right, 0.7), 150], [READY, 300], [blend(READY, right, 0.7), 150], [READY, 300]], "jab")).toBe(1);
});

test("a rough left punch while a left jab is asked for flashes no MISS", () => {
  const left = pose(LEFT_OUT, READY);
  expect(missesDuring([[READY, 300], [blend(READY, left, 0.7), 150], [READY, 300]], "jab")).toBe(0);
});

test("ten seconds of standing still with small sway fires nothing and flashes no MISS", () => {
  const sway = (dx: number) => pose({ lean: dx }, READY);
  const steps: Step[] = [];
  for (let i = 0; i < 20; i++) steps.push([sway(i % 2 === 0 ? 0.02 : -0.02), 500]);
  const read = createPoseInput(MOVES);
  let history = EMPTY_HISTORY;
  let fired = 0;
  for (const frame of recording([[STANDING, 500], ...steps])) {
    history = pushFrame(history, frame);
    const input = read(history);
    fired += input.struck.length + (frame.t > 20 * 33 ? input.held.size + (input.tried?.size ?? 0) : 0);
  }
  expect(fired).toBe(0);
  expect(missesDuring([[STANDING, 500], ...steps], "jab")).toBe(0);
});
