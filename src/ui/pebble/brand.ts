// The logo: a sail that is also a body. Arms are the yard, the spine is the mast, tracked joints are terracotta stones,
// the sea is round it. Drawn from our own strokes at runtime; nothing is shipped but this code.
import { LEAD, PAL } from "./palette";
import { type Layout, type Pt, type Rng, ellipsePoly, fillPoly, lineStones, makeRng, newLayout, pebble, pick, strip } from "./stones";
import { circleBase, straightBase, waveBand } from "./wave";

type Stroke = Pt[];
const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 10): Pt[] => {
  const o: Pt[] = [];
  for (let k = 1; k <= n; k++) {
    const t = k / n, u = 1 - t;
    o.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return o;
};
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 18): Stroke =>
  Array.from({ length: n + 1 }, (_, k): Pt => { const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });

/** Letterforms 4 wide by 6 tall. */
export const GLYPH: Record<string, Stroke[]> = {
  O: [arc(2, 3, 2, 3, 0, 360, 30)],
  D: [[[0, 0], [0, 6]], [[0, 0], [1.4, 0], ...arc(1.4, 3, 2.6, 3, -90, 90, 16), [0, 6]]],
  Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  S: [[[3.6, 1.0], ...bez([3.6, 1.0], [3.2, -0.3], [0.4, -0.1], [0.4, 1.5]), ...bez([0.4, 1.5], [0.4, 3.0], [3.6, 3.0], [3.6, 4.5]), ...bez([3.6, 4.5], [3.6, 6.1], [0.8, 6.3], [0.4, 5.0])]],
  E: [[[3.6, 0], [0, 0], [0, 6], [3.6, 6]], [[0, 3], [3, 3]]],
  F: [[[3.6, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  I: [[[1, 0], [1, 6]], [[0, 0], [2, 0]], [[0, 6], [2, 6]]],
  G: [[...arc(2, 3, 2, 3, -40, -360, 30), [4, 3], [2.3, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  J: [[[3.6, 0], [3.6, 4], ...arc(1.8, 4, 1.8, 2, 0, 180, 14)]],
  R: [[[0, 6], [0, 0], [1.7, 0], ...arc(1.7, 1.5, 2.1, 1.5, -90, 90, 14), [0, 3]], [[1.8, 3], [3.8, 6]]],
};
const GW: Record<string, number> = { O: 4, D: 4, Y: 4, S: 4, E: 3.6, F: 3.6, I: 2, G: 4, H: 4, T: 4, R: 3.9 };
const gw = (ch: string): number => GW[ch] ?? 4;

export const wordWidth = (word: string, u: number, track: number): number => Array.from(word).reduce((s, ch) => s + gw(ch) * u, 0) + (word.length - 1) * track;

interface WordOpts { size: number; rows: number; track?: number; col: (i: number, row: number, r: Rng) => string }
function strokeWord(l: Layout, r: Rng, word: string, x: number, y: number, u: number, o: WordOpts): void {
  let cx = x;
  const track = o.track ?? 1.3 * u;
  for (const ch of Array.from(word)) {
    for (const st of GLYPH[ch] ?? []) lineStones(l, r, st.map(([a, b]): Pt => [cx + a * u, y + b * u]), { size: o.size, rows: o.rows, gap: 0.9, col: o.col });
    cx += gw(ch) * u + track;
  }
}

/** The round emblem. `rad` is the outer radius of its stone ring. `plain` swaps the wave ring for a simple one (small sizes). */
export function emblem(l: Layout, r: Rng, cx: number, cy: number, rad: number, plain = false, k = 1): void {
  const s = rad / 150, L = (x: number, y: number): Pt => [cx + x * s, cy + y * s], P = (pts: Pt[]): Pt[] => pts.map(([x, y]) => L(x, y));
  const sz = 5.2 * s * k, lw = (w: number): number => Math.max(1.4, w * s);
  fillPoly(l, r, ellipsePoly(cx, cy, 107 * s, 107 * s, 64), { size: 8.5 * s * k, margin: 0.2, col: (x, y, rr) => (y > cy + (56 + 3.5 * Math.sin((x - cx) / (9 * s))) * s ? pick(PAL.sea, rr) : pick(PAL.dusk, rr)) });
  for (const [yy, col] of [[58, PAL.cream], [74, PAL.slate]] as const) {
    const pts = Array.from({ length: 41 }, (_, i): Pt => { const x = -86 + i * 4.3; return L(x, yy + 3.5 * Math.sin(x / 9)); });
    lineStones(l, r, pts.filter(([x, y]) => Math.hypot(x - cx, y - cy) < 98 * s), { size: 3.4 * s * k, rows: 1, gap: 1.05, col });
  }
  const sail = P([[-66, -44], [66, -44], [63, -14], [64, 6], [40, 2], [20, 8], [0, 3], [-20, 8], [-40, 2], [-64, 6], [-63, -14]]);
  fillPoly(l, r, sail, { size: sz, margin: 0.35, col: (x, y, rr) => (Math.abs(y - (cy - 22 * s)) < 4.2 * s ? pick(PAL.terra, rr) : pick(PAL.cream, rr)) });
  strip(l, sail, lw(2.6), LEAD, true);
  strip(l, P([[0, -58], [0, 26]]), lw(3), LEAD);
  strip(l, P([[-13, 26], [13, 26]]), lw(3), LEAD);
  strip(l, P([[-80, -46], [80, -46]]), lw(3.6), LEAD);
  strip(l, P([[-13, 26], [-17, 52], [-21, 80]]), lw(3), LEAD);
  strip(l, P([[13, 26], [17, 52], [21, 80]]), lw(3), LEAD);
  fillPoly(l, r, ellipsePoly(...L(0, -73), 13 * s, 13 * s, 24), { size: 4.6 * s * k, margin: 0.1, col: PAL.ochre });
  for (const [x, y] of [[-80, -46], [80, -46], [-52, -46], [52, -46], [-24, -46], [24, -46], [-13, 26], [13, 26], [-17, 52], [17, 52], [-21, 80], [21, 80]] as const) {
    const [px, py] = L(x, y);
    pebble(l, r, px, py, 8.2 * s * k, pick(PAL.terra, r), { round: true });
    pebble(l, r, px, py, 3.2 * s * k, PAL.cream[3], { round: true });
  }
  const rr = 128 * s;
  if (plain) {
    strip(l, ellipsePoly(cx, cy, 112 * s, 112 * s, 40), 1.2, LEAD, true); strip(l, ellipsePoly(cx, cy, 146 * s, 146 * s, 48), 1.4, LEAD, true);
    lineStones(l, r, [...ellipsePoly(cx, cy, 129 * s, 129 * s, 40), L(129, 0)], { size: 4.4 * s * k, rows: 2, gap: 1, col: (i, _row, rg) => (i % 3 === 0 ? pick(PAL.terra, rg) : pick(PAL.cream, rg)) });
  } else {
    waveBand(l, r, circleBase(cx, cy, rr), 2 * Math.PI * rr, { size: 6.2 * s * k, closed: true });
  }
}

/** ODYSSEY over DOJO (centred) over a wave band. Returns the width. */
export function wordmark(l: Layout, r: Rng, x: number, y: number, scale = 1): number {
  const u = 16.5 * scale, w = wordWidth("ODYSSEY", u, 1.3 * u);
  strokeWord(l, r, "ODYSSEY", x, y, u, { size: 5.4 * scale, rows: 3, col: (_i, row, rg) => (row === 1 ? pick(PAL.cream, rg) : pick(PAL.ochre, rg)) });
  const u2 = 12 * scale, tr = 3.4 * u2, y2 = y + 132 * scale;
  strokeWord(l, r, "DOJO", x + (w - wordWidth("DOJO", u2, tr)) / 2, y2, u2, { size: 4.2 * scale, rows: 2, track: tr, col: (_i, _row, rg) => (rg() < 0.2 ? pick(PAL.cream, rg) : pick(PAL.terra, rg)) });
  waveBand(l, r, straightBase(x, y2 + 100 * scale), w, { size: 4.6 * scale });
  return w;
}

/** Logo geometry at scale 1: emblem at (170,170) radius 150, wordmark from x = 372. Size of the whole in px at `scale`. */
export function logoSize(scale: number): { w: number; h: number } {
  return { w: Math.ceil((372 + wordWidth("ODYSSEY", 16.5, 1.3 * 16.5) + 12) * scale), h: Math.ceil(344 * scale) };
}

export function logoLayout(scale: number, seed = 7): Layout {
  const l = newLayout(), r = makeRng(seed);
  emblem(l, r, 170 * scale, 170 * scale, 150 * scale);
  wordmark(l, r, 372 * scale, 56 * scale, scale);
  return l;
}

export function emblemLayout(size: number, seed = 7, k = 1): Layout {
  const l = newLayout();
  emblem(l, makeRng(seed), size / 2, size / 2, (size / 2) * 0.97, size < 140, k);
  return l;
}
