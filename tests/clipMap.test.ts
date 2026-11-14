import { describe, expect, test } from "vitest";
import { decideHeroClip, decideMonsterClip, newDecision } from "../src/render/models/clipMap";
import type { MonsterClipConfig } from "../src/render/models/clipMap";

const config: MonsterClipConfig = {
  idle: "Idle",
  windup: { default: "Swing", byAttackId: { boulder: "Throw" } },
  hit: "Hurt",
  death: "Die",
  byPhase: { 1: { idle: "Rage" } },
};
const all = new Set(["Idle", "Swing", "Throw", "Hurt", "Die", "Rage"]);
const base = { windup: 0, attackId: null, defeated: false, phaseIndex: 0, hitFlash: 0 };

describe("decideMonsterClip", () => {
  test("idles and loops when nothing happens", () => {
    expect(decideMonsterClip(config, base, all, newDecision())).toEqual({ clip: "Idle", loop: true, scrub: null, timeScale: 1 });
  });
  test("scrubs the windup clip by windup, per attack id", () => {
    const d = decideMonsterClip(config, { ...base, windup: 0.4, attackId: "club" }, all, newDecision());
    expect(d).toMatchObject({ clip: "Swing", loop: false, scrub: 0.4 });
    expect(decideMonsterClip(config, { ...base, windup: 0.4, attackId: "boulder" }, all, newDecision()).clip).toBe("Throw");
  });
  test("hit and death win over idle, death wins over hit", () => {
    expect(decideMonsterClip(config, { ...base, hitFlash: 1 }, all, newDecision()).clip).toBe("Hurt");
    expect(decideMonsterClip(config, { ...base, hitFlash: 1, defeated: true }, all, newDecision())).toMatchObject({ clip: "Die", loop: false });
  });
  test("phase override replaces idle", () => {
    expect(decideMonsterClip(config, { ...base, phaseIndex: 1 }, all, newDecision()).clip).toBe("Rage");
  });
  test("missing clips fall back to idle, and to null when idle is missing too", () => {
    expect(decideMonsterClip(config, { ...base, defeated: true }, new Set(["Idle"]), newDecision())).toMatchObject({ clip: "Idle", loop: true });
    expect(decideMonsterClip(config, base, new Set(), newDecision()).clip).toBeNull();
  });
  test("attack clip stands in for a missing windup clip", () => {
    const c = { ...config, attack: "Slam" };
    expect(decideMonsterClip(c, { ...base, windup: 2, attackId: "x" }, new Set(["Idle", "Slam"]), newDecision())).toMatchObject({ clip: "Slam", scrub: 1 });
  });
  test("timeScale is passed through", () => {
    expect(decideMonsterClip({ ...config, timeScale: 2 }, base, all, newDecision()).timeScale).toBe(2);
  });
});

describe("decideHeroClip", () => {
  const hero = { idle: "Stand", block: "Guard", strike: "Punch" };
  const has = new Set(["Stand", "Guard", "Punch"]);
  test("maps actions, loops only held ones, falls back to idle", () => {
    expect(decideHeroClip(hero, "block", has, newDecision())).toMatchObject({ clip: "Guard", loop: true });
    expect(decideHeroClip(hero, "strike", has, newDecision())).toMatchObject({ clip: "Punch", loop: false });
    expect(decideHeroClip(hero, "duck", has, newDecision())).toMatchObject({ clip: "Stand", loop: true });
    expect(decideHeroClip(hero, "idle", new Set(), newDecision()).clip).toBeNull();
  });
});
