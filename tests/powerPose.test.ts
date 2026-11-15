import { describe, expect, it } from "vitest";
import { GOD_IDS } from "../src/ai/gods/gods";
import type { GodId } from "../src/ai/gods/gods";
import { WEBCAM_SHARE, newPowerPose, powerPoseAt, powerPoseEnd } from "../src/render/hero/powerPose";
import type { PowerPose } from "../src/render/hero/powerPose";
import { POWER_SPAN } from "../src/render/effects/power/powerTiming";

const END: Record<GodId, number> = { zeus: 1.6, poseidon: 1.75, athena: 1.4, hermes: 1.4, artemis: 1.5, apollo: 1.8 };
const at = (god: GodId, t: number, share = 1): PowerPose => {
  const p = newPowerPose();
  powerPoseAt(god, t, share, p);
  return p;
};
const vec = (p: PowerPose): number[] => [p.wR, p.wL, p.crouch, p.lean, p.roll, ...p.dirs];
const strength = (p: PowerPose): number => p.wR + p.wL + p.crouch + Math.abs(p.lean) + Math.abs(p.roll);

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

  it.each(GOD_IDS)("%s: held to near the end of its effect", (god) => {
    expect(powerPoseEnd(god)).toBeLessThanOrEqual(POWER_SPAN[god].total);
    expect(powerPoseEnd(god)).toBeGreaterThan(POWER_SPAN[god].hit + 0.4);
    expect(strength(at(god, POWER_SPAN[god].hit + 0.2))).toBeGreaterThan(1);
  });

  it("zeus: both arms to the sky at 0.3, both slammed down by the hit, held to 1.2", () => {
    const up = at("zeus", 0.3);
    expect(up.dirs[1]).toBeGreaterThan(0.9);
    expect(up.dirs[7]).toBeGreaterThan(0.9);
    expect(up.dirs[0]).toBeGreaterThan(0);
    expect(up.dirs[6]).toBeLessThan(0);
    // Squared up to the monster so both arms show from the camera behind him.
    expect(up.square).toBeGreaterThan(0.9);
    for (const t of [0.55, 1.2]) {
      const down = at("zeus", t);
      expect(down.dirs[1]).toBeLessThan(-0.4);
      expect(down.dirs[7]).toBeLessThan(-0.4);
      expect(down.crouch).toBeGreaterThan(0.5);
    }
  });

  it("poseidon: both hands drawn back to his right at 0.3, swept to his left by the hit", () => {
    const back = at("poseidon", 0.3);
    const sweep = at("poseidon", 0.95);
    expect(back.crouch).toBeGreaterThan(0.4);
    expect(back.dirs[2]).toBeGreaterThan(0.3);
    expect(back.dirs[9]).toBeGreaterThan(0.5);
    expect(sweep.dirs[0]).toBeLessThan(-0.3);
    expect(sweep.dirs[6]).toBeLessThan(-0.8);
    expect(sweep.roll).toBeGreaterThan(0.3);
  });

  it("athena: shield arm braced at 0.3, thrust out by the hit and held to 1.1, right arm back", () => {
    expect(at("athena", 0.3).dirs[8]).toBeGreaterThan(-0.6);
    for (const t of [0.75, 1.1]) {
      const p = at("athena", t);
      expect(p.dirs[6]).toBeLessThan(-0.7);
      expect(p.dirs[8]).toBeLessThan(-0.6);
      expect(p.dirs[2]).toBeGreaterThan(0.5);
      expect(p.lean).toBeGreaterThan(1);
    }
  });

  it("hermes: coiled at 0.3, leaning hard with arms back at 1.1, nearly back at 1.39", () => {
    expect(at("hermes", 0.3).crouch).toBeGreaterThan(0.8);
    const dash = at("hermes", 1.1);
    expect(dash.lean).toBeGreaterThan(1.5);
    expect(dash.dirs[2]).toBeGreaterThan(0.8);
    expect(dash.dirs[8]).toBeGreaterThan(0.8);
    expect(strength(at("hermes", 1.39))).toBeLessThan(0.1);
  });

  it("artemis: drawn by 0.4 and held to the hit, the hand flies back after, lowered by 1.5", () => {
    for (const t of [0.4, 0.85]) {
      const p = at("artemis", t);
      expect(p.dirs[0]).toBeGreaterThan(0.9);
      expect(p.dirs[3]).toBeLessThan(-0.6);
      expect(p.dirs[8]).toBeLessThan(-0.8);
      // Half side-on, as an archer stands.
      expect(p.square).toBeLessThan(0.5);
    }
    expect(at("artemis", 1.05).dirs[3]).toBeGreaterThan(0.6);
    expect(strength(at("artemis", 1.499))).toBeLessThan(0.02);
  });

  it("apollo: arms wide and high with the chest arched back from 0.5 to 1.45", () => {
    for (const t of [0.5, 0.85, 1.45]) {
      const p = at("apollo", t);
      expect(p.dirs[0]).toBeGreaterThan(0.9);
      expect(p.dirs[6]).toBeLessThan(-0.9);
      expect(p.dirs[1]).toBeGreaterThan(0.6);
      expect(p.lean).toBeLessThan(-1);
    }
  });

  it("webcam play keeps only its share", () => {
    const full = at("zeus", 0.4);
    const live = at("zeus", 0.4, WEBCAM_SHARE);
    expect(live.wR).toBeCloseTo(full.wR * WEBCAM_SHARE, 10);
    expect(live.lean).toBeCloseTo(full.lean * WEBCAM_SHARE, 10);
  });
});
