import { describe, expect, it } from "vitest";
import { cutBeat, curve, DARK_END, NAME_END, REDUCED_MS, REVEAL_END, TOTAL_MS } from "../src/screens/cutscene/timing";

describe("cutscene timing", () => {
  it("walks the four beats and ends by itself", () => {
    expect(cutBeat(0, false)).toEqual({ beat: "dark", t: 0 });
    expect(cutBeat(DARK_END, false)).toEqual({ beat: "reveal", t: 0 });
    expect(cutBeat((DARK_END + REVEAL_END) / 2, false).t).toBeCloseTo(0.5);
    expect(cutBeat(REVEAL_END, false).beat).toBe("name");
    expect(cutBeat(NAME_END, false).beat).toBe("exit");
    expect(cutBeat(TOTAL_MS - 1, false).beat).toBe("exit");
    expect(cutBeat(TOTAL_MS, false)).toEqual({ beat: "done", t: 1 });
  });
  it("stays between 4 and 5 seconds", () => {
    expect(TOTAL_MS).toBeGreaterThanOrEqual(4000);
    expect(TOTAL_MS).toBeLessThanOrEqual(5000);
  });
  it("is one still card of about 2 seconds with reduced motion", () => {
    expect(cutBeat(-5, true)).toEqual({ beat: "card", t: 0 });
    expect(cutBeat(REDUCED_MS / 2, true)).toEqual({ beat: "card", t: 0.5 });
    expect(cutBeat(REDUCED_MS, true).beat).toBe("done");
  });
  it("interpolates a curve and is 0 outside it", () => {
    const pts = [[10, 0], [20, 1], [30, 0]] as const;
    expect(curve(15, pts)).toBeCloseTo(0.5);
    expect(curve(20, pts)).toBe(1);
    expect(curve(5, pts)).toBe(0);
    expect(curve(99, pts)).toBe(0);
  });
});
