// Pure SVG shape builders for the god power effects. The same seed always gives the same shape.

export type Point = readonly [number, number];

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One speed line: `y` and `length` are percentages of the screen, `delay` is milliseconds, `weight` is pixels. */
export interface Streak {
  readonly y: number;
  readonly length: number;
  readonly delay: number;
  readonly weight: number;
}

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
const whole = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.floor(finite(value))));
/** Holds a coordinate to a size that can be scaled and printed without becoming Infinity or an exponent. */
const bounded = (value: number): number => Math.min(1e9, Math.max(-1e9, finite(value)));
const round = (value: number): number => Math.round(bounded(value) * 100) / 100;

/** Rounds to two decimals, then pulls the value inside min..max. */
function fit(value: number, min: number, max: number): number {
  const low = bounded(min);
  return Math.min(Math.max(round(value), low), Math.max(low, bounded(max)));
}

const inBox = (x: number, y: number, box: Box): Point => [
  fit(x, box.x, box.x + box.width),
  fit(y, box.y, box.y + box.height),
];

/** A repeatable stream of numbers from 0 up to, not including, 1. */
export function seeded(seed: number): () => number {
  let state = Math.floor(finite(seed)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Straight lines through the points, as SVG path data. */
export function pathThrough(points: readonly Point[]): string {
  if (points.length === 0) return "M 0 0";
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${String(round(x))} ${String(round(y))}`).join(" ");
}

/** The corners of a jagged bolt from one point to another, kept inside the box. */
export function boltPoints(from: Point, to: Point, seed: number, box: Box, segments = 8): readonly Point[] {
  const next = seeded(seed);
  const steps = whole(segments, 2, 40);
  const dx = finite(to[0]) - finite(from[0]);
  const dy = finite(to[1]) - finite(from[1]);
  const length = Math.hypot(dx, dy) || 1;
  const jag = (length / steps) * 0.9;
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const inner = i > 0 && i < steps;
    const along = (i + (inner ? (next() - 0.5) * 0.5 : 0)) / steps;
    const aside = inner ? (next() - 0.5) * 2 * jag : 0;
    points.push(
      inBox(finite(from[0]) + dx * along - (dy / length) * aside, finite(from[1]) + dy * along + (dx / length) * aside, box),
    );
  }
  return points;
}

/** A jagged lightning bolt between two points. */
export function boltPath(from: Point, to: Point, seed: number, box: Box, segments = 8): string {
  return pathThrough(boltPoints(from, to, seed, box, segments));
}

/** The scalloped leading edge of a wave, running down the right side of the box. */
export function waveCrest(box: Box, seed: number, lobes = 5): string {
  const next = seeded(seed);
  const count = whole(lobes, 1, 24);
  const across = (share: number): number => box.x + box.width * share;
  const down = (share: number): number => box.y + box.height * share;
  const knot = (i: number): Point => inBox(across(0.74 + next() * 0.1), down(i / count), box);
  const parts = [`M ${knot(0).join(" ")}`];
  for (let i = 1; i <= count; i++) {
    const bulge = inBox(across(0.88 + next() * 0.08), down((i - 0.5) / count), box);
    parts.push(`Q ${bulge.join(" ")} ${knot(i).join(" ")}`);
  }
  return parts.join(" ");
}

/** The whole wave: everything in the box behind its crest. */
export function waveBody(box: Box, seed: number, lobes = 5): string {
  const bottomLeft = inBox(box.x, box.y + box.height, box);
  const topLeft = inBox(box.x, box.y, box);
  return `${waveCrest(box, seed, lobes)} L ${bottomLeft.join(" ")} L ${topLeft.join(" ")} Z`;
}

/** Wedges of light fanning out from a centre, none reaching past `outer`. */
export function sunRayPath(centre: Point, inner: number, outer: number, count: number, seed: number): string {
  const next = seeded(seed);
  const rays = whole(count, 1, 64);
  const reach = Math.max(0, finite(outer));
  const core = Math.min(Math.max(0, finite(inner)), reach);
  const box: Box = { x: finite(centre[0]) - reach, y: finite(centre[1]) - reach, width: reach * 2, height: reach * 2 };
  const at = (angle: number, radius: number): string =>
    inBox(finite(centre[0]) + Math.cos(angle) * radius, finite(centre[1]) + Math.sin(angle) * radius, box).join(" ");
  const parts: string[] = [];
  for (let i = 0; i < rays; i++) {
    const angle = ((i + (next() - 0.5) * 0.4) / rays) * Math.PI * 2;
    const spread = (Math.PI / rays) * (0.15 + next() * 0.3);
    const tip = core + (reach - core) * (i % 2 === 0 ? 1 : 0.6 + next() * 0.25);
    parts.push(`M ${at(angle, core)} L ${at(angle - spread, tip)} L ${at(angle + spread, tip)} Z`);
  }
  return parts.join(" ");
}

/** Horizontal speed lines spread down the screen. */
export function speedStreaks(count: number, seed: number): readonly Streak[] {
  const next = seeded(seed);
  const total = whole(count, 0, 60);
  const streaks: Streak[] = [];
  for (let i = 0; i < total; i++) {
    streaks.push({
      y: fit(((i + next()) / total) * 92 + 4, 4, 96),
      length: fit(18 + next() * 37, 18, 55),
      delay: Math.round(next() * 650),
      weight: 1 + Math.floor(next() * 4),
    });
  }
  return streaks;
}
