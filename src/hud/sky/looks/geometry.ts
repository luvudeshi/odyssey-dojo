// Shapes for the three HUD look drafts (src/ui/lookSwitch.ts): broken shards (A), blade slabs (B) and stones (C). Seeded, so
// every render draws the same glass. Built on the Rift's own pieces in ../rift/geometry.ts. Delete with the looks folder.
import { GLASS, type Facet, type Pt, facetsBetween, poly, rng } from "../rift/geometry";

const jag = (pts: readonly Pt[], seed: number, amt: number): Pt[] => {
  const r = rng(seed), out: Pt[] = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    out.push(a);
    if (b) out.push([(a[0] + b[0]) / 2 + (r() - 0.5) * amt * 2, (a[1] + b[1]) / 2 + (r() - 0.5) * amt * 2]);
  });
  return out;
};
const scaled = (base: readonly Pt[], w: number, h: number): Pt[] => base.map(([x, y]): Pt => [x * w, y * h]);
const fan = (pts: readonly Pt[], c: Pt, shift: number): Facet[] =>
  pts.map((a, i) => ({ d: `${poly([a, pts[(i + 1) % pts.length] ?? a, c])}Z`, fill: GLASS[(i * 5 + shift) % GLASS.length] ?? "#000" }));

export interface Shard { readonly outline: string; readonly facets: Facet[]; readonly vein: string; readonly branch: string; readonly edge: string; readonly timer: string }

/** A: STRIKE is a kite shard with one tall point and a lit vein; DEFEND a broad crystal, flat on top and pointed under. */
export function shardGlass(w: number, h: number, strike: boolean): Shard {
  const base: Pt[] = strike
    ? [[0.6, -0.03], [0.8, 0.16], [1.01, 0.3], [0.93, 0.52], [0.99, 0.8], [0.7, 1.02], [0.32, 0.98], [0.05, 1.01], [-0.01, 0.62], [0.07, 0.34], [0.28, 0.14]]
    : [[0.1, 0.01], [0.5, -0.02], [0.9, 0.01], [1.01, 0.22], [0.99, 0.74], [0.86, 1.01], [0.5, 1.035], [0.14, 1.01], [-0.01, 0.76], [0.01, 0.24]];
  const pts = jag(scaled(base, w, h), strike ? 31 : 33, 4);
  const r = rng(strike ? 9 : 11);
  const path = strike
    ? [[0.04, 0.3], [0.2, 0.4], [0.34, 0.36], [0.5, 0.56], [0.68, 0.6], [0.84, 0.74], [1, 0.8]]
    : [[0.0, 0.64], [0.16, 0.56], [0.3, 0.62], [0.46, 0.44], [0.64, 0.5], [0.8, 0.34], [1, 0.3]];
  const vein = path.map(([x, y]): Pt => [(x ?? 0) * w, (y ?? 0) * h + (r() - 0.5) * 8]);
  const branch = [[0.34, 0.36, 0.42, 0.16], [0.68, 0.6, 0.62, 0.84], [0.2, 0.4, 0.12, 0.62]].map(([x, y, bx, by]) => poly([[(x ?? 0) * w, (y ?? 0) * h], [(((x ?? 0) + (bx ?? 0)) / 2) * w + 6, (((y ?? 0) + (by ?? 0)) / 2) * h], [(bx ?? 0) * w, (by ?? 0) * h]])).join("");
  const t: Pt[] = [];
  for (let i = 0; i <= 24; i++) t.push([w * 0.2 + (w * 0.6 * i) / 24, h - 26 + (i === 0 || i === 24 ? 0 : (r() - 0.5) * 4)]);
  return { outline: `${poly(pts)}Z`, facets: fan(pts, [w * 0.5, h * 0.45], strike ? 1 : 3), vein: poly(vein), branch, edge: poly(pts.slice(0, Math.ceil(pts.length / 2))), timer: poly(t) };
}

export interface Slab { readonly facets: Facet[]; readonly top: string; readonly bottom: string; readonly outline: string }

