import { expect, test } from "vitest";
import { MISS_GAP_MS, askedMove, createMissWatch, watchPhase } from "../src/input/missWatch";
import type { CombatInput, CombatPhase } from "../src/core/types";
import { createPoseInput } from "../src/input/poseInput";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../src/pose/signals";
import { LEFT_OUT, READY, RIGHT_OUT, STANDING, blend, pose, recording } from "./poseFixture";
import type { Step } from "./poseFixture";

const strikePhase = (move: string): CombatPhase => ({ kind: "strike", weakSpot: { id: "head", label: "Head", position: [0, 0, 0], moves: [move] }, move, msLeft: 1000, totalMs: 2000 });
const idle: CombatInput = { held: new Set(), struck: [] };
const threw = (move: string): CombatInput => ({ held: new Set(), struck: [{ move, quality: 0.7, player: 0 }] });

const T = 10_000;
const defendPhase = (counter: string): CombatPhase => ({ kind: "defend", attack: { id: "swing", name: "Swing", telegraphMs: 1000, damage: 1, counter }, msLeft: 800, totalMs: 1000 });
const near: CombatInput = { held: new Set(), struck: [], tried: new Set(["jab"]) };
const holding = (...ids: string[]): CombatInput => ({ held: new Set(ids), struck: [] });

test("a wrong strike during a strike prompt flashes MISS, and a second one flashes again once the gap has passed", () => {
  const watch = createMissWatch();
  expect(watchPhase(watch, strikePhase("jab"), idle, [], T)).toBe(false);
  expect(watchPhase(watch, strikePhase("jab"), threw("cross"), [], T + 33)).toBe(true);
  expect(watchPhase(watch, strikePhase("jab"), threw("hook"), [], T + 66)).toBe(false);
  expect(watchPhase(watch, strikePhase("jab"), threw("hook"), [], T + 33 + MISS_GAP_MS)).toBe(true);
});

test("a wrong strike does not end the prompt: the right one still counts afterwards", () => {
  const watch = createMissWatch();
  expect(watchPhase(watch, strikePhase("jab"), threw("cross"), [], T)).toBe(true);
  expect(watchPhase(watch, strikePhase("jab"), threw("jab"), [], T + 2000)).toBe(false);
});

test("the gap holds across prompts, so a quick run of wrong moves cannot flicker", () => {
  const watch = createMissWatch();
  expect(watchPhase(watch, strikePhase("jab"), threw("cross"), [], T)).toBe(true);
  expect(watchPhase(watch, strikePhase("cross"), threw("hook"), [], T + 200)).toBe(false);
});

test("no MISS when the prompted strike counted on the same frame as another strike", () => {
  const watch = createMissWatch();
  const both: CombatInput = { held: new Set(), struck: [{ move: "rising_palm", quality: 0.7, player: 0 }, { move: "jab", quality: 0.7, player: 0 }] };
  expect(watchPhase(watch, strikePhase("jab"), both, [], T)).toBe(false);
});

test("the right strike, or standing still, never flashes MISS", () => {
  const watch = createMissWatch();
  for (let i = 0; i < 300; i++) expect(watchPhase(watch, strikePhase("jab"), idle, [], T + i * 33)).toBe(false);
  expect(watchPhase(watch, strikePhase("jab"), threw("jab"), [], T + 10_000)).toBe(false);
});

test("each failed near miss flashes MISS as it fades, not only the last one before the window ends", () => {
  const watch = createMissWatch();
  expect(watchPhase(watch, strikePhase("jab"), near, [], T)).toBe(false);
  expect(watchPhase(watch, strikePhase("jab"), idle, [], T + 33)).toBe(true);
  expect(watchPhase(watch, strikePhase("jab"), near, [], T + 1000)).toBe(false);
  expect(watchPhase(watch, strikePhase("jab"), idle, [], T + 1033)).toBe(true);
});

test("a near miss that becomes the real strike flashes nothing", () => {
  const watch = createMissWatch();
  expect(watchPhase(watch, strikePhase("jab"), near, [], T)).toBe(false);
  expect(watchPhase(watch, strikePhase("jab"), threw("jab"), [], T + 33)).toBe(false);
});

