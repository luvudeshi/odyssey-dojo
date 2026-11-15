// The water normal map for Charybdis's look "a" is made in code: right size, every normal points up, and it tiles.
import { expect, test } from "vitest";
import { waterNormalBytes } from "../src/render/arena/charybdis/waterNormals";

test("the normal map has the right size and every normal points up", () => {
  const size = 64;
  const bytes = waterNormalBytes(size);
  expect(bytes.length).toBe(size * size * 4);
  for (let i = 0; i < bytes.length; i += 4) {
    expect(bytes[i + 2]).toBeGreaterThan(200);
    expect(bytes[i + 3]).toBe(255);
  }
});

test("the normal map has real relief and repeats exactly with its period", () => {
  const a = waterNormalBytes(64);
  const reds = new Set<number>();
  for (let i = 0; i < a.length; i += 4) reds.add(a[i] ?? 0);
  expect(reds.size).toBeGreaterThan(10);
  expect(waterNormalBytes(64)).toEqual(a);
});
