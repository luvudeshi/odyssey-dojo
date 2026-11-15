import { describe, expect, it } from "vitest";
import { beatAt, frameAt, HANDOVER_MS, REDUCED_TOTAL_MS, SLAM_MS, TOTAL_MS } from "../src/screens/cutscene/timing";

describe("beatAt", () => {
  it("walks the five beats in order", () => {
    expect(beatAt(0)).toEqual({ beat: "slide", t: 0 });
    expect(beatAt(SLAM_MS / 2).beat).toBe("slide");
    expect(beatAt(SLAM_MS).beat).toBe("slam");
    expect(beatAt(2000).beat).toBe("face");
    expect(beatAt(3900).beat).toBe("burst");
    expect(beatAt(HANDOVER_MS + 10).beat).toBe("fade");
  });
  it("stays at the end past the total", () => {
    expect(beatAt(TOTAL_MS + 5000)).toEqual({ beat: "fade", t: 1 });
  });
});

describe("frameAt", () => {
  it("opens with both paintings off screen and ends fully gone", () => {
    const open = frameAt(0, false);
    expect([open.heroX, open.bossX, open.overlay]).toEqual([-100, 100, 1]);
    expect(frameAt(TOTAL_MS, false).overlay).toBe(0);
  });
  it("flashes on the slam and holds the halves together after it", () => {
    expect(frameAt(SLAM_MS, false).flash).toBe(1);
    const held = frameAt(2500, false);
    expect([held.heroX, held.bossX, held.flash]).toEqual([0, 0, 0]);
    expect(held.slabs).toBeCloseTo(1);
    expect(held.vs).toBe(1);
  });
  it("bursts the halves apart and whites out before the hand over", () => {
    const burst = frameAt(HANDOVER_MS, false);
    expect(burst.heroX).toBeLessThan(-50);
    expect(burst.bossX).toBeGreaterThan(50);
    expect(burst.white).toBe(1);
  });
  it("is a still card with reduced motion that fades only at the end", () => {
    const card = frameAt(900, true);
    expect([card.heroX, card.bossX, card.flash, card.zoom, card.overlay]).toEqual([0, 0, 0, 1, 1]);
    expect(frameAt(REDUCED_TOTAL_MS, true).overlay).toBe(0);
  });
});