/** B: the boss bar's slab, measured in px so its jags keep their size as the card grows. */
export function slabGlass(w: number, h: number): Slab {
  const r = rng(17), top: Pt[] = [], bot: Pt[] = [], n = Math.max(8, Math.round(w / 18));
  for (let i = 0; i <= n; i++) {
    const x = (w * (i + (i > 0 && i < n ? (r() - 0.5) * 0.6 : 0))) / n;
    top.push([x, 2 + r() * 7]);
    bot.push([x, h - 9 + r() * 7]);
  }
  return { facets: facetsBetween(top, bot, r, GLASS), top: poly(top), bottom: poly(bot), outline: `${poly(top)}${poly([...bot].reverse()).replace("M", "L")}Z` };
}

/** B, DEFEND: a blunt guard plate at one end of the slab, `side` 1 on the right, -1 on the left. */
export function guardPlate(w: number, h: number, side: 1 | -1): string {
  const x = side === 1 ? w : 0, k = side, t = h * 0.06, b = h * 0.94;
  return `${poly([[x - k * 8, t + 10], [x + k * 6, t], [x + k * 30, t + 8], [x + k * 34, b - 8], [x + k * 28, b], [x - k * 8, b - 10]])}Z`;
}

export interface Stone { readonly outline: string; readonly ring: string; readonly facets: Facet[]; readonly cracks: string }

/** C: STRIKE is a hexagonal stone, DEFEND a round one; `ring` is the fissure the timer burns along, starting at the top. */
export function stoneGlass(w: number, h: number, strike: boolean): Stone {
  const r = rng(strike ? 5 : 6);
  let outline: string, ring: string, pts: Pt[];
  if (strike) {
    const base: Pt[] = [[0.5, 0], [1, 0.25], [1, 0.75], [0.5, 1], [0, 0.75], [0, 0.25]];
    pts = jag(scaled(base, w, h), 41, 3);
    outline = `${poly(pts)}Z`;
    const inner = scaled(base, w, h).map(([x, y]): Pt => [w / 2 + (x - w / 2) * (1 - 36 / w), h / 2 + (y - h / 2) * (1 - 36 / h)]);
    ring = `${poly(inner)}Z`;
  } else {
    const rx = w / 2, ry = h / 2, ix = rx - 18, iy = ry - 18;
    pts = Array.from({ length: 28 }, (_, i): Pt => [rx + rx * Math.sin((i / 28) * 2 * Math.PI) + (r() - 0.5) * 3, ry - ry * Math.cos((i / 28) * 2 * Math.PI) + (r() - 0.5) * 3]);
    outline = `${poly(pts)}Z`;
    ring = `M${String(rx)},${String(ry - iy)} A${String(ix)},${String(iy)} 0 1 1 ${String(rx)},${String(ry + iy)} A${String(ix)},${String(iy)} 0 1 1 ${String(rx)},${String(ry - iy)}`;
  }
  let cr = "";
  for (let i = 0; i < 7; i++) {
    const p = pts[Math.floor(r() * pts.length)] ?? [0, 0];
    let x = p[0], y = p[1];
    const line: Pt[] = [[x, y]];
    for (let k = 0; k < 3; k++) { x += (w / 2 - x) * 0.1 + (r() - 0.5) * 12; y += (h / 2 - y) * 0.1 + (r() - 0.5) * 12; line.push([x, y]); }
    cr += poly(line);
  }
  return { outline, ring, facets: fan(pts, [w * 0.5, h * 0.5], strike ? 2 : 0), cracks: cr };
}

/** Glyphs in a 100 x 100 box: a spearhead and a shield (A), and two carved runes, Tiwaz and Algiz (C). */
export const GLYPHS = {
  spear: "M50 4 L66 42 L58 46 L58 96 L42 96 L42 46 L34 42 Z",
  shield: "M50 6 L88 18 V52 C88 76 70 90 50 98 C30 90 12 76 12 52 V18 Z M50 18 V86 M24 44 H76",
  tiwaz: "M50 94 V8 M22 38 L50 8 L78 38",
  algiz: "M50 94 V8 M50 56 L18 22 M50 56 L82 22",
} as const;
