import { describe, expect, it } from "vitest";
import { newSwallowed, noteDown, swallowAfter } from "../src/screens/cutscene/swallow";

describe("cutscene key swallow", () => {
  it("lets a tapped other key keep its keyup", () => {
    const s = newSwallowed();
    noteDown(s, "Space");
    expect(swallowAfter(s, "keydown", "KeyA", false)).toBe(false);
    expect(swallowAfter(s, "keyup", "KeyA", false)).toBe(false);
  });
  it("swallows the skip key's keyup once", () => {
    const s = newSwallowed();
    noteDown(s, "Space");
    expect(swallowAfter(s, "keyup", "Space", false)).toBe(true);
    expect(swallowAfter(s, "keyup", "Space", false)).toBe(false);
    expect(s.keys.size).toBe(0);
  });
  it("swallows a held skip key's repeats until release, but not a fresh press", () => {
    const s = newSwallowed();
    noteDown(s, "Space");
    expect(swallowAfter(s, "keydown", "Space", true)).toBe(true);
    expect(swallowAfter(s, "keydown", "Space", true)).toBe(true);
    expect(swallowAfter(s, "keyup", "Space", false)).toBe(true);
    expect(swallowAfter(s, "keydown", "Space", false)).toBe(false);
  });
});
