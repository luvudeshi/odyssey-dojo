import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { model } from "../src/render/monsters/models/Polyphemus";
import { enemy } from "../src/enemies/defs/polyphemus";

describe("Polyphemus model", () => {
  it("is the one hand-built model, registered with no URL switch", () => {
    expect(model.enemyId).toBe("polyphemus");
    const registry = readFileSync("src/render/monsters/registry.ts", "utf8");
    expect(registry).not.toMatch(/URLSearchParams|\.glb|polyphemus/);
  });
});

describe("Polyphemus weak spots", () => {
  it("sit on the hand-built body: eye on the face, gut on the belly, both in front of him", () => {
    const eye = enemy.weakSpots.find((w) => w.id === "eye")?.position;
    const gut = enemy.weakSpots.find((w) => w.id === "gut")?.position;
    expect(eye?.[1]).toBeGreaterThan(3.5);
    expect(eye?.[1]).toBeLessThan(4);
    expect(eye?.[2]).toBeGreaterThan(1.0);
    expect(gut?.[1]).toBeGreaterThan(1.6);
    expect(gut?.[1]).toBeLessThan(2.4);
    expect(gut?.[2]).toBeGreaterThan(0.8);
  });
});
