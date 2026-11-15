// Pause menu logic: what Esc does, the clock shift, and the fight-flow actions behind Restart and Quit.
import { expect, test } from "vitest";
import { startFight } from "../src/combat/engine";
import { enemy as polyphemus } from "../src/enemies/defs/polyphemus";
import { battle, decay, resetBattle } from "../src/render/battle";
import { boulderAt } from "../src/render/effects/boulderFlight";
import { BURST_S, burstProgress } from "../src/render/effects/defendTiming";
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

test("a pause pushes on each of the times the scene's effects read", () => {
  resetBattle();
  const times = ["enemyHitAt", "playerHitAt", "phaseAt", "wonAt", "lostAt", "struckAt", "reachAt"] as const;
  times.forEach((key) => { battle[key] = 10; });
  shiftBattleTimes(battle, 4000, 20);
  times.forEach((key) => { expect(battle[key], key).toBeCloseTo(14); });
  resetBattle();
});

test("a pause in the middle of a defend burst neither cuts it short nor starts it again", () => {
  resetBattle();
  battle.defendedAt = 10;
  battle.defendedMove = "block";
  // Paused 0.2 s into the burst, for 5 s. The scene draws no frame while paused, so the next frame is at 15.2.
  const before = burstProgress(10.2, battle.defendedAt);
  const flash = decay(10.2, battle.defendedAt, BURST_S);
  shiftBattleTimes(battle, 5000, 15.2);
  expect(burstProgress(15.2, battle.defendedAt)).toBeCloseTo(before);
  expect(decay(15.2, battle.defendedAt, BURST_S)).toBeCloseTo(flash);
  expect(before).toBeGreaterThan(0.4);
  expect(before).toBeLessThan(0.5);
  // It then runs out its remaining 0.25 s and no more.
  expect(burstProgress(15.2 + BURST_S - 0.2 - 0.01, battle.defendedAt)).toBeLessThan(1);
  expect(burstProgress(15.2 + BURST_S - 0.2 + 0.01, battle.defendedAt)).toBe(1);
  resetBattle();
});

test("a pause after a burst is over leaves it over and its time untouched, so the effects see no new defend", () => {
  resetBattle();
  battle.defendedAt = 10;
  battle.defendedMove = "dodge_left";
  // Paused a full second after the defend, long after the burst ended, for 5 s.
  shiftBattleTimes(battle, 5000, 16);
  expect(battle.defendedAt).toBe(10);
  expect(burstProgress(16, battle.defendedAt)).toBe(1);
  // No defend has counted yet: still never.
  resetBattle();
  shiftBattleTimes(battle, 5000, 20);
  expect(battle.defendedAt).toBe(-Infinity);
  expect(burstProgress(20, battle.defendedAt)).toBe(1);
  resetBattle();
});

test("a pause does not move the boulder: its place comes from the engine's msLeft, which the shift leaves alone", () => {
  resetBattle();
  const attack = polyphemus.attacks.find((a) => a.id === "boulder");
  if (!attack) throw new Error("no boulder attack");
  const state = { ...startFight(polyphemus, 3), phase: { kind: "defend" as const, attack, msLeft: 1200, totalMs: 2000 } };
  battle.state = state;
  const aim = { x: 0, y: 1.9, z: 9.1 };
  const pose = { x: 0, y: 0, z: 0, scale: 0, spin: 0 };
  const place = (): object => {
    const phase = battle.state?.phase;
    if (phase?.kind !== "defend") throw new Error("not defending");
    return { ...boulderAt(pose, 1 - phase.msLeft / phase.totalMs, phase.totalMs, aim) };
  };
  const before = place();
  shiftBattleTimes(battle, 60000, 100);
  expect(battle.state).toBe(state);
  expect(place()).toEqual(before);
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
