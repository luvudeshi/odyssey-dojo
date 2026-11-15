import { describe, expect, it } from "vitest";
import type { DefendSeen } from "../src/hud/DefendFlash";
import { LOOKS, Trail, bodyPoint, dodgeVariant, newDodge, pivotShift, stepDodge } from "../src/render/effects/dodge/dodgeMotion";
import type { DodgeInput, DodgeState } from "../src/render/effects/dodge/dodgeMotion";

const idle: DefendSeen = { kind: "recover", counter: null, met: false };
const windup = (counter: string, met: boolean): DefendSeen => ({ kind: "defend", counter, met });
const strike: DefendSeen = { kind: "strike", counter: null, met: false };

/** Runs the dodge for `seconds` at 60 fps; `input` says what the fight is doing at time t. */
function run(s: DodgeState, variant: 1 | 2 | 3 | 4, from: number, seconds: number, input: (t: number) => Partial<DodgeInput>, peek?: (t: number) => void): number {
  const dt = 1 / 60;
  let t = from;
  for (; t < from + seconds; t += dt) {
    stepDodge(s, LOOKS[variant], { now: t, dt, held: new Set(), seen: idle, defendedAt: -Infinity, defendedMove: "", live: false, ...input(t) });
    peek?.(t);
  }
  return t;
}

describe("dodgeVariant", () => {
  it("reads ?dodge=1..4 and nothing else", () => {
    expect(dodgeVariant("?dodge=3")).toBe(3);
    expect(dodgeVariant("?debug&dodge=1")).toBe(1);
    expect(dodgeVariant("")).toBe(0);
    expect(dodgeVariant("?dodge=9")).toBe(0);
    expect(dodgeVariant("?dodge=x")).toBe(0);
  });
});

describe("the dodge spring", () => {
  for (const v of [1, 2, 3, 4] as const) {
    it(`look ${v}: steps back first, travels to the side, overshoots or settles, and is home before the strike card`, () => {
      const s = newDodge();
      let least = 0;
      let most = 0;
      // The blow winds up for 0.9 s with the dodge made at once, then lands and the strike card opens.
      const hit = run(s, v, 0, 0.9, () => ({ seen: windup("dodge_right", true), held: new Set(["dodge_right"]), defendedAt: 0, defendedMove: "dodge_right" }), () => {
        least = Math.min(least, s.x);
        most = Math.max(most, s.x);
      });
      expect(least).toBeLessThan(-0.02);
      expect(most).toBeGreaterThan(LOOKS[v].dist * 0.95);
      expect(s.x).toBeGreaterThan(LOOKS[v].dist * 0.9);
      // The defend phase ends: the blow has missed. He holds for the look's beat, then is back on his mark.
      run(s, v, hit, 0.01, () => ({ seen: strike, held: new Set(["dodge_right"]), defendedAt: 0, defendedMove: "dodge_right" }));
      expect(s.missAt).toBeCloseTo(hit, 1);
      run(s, v, hit + 0.01, LOOKS[v].hold + 0.5, () => ({ seen: strike, held: new Set(["dodge_right"]), defendedAt: 0, defendedMove: "dodge_right" }));
      expect(Math.abs(s.x)).toBeLessThan(0.03);
      expect(Math.abs(s.vx)).toBeLessThan(0.1);
    });
  }

  it("goes left for dodge_left, and a webcam share keeps only part of the travel", () => {
    const s = newDodge();
    run(s, 1, 0, 0.8, () => ({ held: new Set(["dodge_left"]) }));
    expect(s.x).toBeLessThan(-LOOKS[1].dist * 0.9);
    const w = newDodge();
    run(w, 1, 0, 0.8, () => ({ held: new Set(["dodge_left"]), live: true }));
    expect(w.x).toBeGreaterThan(-LOOKS[1].dist * 0.7);
    expect(w.x).toBeLessThan(-LOOKS[1].dist * 0.4);
  });

  it("returns home when a held dodge is released with no blow pending", () => {
    const s = newDodge();
    const t = run(s, 2, 0, 0.5, () => ({ held: new Set(["dodge_right"]) }));
    run(s, 2, t, 0.6, () => ({}));
    expect(Math.abs(s.x)).toBeLessThan(0.03);
    expect(s.missAt).toBe(-Infinity);
  });

  it("stays out until the blow passes even if the key is let go, and leans into the move", () => {
    const s = newDodge();
    let lean = 0;
    run(s, 1, 0, 0.6, () => ({ seen: windup("dodge_left", true) }), () => { lean = Math.min(lean, s.lean); });
    expect(s.x).toBeLessThan(-LOOKS[1].dist * 0.9);
    expect(lean).toBeLessThan(-0.1);
  });

  it("a strike card ends a dodge that is still held", () => {
    const s = newDodge();
    const t = run(s, 4, 0, 0.5, () => ({ held: new Set(["dodge_left"]) }));
    run(s, 4, t, 0.5, () => ({ seen: strike, held: new Set(["dodge_left"]) }));
    expect(Math.abs(s.x)).toBeLessThan(0.03);
  });

  it("the roll turns once while he travels and ends upright; the Hermes push rises as the blow misses", () => {
    const r = newDodge();
    let turned = 0;
    const t = run(r, 3, 0, 0.7, () => ({ held: new Set(["dodge_right"]) }), () => { turned = Math.min(turned, r.tiltZ); });
    expect(turned).toBeLessThan(-Math.PI);
    run(r, 3, t, 0.8, () => ({}));
    expect(Math.abs(Math.sin(r.tiltZ / 2))).toBeLessThan(0.05);

    const h = newDodge();
    const hit = run(h, 4, 0, 0.7, () => ({ seen: windup("dodge_left", true), defendedAt: 0, defendedMove: "dodge_left" }));
    const before = h.push;
    run(h, 4, hit, 0.3, () => ({ seen: strike, defendedAt: 0, defendedMove: "dodge_left" }));
    expect(h.push).toBeGreaterThan(before);
    expect(h.push).toBeGreaterThan(0.8);
  });

  it("no look means no motion and the store says so", () => {
    const s = newDodge();
    stepDodge(s, null, { now: 1, dt: 0.016, held: new Set(["dodge_left"]), seen: idle, defendedAt: -Infinity, defendedMove: "", live: false });
    expect(s.variant).toBe(0);
    expect(s.x).toBe(0);
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
