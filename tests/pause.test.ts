// Pause menu logic: what Esc does, the clock shift, and the fight-flow actions behind Restart and Quit.
import { expect, test } from "vitest";
import { startFight } from "../src/combat/engine";
import { enemy as polyphemus } from "../src/enemies/defs/polyphemus";
import { battle, decay, resetBattle } from "../src/render/battle";
import { boulderAt } from "../src/render/effects/boulderFlight";
import { BURST_S, burstFade, burstProgress, shieldUp } from "../src/render/effects/defendTiming";
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
  const times = ["enemyHitAt", "playerHitAt", "phaseAt", "wonAt", "lostAt", "struckAt", "reachAt", "powerAt"] as const;
  times.forEach((key) => { battle[key] = 10; });
  shiftBattleTimes(battle, 4000, 20);
  times.forEach((key) => { expect(battle[key], key).toBeCloseTo(14); });
  resetBattle();
});

test("a pause in the middle of a defend burst neither cuts it short nor starts it again", () => {
  resetBattle();
  battle.defendedAt = 10;
  battle.defendedMove = "block";
  // Paused 40% into the burst, for 5 s. The scene draws no frame while paused, so the next frame is 5 s later.
  const into = 0.4 * BURST_S;
  const paused = 10 + into;
  const resumed = paused + 5;
  const before = burstProgress(paused, battle.defendedAt);
  const fade = burstFade(before);
  const flash = decay(paused, battle.defendedAt, BURST_S);
  shiftBattleTimes(battle, 5000, resumed);
  expect(before).toBeCloseTo(0.4);
  expect(fade).toBeGreaterThan(0);
  expect(burstProgress(resumed, battle.defendedAt)).toBeCloseTo(before);
  expect(burstFade(burstProgress(resumed, battle.defendedAt))).toBeCloseTo(fade);
  expect(decay(resumed, battle.defendedAt, BURST_S)).toBeCloseTo(flash);
  // It then runs out what was left of it and no more.
  const left = BURST_S - into;
  expect(burstProgress(resumed + left - 0.01, battle.defendedAt)).toBeLessThan(1);
  expect(burstProgress(resumed + left + 0.01, battle.defendedAt)).toBe(1);
  resetBattle();
});

test("a pause after a burst is over leaves it over and its time untouched, so the effects see no new defend", () => {
  resetBattle();
  battle.defendedAt = 10;
  battle.defendedMove = "dodge_left";
  // Paused well after the burst ended, for 5 s.
  const resumed = 10 + BURST_S + 0.5 + 5;
  shiftBattleTimes(battle, 5000, resumed);
  expect(battle.defendedAt).toBe(10);
  expect(burstProgress(resumed, battle.defendedAt)).toBe(1);
  expect(burstFade(burstProgress(resumed, battle.defendedAt))).toBe(0);
  // No defend has counted yet: still never.
  resetBattle();
  shiftBattleTimes(battle, 5000, 20);
  expect(battle.defendedAt).toBe(-Infinity);
  expect(burstProgress(20, battle.defendedAt)).toBe(1);
  resetBattle();
});

test("the guard shield stays as it was across a pause: up through the block's flash, down once the flash is over", () => {
  const held = new Set(["block"]);
  const sinceBlock = (now: number): number => (battle.defendedMove === "block" ? now - battle.defendedAt : -1);
  // The block card has gone (no phase asks for a block), so only the flash after the counted block holds the shield up.
  resetBattle();
  battle.defendedAt = 10;
  battle.defendedMove = "block";
  const paused = 10 + 0.4 * BURST_S;
  expect(shieldUp(held, undefined, sinceBlock(paused))).toBe(true);
  shiftBattleTimes(battle, 5000, paused + 5);
  expect(sinceBlock(paused + 5)).toBeCloseTo(0.4 * BURST_S);
  expect(shieldUp(held, undefined, sinceBlock(paused + 5))).toBe(true);
  expect(shieldUp(held, undefined, sinceBlock(10 + 5 + BURST_S + 0.01))).toBe(false);
  // Paused after the flash: the shield was down and a pause does not bring it back.
  resetBattle();
  battle.defendedAt = 10;
  battle.defendedMove = "block";
  const late = 10 + BURST_S + 0.5;
  expect(shieldUp(held, undefined, sinceBlock(late))).toBe(false);
  shiftBattleTimes(battle, 5000, late + 5);
  expect(shieldUp(held, undefined, sinceBlock(late + 5))).toBe(false);
  // While a block card is up the shield follows the held block and the card alone, which a pause leaves as they are.
  const attack = polyphemus.attacks.find((a) => a.counter === "block");
  if (!attack) throw new Error("no attack countered by a block");
  const phase = { kind: "defend" as const, attack, msLeft: 800, totalMs: 2000 };
  expect(shieldUp(held, phase, sinceBlock(late + 5))).toBe(true);
  expect(shieldUp(new Set<string>(), phase, sinceBlock(late + 5))).toBe(false);
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
