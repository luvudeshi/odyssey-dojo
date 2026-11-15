// The wave scroll (a looping line of stones with a stone eye in each loop) and the rosette.
import { LEAD, PAL, type Palette } from "./palette";
import { type Layout, type Pt, type Rng, lineStones, pebble, pick, strip } from "./stones";

export type Base = (u: number, v: number) => Pt;

/** Prolate trochoid: loops along a line. Returns (u, v) points. */
export function trochoid(len: number, r: number, d: number, per = 24): Pt[] {
  const th = len / r, n = Math.max(1, Math.ceil((th * per) / (2 * Math.PI))), out: Pt[] = [];
  for (let k = 0; k <= n; k++) { const t = (k / n) * th; out.push([r * t - d * Math.sin(t), -d * Math.cos(t)]); }
  return out;
}

export const straightBase = (x0: number, y0: number): Base => (u, v) => [x0 + u, y0 + v];
export const circleBase = (cx: number, cy: number, r0: number, a0 = -Math.PI / 2): Base => (u, v) => {
  const a = a0 + u / r0, rr = r0 + v;
  return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
};

export interface WaveOpts { size: number; r?: number | undefined; col?: Palette | undefined; eye?: Palette | undefined; lead?: boolean | undefined; closed?: boolean | undefined }

/** Half the band's height for a given stone size and loop radius: lets callers size the canvas. */
export function waveHalfHeight(len: number, size: number, r = size * 1.5): number {
  const loops = Math.max(1, Math.round(len / (r * 2 * Math.PI)));
  return (len / (loops * 2 * Math.PI)) * 1.65 + size * 0.9;
}

/** The wave-scroll border: one row of stones along the trochoid, a stone eye in each loop, lead strips either side. */
export function waveBand(l: Layout, r: Rng, base: Base, len: number, o: WaveOpts): void {
  const size = o.size, rad = o.r ?? size * 1.5;
  const loops = Math.max(1, Math.round(len / (rad * 2 * Math.PI))), rr = len / (loops * 2 * Math.PI), d = rr * 1.65;
  const tr = trochoid(len, rr, d, 40).map(([u, v]) => base(u, v));
  if (o.lead !== false) {
    const lo: Pt[] = [], hi: Pt[] = [], m = 24;
    for (let k = 0; k <= m; k++) { lo.push(base((k / m) * len, -d - size * 0.9)); hi.push(base((k / m) * len, d + size * 0.9)); }
    strip(l, lo, 2, LEAD, o.closed === true); strip(l, hi, 2, LEAD, o.closed === true);
  }
  lineStones(l, r, tr, { size, col: o.col ?? PAL.cream, rows: 1, gap: 0.95 });
  for (let k = 0; k < loops; k++) {
    const [x, y] = base((k + 0.5) * (len / loops), 0);
    pebble(l, r, x, y, size * 1.05, pick(o.eye ?? PAL.terra, r), { round: true });
  }
}

/** Eight petals round a centre stone. */
export function rosette(l: Layout, r: Rng, cx: number, cy: number, rad: number, o: { n?: number; petal?: Palette; dot?: Palette; core?: Palette } = {}): void {
  const n = o.n ?? 8, size = rad * 0.34;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 2 * Math.PI;
    for (let j = 1; j <= 2; j++) {
      const rr = rad * (0.42 + j * 0.24);
      l.stones.push({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a), a: size * (j === 2 ? 0.62 : 0.5), b: size * 0.36, rot: a, color: pick(o.petal ?? PAL.cream, r), alpha: 1, flat: false });
    }
    pebble(l, r, cx + rad * 1.15 * Math.cos(a + Math.PI / n), cy + rad * 1.15 * Math.sin(a + Math.PI / n), size * 0.55, pick(o.dot ?? PAL.terra, r), { round: true });
  }
  pebble(l, r, cx, cy, size * 1.15, pick(o.core ?? PAL.ochre, r), { round: true });
}
