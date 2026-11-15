// The grade for one attempt (src/coach/grade.ts): three tiers, lenient, with fixed points.
import { expect, test } from "vitest";
import { EXCELLENT_AT, POINTS, gradeFor } from "../src/coach";
import type { GradeTier } from "../src/coach";

test("an attempt the detector did not count needs improvement, whatever its quality", () => {
  for (const quality of [0, 0.5, 0.7, 1, Number.NaN]) {
    expect(gradeFor(false, quality)).toEqual({ tier: "needs_work", label: "Needs improvement", points: 25 });
  }
});

test("a counted attempt is at least Good: there is no way to count and be told it needs improvement", () => {
  for (const quality of [-1, 0, 0.01, 0.3, 0.69, 0.699999, Number.NaN, Number.NEGATIVE_INFINITY]) {
    expect(gradeFor(true, quality), String(quality)).toEqual({ tier: "good", label: "Good", points: 100 });
  }
});

test("a counted attempt at or above the line is Excellent, and the line is 0.7", () => {
  expect(EXCELLENT_AT).toBe(0.7);
  for (const quality of [EXCELLENT_AT, 0.71, 0.9, 1, 2, Number.POSITIVE_INFINITY]) {
    expect(gradeFor(true, quality), String(quality)).toEqual({ tier: "excellent", label: "Excellent!", points: 150 });
  }
});

test("better grades earn more points, and even a miss earns some", () => {
  expect(POINTS).toEqual({ excellent: 150, good: 100, needs_work: 25 });
  expect(POINTS.excellent).toBeGreaterThan(POINTS.good);
  expect(POINTS.good).toBeGreaterThan(POINTS.needs_work);
  expect(POINTS.needs_work).toBeGreaterThan(0);
});

test("the points and the word always go with the tier", () => {
  const words: Record<GradeTier, string> = { excellent: "Excellent!", good: "Good", needs_work: "Needs improvement" };
  for (const counted of [true, false]) {
    for (let quality = 0; quality <= 1; quality += 0.05) {
      const grade = gradeFor(counted, quality);
      expect(grade.points).toBe(POINTS[grade.tier]);
      expect(grade.label).toBe(words[grade.tier]);
    }
  }
});
