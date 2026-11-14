// The small pure parts of the cave look: the hit pulse and the quality toggle.
import { expect, test } from "vitest";
import { hitPulse, markHit } from "../src/render/effects/pulse";
import { nextQuality } from "../src/render/quality";

test("the hit pulse starts at 1, decays within 250 ms and never goes negative", () => {
  markHit(1000);
  expect(hitPulse(1000)).toBe(1);
  expect(hitPulse(1125)).toBeCloseTo(0.5, 5);
  expect(hitPulse(1250)).toBe(0);
  expect(hitPulse(5000)).toBe(0);
});

test("q cycles between high and low", () => {
  expect(nextQuality("high")).toBe("low");
  expect(nextQuality("low")).toBe("high");
});
