// Pure, deterministic stone layouts. Nothing here touches the DOM or Math.random: the same seed gives the same stones.
import type { Palette } from "./palette";

export type Rng = () => number;
export type Pt = readonly [number, number];
/** x, y, radii, rotation, colour. `flat` stones get no highlight (the dark ground). */
export interface Stone { x: number; y: number; a: number; b: number; rot: number; color: string; alpha: number; flat: boolean }
export interface Strip { pts: readonly Pt[]; w: number; color: string }
export interface Layout { stones: Stone[]; strips: Strip[] }
export type Colour = Palette | ((x: number, y: number, r: Rng) => string);

export interface StoneOpts { alpha?: number | undefined; k?: number | undefined; round?: boolean | undefined; flat?: boolean | undefined }

export function makeRng(seed: number): Rng {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function pick(colors: Palette, r: Rng): string {
  return colors[Math.floor(r() * colors.length) % colors.length] ?? colors[0];
}

const colourAt = (c: Colour, x: number, y: number, r: Rng): string => (typeof c === "function" ? c(x, y, r) : pick(c, r));

export function newLayout(): Layout { return { stones: [], strips: [] }; }

export function pebble(l: Layout, r: Rng, x: number, y: number, size: number, color: string, o: StoneOpts = {}): void {
  const a = size * (0.5 + r() * 0.1) * (o.k ?? 1);
  const asp = o.round === true ? 0.92 : 0.7 + r() * 0.28;
  l.stones.push({ x, y, a, b: a * asp, rot: r() * Math.PI, color, alpha: o.alpha ?? 1, flat: o.flat === true });
}

export function strip(l: Layout, pts: readonly Pt[], w: number, color: string, closed = false): void {
  const first = pts[0];
  l.strips.push({ pts: closed && first ? [...pts, first] : pts, w, color });
}

export function insidePoly(poly: readonly Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] ?? [0, 0];
    const [xj, yj] = poly[j] ?? [0, 0];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function edgeDist(poly: readonly Pt[], x: number, y: number): number {
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j] ?? [0, 0];
    const [bx, by] = poly[i] ?? [0, 0];
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
    const px = ax + t * dx - x, py = ay + t * dy - y;
    m = Math.min(m, px * px + py * py);
  }
  return Math.sqrt(m);
}

export const ellipsePoly = (cx: number, cy: number, rx: number, ry: number, n = 48): Pt[] =>
  Array.from({ length: n }, (_, k): Pt => [cx + rx * Math.cos((k / n) * 2 * Math.PI), cy + ry * Math.sin((k / n) * 2 * Math.PI)]);

export const rectPoly = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** Rounded rectangle; `r` is one radius or [topLeft, topRight, bottomRight, bottomLeft]. */
export function roundRectPoly(x: number, y: number, w: number, h: number, r: number | readonly [number, number, number, number]): Pt[] {
  const [tl, tr, br, bl] = typeof r === "number" ? [r, r, r, r] : r;
  const p: Pt[] = [];
  const arc = (cx: number, cy: number, rr: number, a0: number): void => {
    for (let k = 0; k <= 8; k++) { const a = a0 + (k / 8) * (Math.PI / 2); p.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  };
  arc(x + tl, y + tl, tl, Math.PI); arc(x + w - tr, y + tr, tr, Math.PI * 1.5); arc(x + w - br, y + h - br, br, 0); arc(x + bl, y + h - bl, bl, Math.PI / 2);
  return p;
}

export interface FillOpts extends StoneOpts { size: number; col: Colour; margin?: number | undefined }

/** Fill a polygon with stones on a jittered hex grid. */
export function fillPoly(l: Layout, r: Rng, poly: readonly Pt[], o: FillOpts): void {
  const size = o.size, step = size * 0.9, margin = (o.margin ?? 0.42) * size;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  let row = 0;
  for (let y = y0 + step / 2; y < y1; y += step * 0.88, row++) {
    for (let x = x0 + (row % 2 ? step / 2 : 0) + step / 2; x < x1; x += step) {
      const jx = x + (r() - 0.5) * size * 0.28, jy = y + (r() - 0.5) * size * 0.28;
      if (!insidePoly(poly, jx, jy) || edgeDist(poly, jx, jy) < margin) continue;
      pebble(l, r, jx, jy, size * (0.92 + r() * 0.2), colourAt(o.col, jx, jy, r), o);
    }
  }
}

export interface LineOpts { size: number; col: Palette | ((i: number, row: number, r: Rng) => string); rows?: number | undefined; gap?: number | undefined; alpha?: number | undefined; round?: boolean | undefined }

/** Walk a polyline and set stones at an even step, `rows` of them across it. */
export function lineStones(l: Layout, r: Rng, pts: readonly Pt[], o: LineOpts): void {
  const size = o.size, step = size * (o.gap ?? 0.95), rows = o.rows ?? 1;
  let carry = 0, idx = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i] ?? [0, 0];
    const [bx, by] = pts[i + 1] ?? [0, 0];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    const ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
    let t = carry;
    for (; t < len; t += step, idx++) {
      for (let row = 0; row < rows; row++) {
        const off = (row - (rows - 1) / 2) * size * 0.9 + (r() - 0.5) * size * 0.2;
        const x = ax + ux * t + nx * off + (r() - 0.5) * size * 0.2, y = ay + uy * t + ny * off + (r() - 0.5) * size * 0.2;
        const c = typeof o.col === "function" ? o.col(idx, row, r) : pick(o.col, r);
        pebble(l, r, x, y, size * (0.9 + r() * 0.2), c, { alpha: o.alpha, round: o.round });
      }
    }
    carry = t - len;
  }
}

