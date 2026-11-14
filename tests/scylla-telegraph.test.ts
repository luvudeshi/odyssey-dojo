import { describe, expect, it } from "vitest";
import { ATTACK_NECK, NECK_COUNT, neckPose, restPose } from "../src/render/monsters/scylla/pose";

const rear = { rear: 1, strike: 0, expose: 0, dead: 0 };
const dead = { rear: 0, strike: 0, expose: 0, dead: 1 };

describe("Scylla windup telegraph", () => {
  it.each(["head_center", "head_high"])("%s: the winding head rears at least 2.5 m clear of its rest spot", (attack) => {
    const i = ATTACK_NECK[attack] ?? -1;
    const a = neckPose(i, rear, 0).h, b = restPose(i, 0).h;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(2.5);
  });

  it("a defeated head hangs low and forward of the cave, in reach of the won-camera orbit", () => {
    for (let i = 0; i < NECK_COUNT; i++) {
      const h = neckPose(i, dead, 2).h;
      expect(h[1]).toBeLessThan(2);
      expect(h[2]).toBeGreaterThan(-9);
    }
  });
});
