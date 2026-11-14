import { describe, expect, it } from "vitest";
import { candidate } from "../src/render/hero/defs/warrior";

describe("warrior dodge", () => {
  it("steps with Walk_Loop on both sides instead of leaning on the idle clip", () => {
    expect(candidate.rig.poses.dodgeLeft).toEqual(["Walk_Loop"]);
    expect(candidate.rig.poses.dodgeRight).toEqual(["Walk_Loop"]);
  });
});
