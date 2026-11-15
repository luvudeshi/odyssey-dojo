import { describe, expect, it } from "vitest";
import { swallowAfter } from "../src/screens/cutscene/keySwallow";

describe("swallowAfter", () => {
  it("lets a key the cutscene never saw through, keyup included", () => {
    const held = new Set(["Space"]);
    expect(swallowAfter(held, "keyup", "KeyS", false)).toBe(false);
    expect(swallowAfter(held, "keydown", "KeyS", true)).toBe(false);
  });
  it("swallows the skip key's keyup once", () => {
    const held = new Set(["Space"]);
    expect(swallowAfter(held, "keyup", "Space", false)).toBe(true);
    expect(swallowAfter(held, "keyup", "Space", false)).toBe(false);
  });
  it("swallows a held skip key's repeats until it is released", () => {
    const held = new Set(["Space"]);
    expect(swallowAfter(held, "keydown", "Space", true)).toBe(true);
    expect(swallowAfter(held, "keydown", "Space", true)).toBe(true);
    expect(swallowAfter(held, "keyup", "Space", false)).toBe(true);
    expect(swallowAfter(held, "keydown", "Space", true)).toBe(false);
  });
});
