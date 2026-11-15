import { describe, expect, it } from "vitest";
import { GOD_IDS } from "../src/ai/gods/gods";
import type { GodId } from "../src/ai/gods/gods";
import { WEBCAM_SHARE, newPowerPose, powerPoseAt, powerPoseEnd } from "../src/render/hero/powerPose";
import type { PowerPose } from "../src/render/hero/powerPose";

const END: Record<GodId, number> = { zeus: 1.2, poseidon: 1.2, athena: 1.0, hermes: 1.4, artemis: 1.2, apollo: 1.4 };
const at = (god: GodId, t: number, share = 1): PowerPose => {
  const p = newPowerPose();
  powerPoseAt(god, t, share, p);
  return p;
};
const vec = (p: PowerPose): number[] => [p.wR, p.wL, p.crouch, p.lean, p.roll, ...p.dirs];
const strength = (p: PowerPose): number => p.wR + p.wL + p.crouch + p.lean + Math.abs(p.roll);

describe("powerPose", () => {
  it.each(GOD_IDS)("%s: no change outside its window", (god) => {
    const p = newPowerPose();
    expect(powerPoseEnd(god)).toBe(END[god]);
    for (const t of [-1, -0.001, END[god], END[god] + 0.5, NaN]) {
      expect(powerPoseAt(god, t, 1, p)).toBe(false);
      expect(p.active).toBe(false);
    }
    expect(powerPoseAt(null, 0.5, 1, p)).toBe(false);
  });

  it.each(GOD_IDS)("%s: eases in from nothing, differs from rest inside, eases back to nothing", (god) => {
    expect(strength(at(god, 0))).toBe(0);
    expect(strength(at(god, 0.05))).toBeGreaterThan(0);
    expect(strength(at(god, 0.5))).toBeGreaterThan(0.3);
    expect(strength(at(god, END[god] - 0.001))).toBeLessThan(0.02);
  });

  it.each(GOD_IDS)("%s: continuous at 60 fps", (god) => {
    let prev = vec(at(god, 0));
    for (let t = 1 / 60; t < END[god]; t += 1 / 60) {
      const next = vec(at(god, t));
      next.forEach((v, i) => expect(Math.abs(v - (prev[i] ?? 0))).toBeLessThan(0.35));
      prev = next;
    }
  });

  it("zeus: right arm up at 0.3, down by 0.6, left arm untouched", () => {
    expect(at("zeus", 0.3).dirs[1]).toBeGreaterThan(0.8);
    expect(at("zeus", 0.6).dirs[1]).toBeLessThan(0);
    expect(at("zeus", 0.5).wL).toBe(0);
  });

  it("poseidon: drawn back low at 0.3, swept forward by 0.95", () => {
    const back = at("poseidon", 0.3);
    const sweep = at("poseidon", 0.95);
    expect(back.crouch).toBeGreaterThan(0.4);
    expect(back.dirs[2]).toBeGreaterThan(0.3);
    expect(sweep.dirs[2]).toBeLessThan(-0.3);
  });

  it("athena: shield arm in at 0.3, thrust forward by 0.75 and held to 0.85", () => {
    expect(at("athena", 0.3).dirs[8]).toBeGreaterThan(-0.6);
    for (const t of [0.75, 0.85]) expect(at("athena", t).dirs[8]).toBeLessThan(-0.9);
    expect(at("athena", 0.75).wR).toBe(0);
  });

  it("hermes: crouched at 0.3, still low and leaning at 1.3, nearly back at 1.39", () => {
    expect(at("hermes", 0.3).crouch).toBeGreaterThan(0.9);
    expect(at("hermes", 1.3).lean).toBeGreaterThan(0.9);
    expect(strength(at("hermes", 1.39))).toBeLessThan(0.1);
  });

  it("artemis: drawn at 0.3, released after, held at 0.85, lowered by 1.2", () => {
    expect(at("artemis", 0.3).dirs[5]).toBeGreaterThan(0.9);
    expect(at("artemis", 0.4).dirs[5]).toBeLessThan(0.6);
    expect(at("artemis", 0.85).wR).toBeGreaterThan(0.99);
    expect(strength(at("artemis", 1.19))).toBeLessThan(0.02);
  });

  it("apollo: both arms up at 0.45, thrown forward by 0.85, held to 1.25", () => {
    const up = at("apollo", 0.45);
    expect(up.dirs[1]).toBeGreaterThan(0.9);
    expect(up.dirs[7]).toBeGreaterThan(0.9);
    for (const t of [0.85, 1.25]) {
      const p = at("apollo", t);
      expect(p.dirs[2]).toBeLessThan(-0.9);
      expect(p.dirs[8]).toBeLessThan(-0.9);
    }
  });

  it("webcam play keeps only its share", () => {
    const full = at("zeus", 0.4);
    const live = at("zeus", 0.4, WEBCAM_SHARE);
    expect(live.wR).toBeCloseTo(full.wR * WEBCAM_SHARE, 10);
    expect(live.lean).toBeCloseTo(full.lean * WEBCAM_SHARE, 10);
  });
});
