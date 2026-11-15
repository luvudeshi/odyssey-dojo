// The win wreath (sun disc in two laurel branches) and the loss rosette, ported from the approved mockup. Pure: they fill a layout.
import { LEAD, PAL, type Palette } from "./palette";
import { type Layout, type Pt, type Rng, ellipsePoly, fillPoly, lineStones, pick, strip } from "./stones";
import { rosette } from "./wave";

export function sunDisc(l: Layout, r: Rng, cx: number, cy: number, rad: number): void {
  fillPoly(l, r, ellipsePoly(cx, cy, rad * 0.46, rad * 0.46, 32), { size: rad * 0.14, margin: 0.1, col: PAL.ochre });
  strip(l, ellipsePoly(cx, cy, rad * 0.52, rad * 0.52, 40), 1.6, LEAD, true);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * 2 * Math.PI, long = k % 2 === 0, r0 = rad * 0.6, r1 = rad * (long ? 1 : 0.8);
    const col: Palette = long ? PAL.cream : PAL.terra;
    lineStones(l, r, [[cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)], [cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]], { size: rad * 0.12, rows: 1, gap: 1, col });
  }
}

/** One laurel branch along an arc from `a0` to `a1` degrees. */
export function laurel(l: Layout, r: Rng, cx: number, cy: number, rad: number, a0: number, a1: number, flip: boolean): void {
  const n = 9, arc: Pt[] = [];
  for (let k = 0; k <= 12; k++) { const a = ((a0 + ((a1 - a0) * k) / 12) * Math.PI) / 180; arc.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); }
  strip(l, arc, 1.8, LEAD);
  for (let k = 0; k < n; k++) for (const side of [-1, 1]) {
    const a = ((a0 + ((a1 - a0) * (k + 0.5)) / n) * Math.PI) / 180, x = cx + rad * Math.cos(a), y = cy + rad * Math.sin(a);
    const ang = a + Math.PI / 2 + side * 0.9 * (flip ? -1 : 1);
    l.stones.push({ x: x + Math.cos(ang) * 6, y: y + Math.sin(ang) * 6, a: 7, b: 2.9, rot: ang, color: pick(k % 3 === 0 ? PAL.ochre : PAL.olive, r), alpha: 1, flat: false });
  }
}

/** Win: the sun disc between two laurel branches, filling `size` px square. */
export function wreathLayout(l: Layout, r: Rng, size: number): void {
  const c = size / 2;
  sunDisc(l, r, c, c, size * 0.31);
  laurel(l, r, c, c + 2, size * 0.45, 100, 250, false);
  laurel(l, r, c, c + 2, size * 0.45, 80, -70, true);
}

/** Loss: a rosette in slate and terracotta inside a lead ring: the same family without the laurel. */
export function lossLayout(l: Layout, r: Rng, size: number): void {
  const c = size / 2;
  rosette(l, r, c, c, size * 0.32, { petal: PAL.slate, dot: PAL.terra, core: PAL.terra });
  strip(l, ellipsePoly(c, c, size * 0.47, size * 0.47, 48), 1.6, LEAD, true);
}