test("a near miss still flashes MISS when the window runs out on it", () => {
  const watch = createMissWatch();
  expect(watchPhase(watch, strikePhase("jab"), near, [], T)).toBe(false);
  expect(watchPhase(watch, strikePhase("jab"), near, [{ type: "whiffed" }], T + 33)).toBe(true);
});

test("a window that runs out with no try shows no MISS", () => {
  const watch = createMissWatch();
  expect(watchPhase(watch, strikePhase("jab"), idle, [{ type: "whiffed" }], T)).toBe(false);
});

test("a different defend newly held during a defend prompt flashes MISS once, not every gap while it stays held", () => {
  const watch = createMissWatch();
  const phase = defendPhase("block");
  expect(watchPhase(watch, phase, idle, [], T)).toBe(false);
  expect(watchPhase(watch, phase, holding("duck"), [], T + 33)).toBe(true);
  for (let i = 2; i < 120; i++) expect(watchPhase(watch, phase, holding("duck"), [], T + i * 33)).toBe(false);
  expect(watchPhase(watch, phase, idle, [], T + 4000)).toBe(false);
  expect(watchPhase(watch, phase, holding("dodge_left"), [], T + 4033)).toBe(true);
});

test("a defend already held when the prompt starts is not a try", () => {
  const watch = createMissWatch();
  expect(watch(null, false, holding("duck"), false, T - 33)).toBe(false);
  expect(watchPhase(watch, defendPhase("block"), holding("duck"), [], T)).toBe(false);
  expect(watchPhase(watch, defendPhase("block"), holding("duck"), [], T + 33)).toBe(false);
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
    if (watchPhase(watch, strikePhase(ask), read(history), [], T + frame.t)) shown += 1;
  }
  return shown;
}

test("a rough right punch while a left jab is asked for twice within the gap flashes MISS once", () => {
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

test("a strike that lands then the same move as a finisher: standing still never flashes MISS", () => {
  const watch = createMissWatch();
  const ask = (input: CombatInput, whiffed: boolean, at: number) => watch("spear_thrust", false, input, whiffed, at);
  const ramp: CombatInput = { held: new Set(), struck: [], tried: new Set(["spear_thrust"]) };
  const landed: CombatInput = { held: new Set(), struck: [{ move: "spear_thrust", quality: 0.7, player: 0 }], tried: new Set(["spear_thrust"]) };
  expect(ask(ramp, false, T)).toBe(false);
  expect(ask(landed, false, T + 33)).toBe(false);
  expect(ask(ramp, false, T + 66)).toBe(false);
  expect(ask(idle, false, T + 99)).toBe(false);
  expect(ask(idle, true, T + 6000)).toBe(false);
});

test("a near miss before the move lands, with no tried flag on the landing frame, leaves nothing behind", () => {
  const watch = createMissWatch();
  const ramp: CombatInput = { held: new Set(), struck: [], tried: new Set(["spear_thrust"]) };
  expect(watch("spear_thrust", false, ramp, false, T)).toBe(false);
  expect(watch("spear_thrust", false, threw("spear_thrust"), false, T + 33)).toBe(false);
  expect(watch("spear_thrust", false, idle, false, T + 66)).toBe(false);
  expect(watch("spear_thrust", false, idle, true, T + 6000)).toBe(false);
});

test("a fresh near miss after a landed move still counts as a try", () => {
  const watch = createMissWatch();
  const ramp: CombatInput = { held: new Set(), struck: [], tried: new Set(["spear_thrust"]) };
  watch("spear_thrust", false, threw("spear_thrust"), false, T);
  watch("spear_thrust", false, idle, false, T + 33);
  expect(watch("spear_thrust", false, ramp, false, T + 66)).toBe(false);
  expect(watch("spear_thrust", false, idle, false, T + 99)).toBe(true);
});

test("askedMove is the strike, the finisher or the counter, and null for nothing", () => {
  const defend: CombatPhase = { kind: "defend", attack: { id: "swing", name: "Swing", telegraphMs: 1000, damage: 1, counter: "duck" }, msLeft: 1, totalMs: 2 };
  expect(askedMove(strikePhase("hook"))).toBe("hook");
  expect(askedMove({ kind: "finisher", move: "stake", msLeft: 1, totalMs: 2 })).toBe("stake");
  expect(askedMove(defend)).toBe("duck");
  expect(askedMove({ kind: "intro", msLeft: 1 })).toBeNull();
  expect(askedMove(null)).toBeNull();
});
