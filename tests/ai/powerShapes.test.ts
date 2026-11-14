// The power effect's shapes must be repeatable, stay inside the box they are given and be valid SVG path data.
import { expect, test } from "vitest";
import {
  boltPath,
  boltPoints,
  pathThrough,
  seeded,
  speedStreaks,
  sunRayPath,
  waveBody,
  waveCrest,
} from "../../src/ai/ui/powerShapes";
import type { Box, Point } from "../../src/ai/ui/powerShapes";

const SCREEN: Box = { x: 0, y: 0, width: 100, height: 100 };
const OFFSET: Box = { x: -20, y: 30, width: 60, height: 15 };
const SEEDS = [0, 1, 7, 42, 2026, -3, 1.5, 4294967295, 1e12];

/** Checks the string is path data made only of M, L, Q, Z and plain numbers, and returns its points. */
function pointsOf(path: string): Point[] {
  expect(path).toMatch(/^M(?: -?\d+(?:\.\d+)?| [MLQZ])+$/);
  const values = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  expect(values.length % 2).toBe(0);
  const points: Point[] = [];
  for (let i = 0; i < values.length; i += 2) points.push([values[i] ?? NaN, values[i + 1] ?? NaN]);
  for (const [x, y] of points) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  return points;
}

function expectInside(path: string, box: Box): void {
  const points = pointsOf(path);
  expect(points.length).toBeGreaterThan(1);
  for (const [x, y] of points) {
    expect(x).toBeGreaterThanOrEqual(box.x);
    expect(x).toBeLessThanOrEqual(box.x + box.width);
    expect(y).toBeGreaterThanOrEqual(box.y);
    expect(y).toBeLessThanOrEqual(box.y + box.height);
  }
}

test("the seeded stream repeats for a seed and stays in 0..1", () => {
  const a = seeded(11);
  const b = seeded(11);
  for (let i = 0; i < 200; i++) {
    const value = a();
    expect(value).toBe(b());
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  }
  expect(seeded(11)()).not.toBe(seeded(12)());
});

test("a bolt is the same for a seed, different for another, and stays in its box", () => {
  for (const seed of SEEDS) {
    for (const box of [SCREEN, OFFSET]) {
      const from: Point = [box.x + box.width * 0.3, box.y];
      const to: Point = [box.x + box.width * 0.6, box.y + box.height];
      const path = boltPath(from, to, seed, box, 9);
      expect(path).toBe(boltPath(from, to, seed, box, 9));
      expectInside(path, box);
    }
  }
  expect(boltPath([30, 0], [60, 100], 1, SCREEN)).not.toBe(boltPath([30, 0], [60, 100], 2, SCREEN));
});

test("a bolt starts and ends where it is told and is jagged in between", () => {
  const points = boltPoints([30, 0], [60, 100], 5, SCREEN, 9);
  expect(points).toHaveLength(10);
  expect(points[0]).toEqual([30, 0]);
  expect(points[9]).toEqual([60, 100]);
  const offLine = points.filter(([x, y]) => Math.abs(x - (30 + y * 0.3)) > 0.5);
  expect(offLine.length).toBeGreaterThan(2);
});

test("a bolt aimed outside its box is pulled back in", () => {
  expectInside(boltPath([-50, -50], [400, 900], 3, SCREEN, 12), SCREEN);
});

test("the wave crest and body repeat for a seed and stay in their box", () => {
  for (const seed of SEEDS) {
    for (const box of [SCREEN, OFFSET]) {
      const crest = waveCrest(box, seed, 5);
      const body = waveBody(box, seed, 5);
      expect(crest).toBe(waveCrest(box, seed, 5));
      expect(body).toBe(waveBody(box, seed, 5));
      expect(body.startsWith(crest)).toBe(true);
      expect(body.endsWith("Z")).toBe(true);
      expectInside(crest, box);
      expectInside(body, box);
    }
  }
  expect(waveCrest(SCREEN, 1)).not.toBe(waveCrest(SCREEN, 2));
});

test("the wave crest runs from the top of its box to the bottom", () => {
  const points = pointsOf(waveCrest(SCREEN, 9, 4));
  expect(points).toHaveLength(9);
  expect(points[0]?.[1]).toBe(0);
  expect(points[8]?.[1]).toBe(100);
});

test("sun rays repeat for a seed and never reach past the outer radius", () => {
  for (const seed of SEEDS) {
    const path = sunRayPath([0, 0], 4, 50, 18, seed);
    expect(path).toBe(sunRayPath([0, 0], 4, 50, 18, seed));
    expectInside(path, { x: -50, y: -50, width: 100, height: 100 });
    for (const [x, y] of pointsOf(path)) expect(Math.hypot(x, y)).toBeLessThanOrEqual(50.01);
    expect(path.split("Z").length - 1).toBe(18);
  }
  expectInside(sunRayPath([40, 60], 2, 10, 7, 3), { x: 30, y: 50, width: 20, height: 20 });
  expect(sunRayPath([0, 0], 4, 50, 18, 1)).not.toBe(sunRayPath([0, 0], 4, 50, 18, 2));
});

test("speed streaks repeat for a seed and stay on the screen", () => {
  for (const seed of SEEDS) {
    const streaks = speedStreaks(16, seed);
    expect(streaks).toEqual(speedStreaks(16, seed));
    expect(streaks).toHaveLength(16);
    for (const streak of streaks) {
      expect(streak.y).toBeGreaterThanOrEqual(4);
      expect(streak.y).toBeLessThanOrEqual(96);
      expect(streak.length).toBeGreaterThanOrEqual(18);
      expect(streak.length).toBeLessThanOrEqual(55);
      expect(streak.delay).toBeGreaterThanOrEqual(0);
      expect(streak.delay).toBeLessThanOrEqual(650);
      expect(streak.weight).toBeGreaterThanOrEqual(1);
      expect(streak.weight).toBeLessThanOrEqual(4);
    }
  }
});

test("bad numbers never throw and never leak into a path", () => {
  const flat: Box = { x: 0, y: 0, width: 0, height: 0 };
  const broken: Box = { x: NaN, y: Infinity, width: -5, height: NaN };
  for (const box of [flat, broken]) {
    pointsOf(boltPath([NaN, 0], [Infinity, 100], NaN, box, NaN));
    pointsOf(waveBody(box, Infinity, 0));
  }
  pointsOf(sunRayPath([NaN, 0], -1, NaN, 0, NaN));
  pointsOf(sunRayPath([0, 0], 80, 50, 1000, 1));
  expect(pathThrough([])).toBe("M 0 0");
  expect(speedStreaks(0, 1)).toEqual([]);
  expect(speedStreaks(NaN, NaN)).toEqual([]);
  expect(speedStreaks(1000, 1)).toHaveLength(60);
});
