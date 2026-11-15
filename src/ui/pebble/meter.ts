// Pure maths and layouts for the stone meters: health bars, the power meter, timers, rings. A meter is a fixed set of
// stones; the value only decides which of them are lit, so a change touches only the stones that flip.
import { PAL } from "./palette";
import { type Pt, type Rng, type Stone, makeRng, pebble, pick, roundRectPoly } from "./stones";

export interface MeterStone { stone: Stone; lit: string; dim: string; k: number }
export interface Meter { w: number; h: number; stones: MeterStone[]; trough: Pt[] | null; d: number; dir: 1 | -1; pad: number; inner: number }
export type LitColour = (k: number, r: Rng) => string;

/** Lit when its position along the fill (0 first, 1 last) is within the value. */
export const isLit = (k: number, value: number): boolean => k <= value + 1e-9;

export function litCount(m: Meter, value: number): number {
  let n = 0;
  for (const s of m.stones) if (isLit(s.k, value)) n++;
  return n;
}

/** Indices of the stones that flip between two values. */
export function changedStones(m: Meter, prev: number, next: number): number[] {
  const out: number[] = [];
  m.stones.forEach((s, i) => { if (isLit(s.k, prev) !== isLit(s.k, next)) out.push(i); });
  return out;
}

const PAD = 7;

export interface BarOpts { width: number; d: number; rows?: number; dir?: 1 | -1; seed: number; lit: LitColour; trough?: boolean }

/** Rows of stones in a lead trough. dir -1 fills from the right. */
export function barMeter(o: BarOpts): Meter {
  const r = makeRng(o.seed), rows = o.rows ?? 2, dir = o.dir ?? 1, d = o.d, trough = o.trough !== false, pad = trough ? PAD : 1;
  const cols = Math.max(2, Math.floor((o.width - pad * 2) / d)), inner = cols * d;
  const h = d * (1 + (rows - 1) * 0.9) + pad * 2, w = inner + pad * 2;
  const stones: MeterStone[] = [];
  const holder = { stones: [] as Stone[], strips: [] };
  for (let row = 0; row < rows; row++) {
    const n = row % 2 ? cols - 1 : cols;
    for (let c = 0; c < n; c++) {
      const t = (c + (row % 2 ? 1 : 0.5)) / cols, k = dir > 0 ? t : 1 - t;
      pebble(holder, r, pad + t * inner, pad + d / 2 + row * d * 0.9 + (r() - 0.5) * 1.2, d * (0.94 + r() * 0.1), "#000");
      const stone = holder.stones.pop();
      if (stone) stones.push({ stone, lit: o.lit(k, r), dim: pick(PAL.dim, r), k });
    }
  }
  return { w, h, stones, trough: trough ? roundRectPoly(1.5, 1.5, w - 3, h - 3, Math.min(9, h / 2 - 1)) : null, d, dir, pad, inner };
}

/** One row of n round stones, evenly spaced. */
export function dotsMeter(o: { n: number; d: number; seed: number; lit: LitColour; trough?: boolean }): Meter {
  const m = barMeter({ width: o.n * o.d + (o.trough === false ? 2 : PAD * 2) + 0.01, d: o.d, rows: 1, seed: o.seed, lit: o.lit, trough: o.trough !== false });
  for (const s of m.stones) { s.stone.b = s.stone.a * 0.92; }
  return m;
}

/** n stones round a circle, lit clockwise from the top. */
export function ringMeter(o: { n: number; radius: number; d: number; seed: number; lit: LitColour }): Meter {
  const r = makeRng(o.seed), size = o.radius * 2 + o.d + 2, c = size / 2, stones: MeterStone[] = [];
  const holder = { stones: [] as Stone[], strips: [] };
  for (let i = 0; i < o.n; i++) {
    const a = -Math.PI / 2 + (i / o.n) * 2 * Math.PI, k = (i + 0.5) / o.n;
    pebble(holder, r, c + o.radius * Math.cos(a), c + o.radius * Math.sin(a), o.d, "#000", { round: true });
    const stone = holder.stones.pop();
    if (stone) stones.push({ stone, lit: o.lit(k, r), dim: pick(PAL.dim, r), k });
  }
  return { w: size, h: size, stones, trough: null, d: o.d, dir: 1, pad: 1, inner: size };
}

/** x of the fill's leading edge, for loose pebbles. */
export const edgeX = (m: Meter, value: number): number => m.pad + (m.dir > 0 ? value : 1 - value) * m.inner;

export interface Loose { x: number; y0: number; y1: number; size: number; color: string }

/** The pebbles a hit knocks loose: they start at the bar's lower edge and settle below it. Count follows the size of the drop. */
export function loosePebbles(m: Meter, from: number, to: number, seed: number, color: LitColour): Loose[] {
  if (from - to < 0.02) return [];
  const r = makeRng(seed), n = Math.min(5, Math.max(2, Math.ceil((from - to) * 20))), out: Loose[] = [];
  for (let i = 0; i < n; i++) {
    const x = edgeX(m, to) + (r() - 0.3) * m.dir * m.d * (1 + i * 0.7);
    out.push({ x, y0: m.h - m.pad - m.d * 0.4, y1: m.h + 6 + i * 7 + r() * 5, size: m.d * (0.8 + r() * 0.2), color: color(to, r) });
  }
  return out;
}

/** Position and opacity of one loose pebble `p` (0 to 1) through its fall: it drops, rests, then fades. */
export function looseAt(l: Loose, p: number): { y: number; alpha: number } {
  const fall = Math.min(1, p / 0.45);
  return { y: l.y0 + (l.y1 - l.y0) * fall * fall, alpha: p < 0.7 ? 1 : Math.max(0, (1 - p) / 0.3) };
}
