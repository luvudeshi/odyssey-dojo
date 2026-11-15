import { describe, expect, it } from "vitest";
import { lossLayout, wreathLayout } from "../src/ui/pebble/ornaments";
import { makeRng, newLayout } from "../src/ui/pebble/stones";

const inside = (size: number) => (s: { x: number; y: number }): boolean => s.x >= 0 && s.y >= 0 && s.x <= size && s.y <= size;

describe("result ornaments", () => {
  it("lays the wreath inside its box, with two laurel strips and a sun ring", () => {
    const l = newLayout();
    wreathLayout(l, makeRng(11), 120);
    expect(l.stones.length).toBeGreaterThan(100);
    expect(l.stones.every(inside(120))).toBe(true);
    expect(l.strips).toHaveLength(3);
  });

  it("lays the same wreath from the same seed", () => {
    const a = newLayout(), b = newLayout();
    wreathLayout(a, makeRng(11), 120);
    wreathLayout(b, makeRng(11), 120);
    expect(a).toEqual(b);
  });

  it("lays the loss rosette inside its box with a lead ring", () => {
    const l = newLayout();
    lossLayout(l, makeRng(12), 120);
    expect(l.stones.length).toBeGreaterThan(20);
    expect(l.stones.every(inside(120))).toBe(true);
    expect(l.strips).toHaveLength(1);
  });
});
