import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import { ENEMIES } from "../src/enemies/registry";
import { STYLES } from "../src/styles/registry";
import { battle, resetBattle, syncBattle } from "../src/render/battle";
import { BURST_S, burstFade, burstKind, burstProgress, easeOut, shieldScale, shieldUp, stepShield } from "../src/render/effects/defendTiming";

test("the shield rises in about 120 ms while held and leaves in about 150 ms once dropped", () => {
  let level = 0;
  for (let i = 0; i < 6; i++) level = stepShield(level, true, 0.02);
  expect(level).toBe(1);
  expect(stepShield(0, true, 0.06)).toBeCloseTo(0.5);
  level = 1;
  for (let i = 0; i < 7; i++) level = stepShield(level, false, 0.02);
  expect(level).toBeLessThan(0.07);
  expect(stepShield(level, false, 0.5)).toBe(0);
  expect(shieldScale(0)).toBe(0);
  expect(shieldScale(1)).toBeCloseTo(1);
});

test("each counted defend draws its own burst", () => {
  expect(["block", "dodge_left", "dodge_right", "duck", "jump", "punch"].map(burstKind)).toEqual(["block", "dodge", "dodge", "duck", "jump", null]);
  expect(burstProgress(5, 5)).toBe(0);
  expect(burstProgress(5 + BURST_S + 0.001, 5)).toBe(1);
  expect(burstProgress(1, 5)).toBe(1);
});

test("a burst eases in and out: dark at both ends, no pop, and ease-out never overshoots", () => {
  expect(burstFade(0)).toBe(0);
  expect(burstFade(1)).toBe(0);
  expect(burstFade(0.02)).toBeLessThan(0.1);
  expect(burstFade(0.1)).toBeGreaterThan(0.7);
  expect(burstFade(0.6)).toBeLessThan(burstFade(0.3));
  expect([0, 0.25, 0.5, 1].map(easeOut).every((v, i, all) => v >= (all[i - 1] ?? 0) && v <= 1)).toBe(true);
  expect(easeOut(0.5)).toBeGreaterThan(0.5);
});

test("syncBattle stamps the move and time when a defend counts, and not before", () => {
  const enemy = ENEMIES[0];
  const style = STYLES[0];
  if (!enemy || !style) throw new Error("no enemy or style");
  resetBattle();
  let state = startFight(enemy, 7);
  syncBattle(battle, state, 1);
  expect(battle.defendedMove).toBe("");
  for (let i = 0; i < 200 && battle.defendedMove === ""; i++) {
    const counter = state.phase.kind === "defend" ? state.phase.attack.counter : null;
    state = step(state, enemy, style, { held: new Set(counter ? [counter] : []), struck: [] }, 50).state;
    syncBattle(battle, state, 2 + i);
  }
  expect(burstKind(battle.defendedMove)).not.toBeNull();
  expect(battle.defendedAt).toBeGreaterThanOrEqual(2);
  resetBattle();
  expect(battle.defendedAt).toBe(-Infinity);
});

test("the shield is up only on a held block while the card asks for a block, and through the flash after it counts", () => {
  const enemy = ENEMIES[0];
  if (!enemy) throw new Error("no enemy");
  const attack = (counter: string) => {
    const found = enemy.attacks.find((candidate) => candidate.counter === counter);
    if (!found) throw new Error(`no ${counter} attack`);
    return { kind: "defend", attack: found, msLeft: 500, totalMs: 900 } as const;
  };
  const other = enemy.attacks.find((candidate) => candidate.counter !== "block")?.counter ?? "";
  const block = new Set(["block"]);
  expect(shieldUp(block, attack("block"), -1)).toBe(true);
  expect(shieldUp(new Set<string>(), attack("block"), -1)).toBe(false);
  expect(shieldUp(block, attack(other), -1)).toBe(false);
  expect(shieldUp(block, { kind: "recover", msLeft: 300 }, -1)).toBe(false);
  expect(shieldUp(block, undefined, -1)).toBe(false);
  // The block has just counted and the card has moved on to the strike: the shield stays for its flash, then drops.
  expect(shieldUp(block, { kind: "recover", msLeft: 300 }, 0.2)).toBe(true);
  expect(shieldUp(block, { kind: "recover", msLeft: 300 }, BURST_S)).toBe(false);
  expect(shieldUp(new Set<string>(), { kind: "recover", msLeft: 300 }, 0.2)).toBe(false);
});
