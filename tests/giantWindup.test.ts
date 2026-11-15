import { describe, expect, it } from "vitest";
import { giantLean } from "../src/render/models/giantWindup";
import type { Lean } from "../src/render/models/giantWindup";

const fresh = (): Lean => ({ roll: 0, yaw: 0, pitch: 0, x: 0, z: 0 });

describe("giantLean", () => {
  it("mirrors left and right club swings", () => {
    const l = giantLean("club_left", 1, fresh());
    const r = giantLean("club_right", 1, fresh());
    expect(l.x).toBeLessThan(0);
    expect(r.x).toBeGreaterThan(0);
    expect(l.roll).toBeCloseTo(-r.roll);
    expect(l.yaw).toBeCloseTo(-r.yaw);
  });
  it("reaches forward for the grab and rears back for the boulder", () => {
    expect(giantLean("grab", 1, fresh()).z).toBeGreaterThan(0.5);
    expect(giantLean("boulder", 1, fresh()).pitch).toBeLessThan(0);
  });
  it("is upright with no windup, no attack or an unknown attack", () => {
    for (const [id, w] of [["grab", 0], [null, 1], ["nope", 1]] as const) {
      expect(giantLean(id, w, fresh())).toEqual(fresh());
    }
  });
});
