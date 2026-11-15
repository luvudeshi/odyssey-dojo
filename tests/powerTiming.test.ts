import { expect, test } from "vitest";
import { GOD_IDS } from "../src/ai/gods/gods";
import { battle, resetBattle, stampPower } from "../src/render/battle";
import { startFight } from "../src/combat/engine";
import { ENEMIES } from "../src/enemies/registry";
import { calmGlow, lightLevel, screenLayer, shakeAmount } from "../src/render/effects/power/powerLook";
import { POWER_SPAN, WINDUP_S, bump, makeClock, readClock } from "../src/render/effects/power/powerTiming";
import { shiftBattleTimes } from "../src/ui/pauseState";

test("every god's power has a 300 ms wind-up, a hit after it, and 1.2 to 2.0 s in all", () => {
  for (const god of GOD_IDS) {
    const { hit, total } = POWER_SPAN[god];
    expect(hit).toBeGreaterThan(WINDUP_S);
    expect(total).toBeGreaterThan(hit + 0.4);
    expect(total).toBeGreaterThanOrEqual(1.2);
    expect(total).toBeLessThanOrEqual(2.0);
  }
});

test("the clock is idle before the power, runs wind-up, strike and aftermath, and is idle again at the end", () => {
  const c = makeClock();
  expect(readClock(c, "zeus", 10, 9.9).phase).toBe("idle");
  expect(readClock(c, null, 10, 10.2).phase).toBe("idle");
  const early = readClock(c, "zeus", 10, 10.15);
  expect(early.phase).toBe("windup");
  expect(early.wind).toBeCloseTo(0.5);
  expect(early.strike).toBe(0);
  const mid = readClock(c, "zeus", 10, 10 + (WINDUP_S + POWER_SPAN.zeus.hit) / 2);
  expect(mid.phase).toBe("strike");
  expect(mid.strike).toBeCloseTo(0.5);
  expect(readClock(c, "zeus", 10, 10 + POWER_SPAN.zeus.hit).phase).toBe("aftermath");
  expect(readClock(c, "zeus", 10, 10 + POWER_SPAN.zeus.total - 0.001).after).toBeGreaterThan(0.99);
  expect(readClock(c, "zeus", 10, 10 + POWER_SPAN.zeus.total + 0.001).phase).toBe("idle");
  expect(readClock(c, "zeus", -Infinity, 10).phase).toBe("idle");
});

test("only Hermes lands more than one hit", () => {
  for (const god of GOD_IDS) expect(POWER_SPAN[god].echoes.length).toBe(god === "hermes" ? 2 : 0);
});

test("the light, tint and shake are off when idle, peak around the hit and die away", () => {
  const c = makeClock();
  const tint = { r: 0, g: 0, b: 0, a: 0 };
  for (const god of GOD_IDS) {
    readClock(c, god, 0, 5);
    expect(lightLevel(god, c)).toBe(0);
    screenLayer(god, c, tint);
    expect(tint.a).toBe(0);
    expect(calmGlow(god, c)).toBe(0);
    expect(shakeAmount(god, -0.1)).toBe(0);
    expect(shakeAmount(god, 5)).toBe(0);
    expect(shakeAmount(god, 0)).toBeGreaterThan(0);
    readClock(c, god, 0, POWER_SPAN[god].hit + 0.02);
    expect(lightLevel(god, c)).toBeGreaterThan(lightLevel(god, readClock(c, god, 0, 0.1)));
    expect(calmGlow(god, c)).toBeGreaterThan(0);
  }
});

test("Zeus darkens the sky before the bolt and flashes white on it", () => {
  const c = makeClock();
  const tint = { r: 0, g: 0, b: 0, a: 0 };
  screenLayer("zeus", readClock(c, "zeus", 0, 0.25), tint);
  expect(tint.a).toBeGreaterThan(0.2);
  expect(tint.b).toBeLessThan(0.2);
  screenLayer("zeus", readClock(c, "zeus", 0, POWER_SPAN.zeus.hit + 0.01), tint);
  expect(tint.r).toBeGreaterThan(0.8);
  expect(tint.a).toBeGreaterThan(0.5);
});

test("bump rises and falls inside its window", () => {
  expect(bump(0, 0, 1)).toBe(0);
  expect(bump(0.5, 0, 1)).toBeCloseTo(1);
  expect(bump(1, 0, 1)).toBeCloseTo(0);
});

test("stamping a power notes when, whose, and the weak spot it was thrown at; a pause pushes the time on", () => {
  resetBattle();
  const state = startFight(ENEMIES[0] ?? (() => { throw new Error("no enemies"); })(), 1);
  stampPower(battle, "hermes", 12, state);
  expect(battle.powerAt).toBe(12);
  expect(battle.powerGod).toBe("hermes");
  expect(battle.powerSpot).toBeNull();
  const enemy = ENEMIES[0];
  const spot = enemy?.weakSpots[0];
  if (!spot) throw new Error("no weak spot");
  stampPower(battle, "zeus", 13, { ...state, phase: { kind: "strike", weakSpot: spot, move: "jab", msLeft: 500, totalMs: 900 } });
  expect(battle.powerSpot).toEqual(spot.position);
  shiftBattleTimes(battle, 2500);
  expect(battle.powerAt).toBeCloseTo(15.5);
  resetBattle();
  expect(battle.powerAt).toBe(-Infinity);
  expect(battle.powerGod).toBeNull();
});
