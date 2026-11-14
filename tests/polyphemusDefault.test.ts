import { describe, expect, it } from "vitest";
import { polyphemusChoice } from "../src/render/models/candidates";
import { enemy } from "../src/enemies/defs/polyphemus";

describe("polyphemusChoice", () => {
  it("defaults to the giant with no flag or an unknown one", () => {
    for (const id of [null, "", "giant", "nope", "constructor", "__proto__"]) expect(polyphemusChoice(id)).toBe("giant");
  });
  it("keeps classic and dev working", () => {
    expect(polyphemusChoice("classic")).toBe("classic");
    expect(polyphemusChoice("dev")).toBe("dev");
  });
});

describe("Polyphemus weak spots", () => {
  it("sit on the giant: eye above the gut, both in front of his body", () => {
    const eye = enemy.weakSpots.find((w) => w.id === "eye")?.position;
    const gut = enemy.weakSpots.find((w) => w.id === "gut")?.position;
    expect(eye?.[1]).toBeGreaterThan(3.5);
    expect(eye?.[1]).toBeLessThan(4.6);
    expect(gut?.[1]).toBeGreaterThan(1.5);
    expect(gut?.[1]).toBeLessThan(3);
  });
});
