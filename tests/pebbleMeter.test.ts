import { describe, expect, it } from "vitest";
import { barMeter, changedStones, dotsMeter, edgeX, isLit, litCount, looseAt, loosePebbles, ringMeter } from "../src/ui/pebble/meter";

const lit = (): string => "#d9a34a";

describe("pebble meters", () => {
  const bar = barMeter({ width: 300, d: 10, rows: 2, seed: 1, lit });

  it("lays out whole columns, rows staggered by one stone", () => {
    expect(bar.w).toBeLessThanOrEqual(300);
    const cols = Math.floor((300 - 14) / 10);
    expect(bar.stones).toHaveLength(cols + (cols - 1));
    expect(bar.trough).not.toBeNull();
  });

  it("is deterministic", () => {
    expect(barMeter({ width: 300, d: 10, rows: 2, seed: 1, lit })).toEqual(bar);
  });

  it("lights stones left to right by value", () => {
    expect(litCount(bar, 0)).toBe(0);
    expect(litCount(bar, 1)).toBe(bar.stones.length);
    const half = litCount(bar, 0.5);
    expect(half).toBeGreaterThan(bar.stones.length * 0.4);
    expect(half).toBeLessThan(bar.stones.length * 0.6);
    expect(isLit(0.5, 0.5)).toBe(true);
    expect(isLit(0.51, 0.5)).toBe(false);
  });

  it("a bar that fills from the right lights the right-hand stones first", () => {
    const rtl = barMeter({ width: 300, d: 10, rows: 1, dir: -1, seed: 1, lit });
    const on = rtl.stones.filter((s) => isLit(s.k, 0.3));
    expect(on.length).toBeGreaterThan(0);
    expect(on.every((s) => s.stone.x > rtl.w / 2)).toBe(true);
    expect(edgeX(rtl, 0.3)).toBeGreaterThan(rtl.w / 2);
  });

  it("only the stones between two values change, in either direction", () => {
    expect(changedStones(bar, 0.5, 0.5)).toEqual([]);
    const up = changedStones(bar, 0.4, 0.6), down = changedStones(bar, 0.6, 0.4);
    expect(up.length).toBeGreaterThan(0);
    expect(up.length).toBeLessThan(bar.stones.length * 0.3);
    expect(down).toEqual(up);
    expect(changedStones(bar, 0, 1)).toHaveLength(bar.stones.length);
    expect(changedStones(bar, 0.5, 0.52).length).toBeLessThan(6);
  });

  it("dots are one row of exactly n stones, with or without a trough", () => {
    const dots = dotsMeter({ n: 20, d: 12, seed: 1, lit });
    expect(dots.stones).toHaveLength(20);
    expect(dots.trough).not.toBeNull();
    const bare = dotsMeter({ n: 12, d: 10, seed: 1, lit, trough: false });
    expect(bare.stones).toHaveLength(12);
    expect(bare.trough).toBeNull();
    expect(litCount(dots, 0.5)).toBe(10);
  });

  it("a ring lights clockwise from the top", () => {
    const ring = ringMeter({ n: 24, radius: 20, d: 6, seed: 1, lit });
    expect(ring.stones).toHaveLength(24);
    const c = ring.w / 2, first = ring.stones.find((s) => isLit(s.k, 1 / 24));
    expect(first?.stone.x).toBeGreaterThan(c - 4);
    expect(first?.stone.y).toBeLessThan(c - 15);
    expect(litCount(ring, 0.25)).toBe(6);
  });

  it("a drop knocks pebbles loose below the bar; a heal or a nick does not", () => {
    const out = loosePebbles(bar, 0.9, 0.5, 5, lit);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out.every((l) => l.y1 > bar.h)).toBe(true);
    expect(loosePebbles(bar, 0.5, 0.9, 5, lit)).toEqual([]);
    expect(loosePebbles(bar, 0.51, 0.5, 5, lit)).toEqual([]);
    expect(loosePebbles(bar, 0.9, 0.5, 5, lit)).toEqual(out);
  });

  it("a loose pebble falls, rests, then fades out", () => {
    const l = loosePebbles(bar, 1, 0.2, 2, lit)[0];
    if (!l) throw new Error("expected a pebble");
    expect(looseAt(l, 0).y).toBe(l.y0);
    expect(looseAt(l, 0.5).y).toBe(l.y1);
    expect(looseAt(l, 0.5).alpha).toBe(1);
    expect(looseAt(l, 1).alpha).toBe(0);
    expect(looseAt(l, 0.2).y).toBeGreaterThan(l.y0);
  });
});
