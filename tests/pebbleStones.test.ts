import { describe, expect, it } from "vitest";
import { emblemLayout, logoLayout, logoSize, wordWidth } from "../src/ui/pebble/brand";
import { PAL } from "../src/ui/pebble/palette";
import { insidePoly, makeRng, pathLayout, rectLayout, ringLayout, roundedLayout, roundRectPoly, tileStones } from "../src/ui/pebble/stones";
import { trochoid, waveBand, waveHalfHeight, straightBase } from "../src/ui/pebble/wave";
import { newLayout } from "../src/ui/pebble/stones";

describe("pebble stone layouts", () => {
  it("makeRng is deterministic and in [0, 1)", () => {
    const a = makeRng(5), b = makeRng(5);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(makeRng(0)()).toBeGreaterThan(0);
  });

  it("the same seed gives the same stones, a different seed does not", () => {
    const a = rectLayout(120, 60, { seed: 3, size: 6, col: PAL.cream });
    expect(rectLayout(120, 60, { seed: 3, size: 6, col: PAL.cream })).toEqual(a);
    expect(rectLayout(120, 60, { seed: 4, size: 6, col: PAL.cream })).not.toEqual(a);
  });

  it("a rectangle is filled with stones that stay inside it, with a sensible count", () => {
    const l = rectLayout(200, 100, { seed: 1, size: 8, col: PAL.ground });
    expect(l.stones.length).toBeGreaterThan(150);
    expect(l.stones.length).toBeLessThan(400);
    for (const s of l.stones) {
      expect(s.x).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThanOrEqual(200);
      expect(s.y).toBeGreaterThanOrEqual(0); expect(s.y).toBeLessThanOrEqual(100);
      expect(s.a).toBeGreaterThan(0); expect(s.b).toBeGreaterThan(0);
    }
  });

  it("a colour function sees each stone's position", () => {
    const l = rectLayout(100, 40, { seed: 1, size: 6, col: (x) => (x < 50 ? "#111" : "#eee") });
    expect(l.stones.every((s) => (s.x < 50 ? s.color === "#111" : s.color === "#eee"))).toBe(true);
  });

  it("a rounded shape keeps its stones inside the outline and adds a lead strip", () => {
    const l = roundedLayout(160, 80, 20, { seed: 2, size: 6, col: PAL.dusk, lead: "#999", leadWidth: 3 });
    const poly = roundRectPoly(0, 0, 160, 80, 20);
    expect(l.stones.every((s) => insidePoly(poly, s.x, s.y))).toBe(true);
    expect(l.strips).toHaveLength(1);
    expect(l.strips[0]?.w).toBe(3);
    expect(roundedLayout(160, 80, [20, 20, 4, 4], { seed: 2, size: 6, col: PAL.dusk }).strips).toHaveLength(0);
  });

  it("a ring sits on its radius", () => {
    const l = ringLayout(50, 50, 30, { seed: 1, size: 5, col: PAL.cream });
    expect(l.stones.length).toBeGreaterThan(20);
    for (const s of l.stones) expect(Math.abs(Math.hypot(s.x - 50, s.y - 50) - 30)).toBeLessThan(5);
  });

  it("a path puts stones along it", () => {
    const l = pathLayout([[0, 0], [100, 0]], { seed: 1, size: 6, col: PAL.ochre, rows: 2 });
    expect(l.stones.length).toBeGreaterThan(30);
    for (const s of l.stones) expect(Math.abs(s.y)).toBeLessThan(8);
  });

  it("a tile has a whole number of staggered rows and columns, so it repeats without a seam", () => {
    const stones = tileStones(192, 192, { seed: 9, size: 7, col: PAL.ground });
    const cols = Math.round(192 / 6.3), rows = 2 * Math.round(192 / 6.16 / 2);
    expect(stones).toHaveLength(cols * rows);
    expect(stones.every((s) => s.flat)).toBe(true);
    expect(rows % 2).toBe(0);
  });

  it("the wave scroll has one eye per loop and two lead strips", () => {
    const l = newLayout();
    waveBand(l, makeRng(1), straightBase(0, 0), 300, { size: 4 });
    expect(l.strips).toHaveLength(2);
    expect(l.stones.length).toBeGreaterThan(60);
    const t = trochoid(100, 10, 16);
    expect(t.length).toBeGreaterThan(10);
    expect(waveHalfHeight(300, 4)).toBeGreaterThan(8);
    const open = newLayout();
    waveBand(open, makeRng(1), straightBase(0, 0), 300, { size: 4, lead: false });
    expect(open.strips).toHaveLength(0);
  });

  it("the logo and emblem are deterministic and sized", () => {
    expect(emblemLayout(120).stones).toEqual(emblemLayout(120).stones);
    expect(emblemLayout(200).stones.length).toBeGreaterThan(emblemLayout(200, 7, 2.4).stones.length);
    const big = logoLayout(1);
    expect(big.stones.length).toBeGreaterThan(1500);
    expect(logoSize(0.5).w).toBeLessThan(logoSize(1).w);
    expect(wordWidth("ODYSSEY", 16.5, 21.45)).toBeGreaterThan(500);
  });
});
