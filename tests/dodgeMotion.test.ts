import { describe, expect, it } from "vitest";
import type { DefendSeen } from "../src/hud/DefendFlash";
import { LOOK, Trail, bodyPoint, newDodge, pivotShift, stepDodge } from "../src/render/effects/dodge/dodgeMotion";
import type { DodgeInput, DodgeState } from "../src/render/effects/dodge/dodgeMotion";

const idle: DefendSeen = { kind: "recover", counter: null, met: false };
const windup = (counter: string, met: boolean): DefendSeen => ({ kind: "defend", counter, met });
const strike: DefendSeen = { kind: "strike", counter: null, met: false };

/** Runs the dodge for `seconds` at 60 fps; `input` says what the fight is doing at time t. */
function run(s: DodgeState, from: number, seconds: number, input: (t: number) => Partial<DodgeInput>, peek?: (t: number) => void): number {
  const dt = 1 / 60;
  let t = from;
  for (; t < from + seconds; t += dt) {
    stepDodge(s, LOOK, { now: t, dt, held: new Set(), seen: idle, defendedAt: -Infinity, defendedMove: "", live: false, ...input(t) });
    peek?.(t);
  }
  return t;
}

describe("the dodge spring", () => {
  it("steps back first, travels to the side, overshoots, and is home before the strike card", () => {
    const s = newDodge();
    let least = 0;
    let most = 0;
    // The blow winds up for 0.9 s with the dodge made at once, then lands and the strike card opens.
    const hit = run(s, 0, 0.9, () => ({ seen: windup("dodge_right", true), held: new Set(["dodge_right"]), defendedAt: 0, defendedMove: "dodge_right" }), () => {
      least = Math.min(least, s.x);
      most = Math.max(most, s.x);
    });
    expect(least).toBeLessThan(-0.02);
    expect(most).toBeGreaterThan(LOOK.dist);
    expect(s.x).toBeGreaterThan(LOOK.dist * 0.9);
    // The defend phase ends: the blow has missed. He holds for the look's beat, then is back on his mark.
    run(s, hit, 0.01, () => ({ seen: strike, held: new Set(["dodge_right"]), defendedAt: 0, defendedMove: "dodge_right" }));
    expect(s.missAt).toBeCloseTo(hit, 1);
    run(s, hit + 0.01, LOOK.hold + 0.5, () => ({ seen: strike, held: new Set(["dodge_right"]), defendedAt: 0, defendedMove: "dodge_right" }));
    expect(Math.abs(s.x)).toBeLessThan(0.03);
    expect(Math.abs(s.vx)).toBeLessThan(0.1);
  });

  it("goes left for dodge_left, mirrored, and a webcam share keeps only part of the travel", () => {
    const s = newDodge();
    run(s, 0, 0.8, () => ({ held: new Set(["dodge_left"]) }));
    expect(s.x).toBeLessThan(-LOOK.dist * 0.9);
    const w = newDodge();
    run(w, 0, 0.8, () => ({ held: new Set(["dodge_left"]), live: true }));
    expect(w.x).toBeGreaterThan(-LOOK.dist * 0.7);
    expect(w.x).toBeLessThan(-LOOK.dist * 0.4);
  });

  it("leans into the move and never turns past a quarter turn, so he is never rolled over", () => {
    const s = newDodge();
    let lean = 0;
    let turn = 0;
    run(s, 0, 1.2, () => ({ seen: windup("dodge_left", true) }), () => { lean = Math.min(lean, s.lean); turn = Math.max(turn, Math.abs(s.tiltZ)); });
    expect(s.x).toBeLessThan(-LOOK.dist * 0.9);
    expect(lean).toBeLessThan(-0.1);
    expect(turn).toBeLessThan(Math.PI / 4);
    expect(s.crouch).toBeGreaterThan(LOOK.crouch * 0.8);
  });

  it("returns home when a held dodge is released with no blow pending", () => {
    const s = newDodge();
    const t = run(s, 0, 0.5, () => ({ held: new Set(["dodge_right"]) }));
    run(s, t, 0.6, () => ({}));
    expect(Math.abs(s.x)).toBeLessThan(0.03);
    expect(s.missAt).toBe(-Infinity);
  });

  it("stays out until the blow passes even if the key is let go", () => {
    const s = newDodge();
    run(s, 0, 0.6, () => ({ seen: windup("dodge_left", true) }));
    expect(s.x).toBeLessThan(-LOOK.dist * 0.9);
  });

  it("a strike card ends a dodge that is still held", () => {
    const s = newDodge();
    const t = run(s, 0, 0.5, () => ({ held: new Set(["dodge_left"]) }));
    run(s, t, 0.5, () => ({ seen: strike, held: new Set(["dodge_left"]) }));
    expect(Math.abs(s.x)).toBeLessThan(0.03);
  });

  it("no look means no motion and the store says so", () => {
    const s = newDodge();
    stepDodge(s, null, { now: 1, dt: 0.016, held: new Set(["dodge_left"]), seen: idle, defendedAt: -Infinity, defendedMove: "", live: false });
    expect(s.active).toBe(false);
    expect(s.x).toBe(0);
    stepDodge(s, LOOK, { now: 1.1, dt: 0.016, held: new Set(), seen: idle, defendedAt: -Infinity, defendedMove: "", live: false });
    expect(s.active).toBe(true);
  });
});

describe("trail and body geometry", () => {
  it("samples where he was a moment ago, by interpolation", () => {
    const t = new Trail();
    for (let i = 0; i <= 10; i++) t.push(i * 0.1, i, 0);
    const out = { x: 0, tilt: 0 };
    expect(t.at(1, 0.25, out).x).toBeCloseTo(7.5, 5);
    expect(t.at(1, 0, out).x).toBeCloseTo(10, 5);
    expect(t.at(1, 50, out).x).toBe(0);
    expect(new Trail().at(1, 0.1, out).x).toBe(0);
  });

  it("turns points about the pivot and shifts the group so the pivot stays put", () => {
    const p = { x: 0, y: 0 };
    bodyPoint(1, 0, 0, 1.8, p);
    expect(p.x).toBeCloseTo(1, 5);
    expect(p.y).toBeCloseTo(1.8, 5);
    bodyPoint(0, Math.PI / 2, 0, 1.8, p);
    expect(p.x).toBeCloseTo(-1.2, 5);
    const sh = pivotShift(Math.PI / 2, { x: 0, y: 0 });
    expect(sh.x).toBeCloseTo(0.6, 5);
    expect(pivotShift(0, { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });
});
