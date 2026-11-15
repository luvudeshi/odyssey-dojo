import { expect, it } from "vitest";
import { inStones } from "../src/ui/pebble/PebbleHeading";

it("sets only short, large headings in stones; the rest is solid type", () => {
  expect(inStones("The Road Home", 60)).toBe(true);
  expect(inStones("Polyphemus", 56)).toBe(true);
  expect(inStones("Paused", 36)).toBe(false);
  expect(inStones("Choose your fighting style", 72)).toBe(false);
});
