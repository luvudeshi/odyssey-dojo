import { describe, expect, it } from "vitest";
import { maskStones } from "../src/ui/pebble/mask";
import { PAL } from "../src/ui/pebble/palette";

/** A solid bar 60 wide and 20 tall inside an 80 by 40 mask. */
const bar = (): { alpha: Uint8Array; w: number; h: number } => {
  const w = 80, h = 40, alpha = new Uint8Array(w * h);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 70; x++) alpha[y * w + x] = 255;
  return { alpha, w, h };
};

describe("pebble text masks", () => {
  it("sets stones only where the mask is solid", () => {
    const stones = maskStones(bar(), { size: 4, seed: 1, col: PAL.cream });
    expect(stones.length).toBeGreaterThan(40);
    for (const s of stones) {
      expect(s.x).toBeGreaterThan(7); expect(s.x).toBeLessThan(73);
      expect(s.y).toBeGreaterThan(7); expect(s.y).toBeLessThan(33);
    }
  });

  it("an empty mask gives no stones", () => {
    expect(maskStones({ alpha: new Uint8Array(100), w: 10, h: 10 }, { size: 4, seed: 1, col: PAL.cream })).toEqual([]);
  });

  it("is deterministic per seed", () => {
    const a = maskStones(bar(), { size: 4, seed: 2, col: PAL.cream });
    expect(maskStones(bar(), { size: 4, seed: 2, col: PAL.cream })).toEqual(a);
    expect(maskStones(bar(), { size: 4, seed: 3, col: PAL.cream })).not.toEqual(a);
  });

  it("gives edge stones the rim colours and inner stones the fill colours", () => {
    const cream = new Set<string>(PAL.cream), ochre = new Set<string>(PAL.ochre);
    const stones = maskStones(bar(), { size: 4, seed: 1, col: PAL.cream, rim: PAL.ochre });
    const rim = stones.filter((s) => ochre.has(s.color)), fill = stones.filter((s) => cream.has(s.color));
    expect(rim.length).toBeGreaterThan(5);
    expect(fill.length).toBeGreaterThan(5);
    expect(rim.length + fill.length).toBe(stones.length);
    expect(fill.every((s) => s.x > 12 && s.x < 68 && s.y > 12 && s.y < 28)).toBe(true);
  });

  it("without a rim every stone takes the fill colours", () => {
    const cream = new Set<string>(PAL.cream);
    expect(maskStones(bar(), { size: 4, seed: 1, col: PAL.cream }).every((s) => cream.has(s.color))).toBe(true);
  });

  it("a larger stone size makes fewer stones", () => {
    expect(maskStones(bar(), { size: 8, seed: 1, col: PAL.cream }).length).toBeLessThan(maskStones(bar(), { size: 4, seed: 1, col: PAL.cream }).length);
  });
});
