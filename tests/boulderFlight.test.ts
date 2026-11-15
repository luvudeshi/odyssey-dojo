import { describe, expect, it } from "vitest";
import { HAND, PICKUP, boulderAt, endingFor, missBreakMs, throwStart } from "../src/render/effects/boulderFlight";
import type { RockPose } from "../src/render/effects/boulderFlight";

const AIM = { x: 0, y: 1.9, z: 5.2 };
const fresh = (): RockPose => ({ x: 0, y: 0, z: 0, scale: 0, spin: 0 });

describe("boulder flight", () => {
  it("lies on the ground at the start, is overhead before the hurl and arrives at the aim when the telegraph ends", () => {
    expect(boulderAt(fresh(), 0, 2000, AIM).y).toBeCloseTo(PICKUP.y);
    expect(boulderAt(fresh(), throwStart(2000) - 0.001, 2000, AIM).y).toBeGreaterThan(HAND.y - 0.2);
    const landed = boulderAt(fresh(), 1, 2000, AIM);
    expect([landed.x, landed.y, landed.z]).toEqual([AIM.x, AIM.y, AIM.z]);
  });

  it("hurls for the last 400 ms, and never for more than half of a short telegraph", () => {
    expect(throwStart(2000)).toBeCloseTo(0.8);
    expect(throwStart(600)).toBe(0.5);
  });

  it("flies on past the aim after landing, falling toward the floor", () => {
    const past = boulderAt(fresh(), 1.1, 2000, AIM);
    expect(past.z).toBeGreaterThan(AIM.z);
    expect(past.y).toBeLessThan(AIM.y);
  });

  it("picks the ending: smash when hit, shatter on a block, miss for a duck or dodge", () => {
    expect(endingFor(true, "duck")).toBe("smash");
    expect(endingFor(false, "block")).toBe("shatter");
    expect(endingFor(false, "duck")).toBe("miss");
    expect(endingFor(false, "dodge_left")).toBe("miss");
  });

  it("breaks a missed rock on the floor soon after landing", () => {
    const ms = missBreakMs(2000, AIM);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(600);
    expect(boulderAt(fresh(), 1 + ms / 2000, 2000, AIM).y).toBeCloseTo(0.5, 1);
  });
});