export interface LayoutOpts { seed: number; size: number; col: Colour; margin?: number | undefined; flat?: boolean | undefined; alpha?: number | undefined }

/** Stones filling a w by h rectangle. */
export function rectLayout(w: number, h: number, o: LayoutOpts): Layout {
  const l = newLayout();
  fillPoly(l, makeRng(o.seed), rectPoly(0, 0, w, h), o);
  return l;
}

/** Stones filling a rounded rectangle, with an optional lead strip round it. */
export function roundedLayout(w: number, h: number, radius: number | readonly [number, number, number, number], o: LayoutOpts & { lead?: string | undefined; leadWidth?: number | undefined }): Layout {
  const l = newLayout(), poly = roundRectPoly(0, 0, w, h, radius);
  fillPoly(l, makeRng(o.seed), poly, o);
  if (o.lead !== undefined) strip(l, poly, o.leadWidth ?? 2, o.lead, true);
  return l;
}

/** A ring of stones: `rows` stones thick, centred on radius `r`. */
export function ringLayout(cx: number, cy: number, r: number, o: { seed: number; size: number; col: LineOpts["col"]; rows?: number | undefined }): Layout {
  const l = newLayout(), pts = ellipsePoly(cx, cy, r, r, Math.max(16, Math.ceil(r))).concat([[cx + r, cy]]);
  lineStones(l, makeRng(o.seed), pts, { size: o.size, rows: o.rows, col: o.col, round: true });
  return l;
}

/** Stones along any path. */
export function pathLayout(pts: readonly Pt[], o: { seed: number; size: number; col: LineOpts["col"]; rows?: number | undefined; gap?: number | undefined }): Layout {
  const l = newLayout();
  lineStones(l, makeRng(o.seed), pts, o);
  return l;
}

/**
 * Stones for a tile that repeats without a seam: cols x rows on a staggered grid whose spacing divides the tile exactly.
 * Stones near an edge are drawn again on the far side by drawWrapped.
 */
export function tileStones(w: number, h: number, o: { seed: number; size: number; col: Palette }): Stone[] {
  const r = makeRng(o.seed), cols = Math.max(2, Math.round(w / (o.size * 0.9))), rows = Math.max(2, 2 * Math.round(h / (o.size * 0.88) / 2));
  const l = newLayout();
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      const x = ((c + (row % 2 ? 1 : 0.5)) / cols) * w + (r() - 0.5) * o.size * 0.28;
      const y = ((row + 0.5) / rows) * h + (r() - 0.5) * o.size * 0.28;
      pebble(l, r, x, y, o.size * (0.92 + r() * 0.2), pick(o.col, r), { flat: true });
    }
  }
  return l.stones;
}
