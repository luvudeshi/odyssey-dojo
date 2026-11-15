// Fixed shapes for the Obsidian Rift fight HUD: glass facets, blades, cracks and the fissure's jagged edge. All of it
// comes from seeded randomness and is computed once at load, so every render draws the same glass and nothing reflows.
export type Pt = readonly [number, number];

export const rng = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};
const f = (v: number): string => String(Math.round(v * 10) / 10);
/** An open polyline through the points, as path data. */
export const poly = (list: readonly Pt[]): string => list.map((p, i) => `${i === 0 ? "M" : "L"}${f(p[0])} ${f(p[1])}`).join("");
const pick = (list: readonly string[], r: () => number): string => list[Math.floor(r() * list.length)] ?? list[0] ?? "#000";

/** Black glass with a cold violet sheen. */
export const GLASS = ["#1a1622", "#0d0b12", "#231d2e", "#09080c", "#16121c", "#2c2538"] as const;

export interface Facet { readonly d: string; readonly fill: string }

/** Cuts the strip between two jagged edges into glass facets: each cell is two triangles of different shades. */
export function facetsBetween(top: readonly Pt[], bot: readonly Pt[], r: () => number, shades: readonly string[]): Facet[] {
  const out: Facet[] = [];
  for (let i = 0; i < top.length - 1; i++) {
    const a = top[i], b = top[i + 1], c = bot[i + 1], d = bot[i];
    if (!a || !b || !c || !d) continue;
    out.push({ d: `${poly([a, b, c])}Z`, fill: pick(shades, r) }, { d: `${poly([a, c, d])}Z`, fill: pick(shades, r) });
  }
  return out;
}

/** Thin hot cracks running out of a fissure edge at y0, upward (dir -1) or downward (1), between x0 and x1. */
export function cracks(seed: number, n: number, x0: number, x1: number, y0: number, dir: number, len: number): string {
  const r = rng(seed);
  let d = "";
  for (let i = 0; i < n; i++) {
    let x = x0 + r() * (x1 - x0), y = y0;
    const step = (len * (0.4 + r() * 0.8)) / 4, line: Pt[] = [[x, y]];
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 14; y += dir * step; line.push([x, y]); }
    d += poly(line);
  }
  return d;
}

// ---- the boss bar: a slab drawn in a 1000 x 56 box that stretches with the bar ----
export const SLAB = (() => {
  const r = rng(7), top: Pt[] = [], bot: Pt[] = [], n = 28;
  for (let i = 0; i <= n; i++) {
    const x = (1000 * (i + (i > 0 && i < n ? (r() - 0.5) * 0.6 : 0))) / n;
    top.push([x, 2 + r() * 7]);
    bot.push([x, 47 + r() * 7]);
  }
  return {
    facets: facetsBetween(top, bot, r, GLASS),
    top: poly(top),
    bottom: poly(bot),
    outline: `${poly(top)}${poly([...bot].reverse()).replace("M", "L")}Z`,
    cracksUp: cracks(3, 9, 20, 980, 19, -1, 17),
    cracksDown: cracks(4, 8, 20, 980, 37, 1, 15),
  };
})();

/** The fissure's jagged outline in a 1000 x 1000 box; drawn at scale(0.001) inside an objectBoundingBox clip. */
export const FISSURE = (() => {
  const r = rng(21), n = 90, top: Pt[] = [], bot: Pt[] = [];
  for (let i = 0; i <= n; i++) { top.push([(1000 * i) / n, 20 + r() * 240]); bot.push([(1000 * i) / n, 760 + r() * 220]); }
  return `${poly(top)}${poly([...bot].reverse()).replace("M", "L")}Z`;
})();

export interface Blade { readonly body: string; readonly light: string; readonly edge: string; readonly vein: string }

/** A long glass blade with its base at (x, y), pointing at `ang` degrees (0 = right), with a lava vein down its middle. */
export function blade(x: number, y: number, ang: number, len: number, wid: number, seed: number): Blade {
  const r = rng(seed), c = Math.cos((ang * Math.PI) / 180), s = Math.sin((ang * Math.PI) / 180);
  const q = (a: number, b: number): Pt => [x + a * c - b * s, y + a * s + b * c];
  const j = (): number => (r() - 0.5) * wid * 0.3;
  const u1 = -wid * 0.8 + j(), u2 = -wid * 0.45 + j();
  const top = [q(0, -wid), q(len * 0.35, u1), q(len * 0.7, u2), q(len, 0)];
  const bottom = [q(len * 0.7, wid * 0.45 + j()), q(len * 0.35, wid * 0.8 + j()), q(0, wid)];
  return {
    body: `${poly([...top, ...bottom])}Z`,
    light: `${poly([...top, q(0, 0)])}Z`,
    edge: poly(top),
    vein: poly([q(2, 0), q(len * 0.3, 2), q(len * 0.55, -1.5), q(len * 0.8, 1)]),
  };
}

/** The ends of the boss bar, in a 130 x 60 box: one long blade and two short ones fanning out. */
export const END_BLADES: readonly Blade[] = [blade(4, 18, -24, 66, 6, 12), blade(4, 42, 24, 66, 6, 13), blade(0, 30, 0, 124, 13, 11)];

// ---- the player's crescent, in its 240 x 60 box ----
export const CRES = { cx: 120, cy: 20, rx: 100, ry: 26 } as const;
/** A point on the crescent: u runs from the left tip (0) round the front to the right tip (1), v is px across (negative = up). */
export function cresAt(u: number, v: number): Pt {
  const a = Math.PI * u, dx = CRES.rx * Math.sin(a), dy = CRES.ry * Math.cos(a), len = Math.hypot(dx, dy) || 1;
  return [CRES.cx - CRES.rx * Math.cos(a) - (dy / len) * v, CRES.cy + CRES.ry * Math.sin(a) + (dx / len) * v];
}
const cresBand = (u0: number, u1: number, v0: (u: number) => number, v1: (u: number) => number, n: number): { top: Pt[]; bot: Pt[] } => {
  const top: Pt[] = [], bot: Pt[] = [];
  for (let i = 0; i <= n; i++) { const u = u0 + ((u1 - u0) * i) / n; top.push(cresAt(u, v0(u))); bot.push(cresAt(u, v1(u))); }
  return { top, bot };
};
export const CRESCENT = (() => {
  const r = rng(17), outer = (u: number): number => Math.max(0, Math.sin((Math.PI * (u + 0.1)) / 1.2));
  const glass = cresBand(-0.1, 1.1, (u) => (-16 + (r() - 0.5) * 6) * outer(u), (u) => (15 + (r() - 0.5) * 6) * outer(u), 22);
  const taper = (u: number): number => 0.45 + 0.55 * Math.sin(Math.PI * u);
  const fis = cresBand(0, 1, (u) => (-6.5 + (r() - 0.5) * 4) * taper(u), (u) => (6.5 + (r() - 0.5) * 4) * taper(u), 80);
  const crackSet = (seed: number, dir: number): string => {
    const q = rng(seed);
    let d = "";
    for (let i = 0; i < 12; i++) {
      const u = 0.03 + q() * 0.94, line: Pt[] = [];
      for (let k = 0; k <= 3; k++) line.push(cresAt(u + (q() - 0.5) * 0.02 * k, dir * (6 * taper(u) + k * (2 + q() * 2))));
      d += poly(line);
    }
    return d;
  };
  return {
    facets: facetsBetween(glass.top, glass.bot, r, GLASS),
    edge: poly(glass.top),
    fissure: `${poly(fis.top)}${poly([...fis.bot].reverse()).replace("M", "L")}Z`,
    cracks: crackSet(31, -1) + crackSet(32, 1),
  };
})();

// ---- the power disc, in a 100 x 100 box centred on 50, 50 ----
const at = (r: number, deg: number): Pt => [50 + r * Math.sin((deg * Math.PI) / 180), 50 - r * Math.cos((deg * Math.PI) / 180)];
export const DISC = (() => {
  const r = rng(8), N = 5, rim: Pt[] = [], spokes: Pt[][] = [];
  for (let i = 0; i < 20; i++) rim.push(at(42 + (r() - 0.5) * 5 + (i % 2 === 1 ? -2 : 2), i * 18));
  for (let i = 0; i < N; i++) { const s: Pt[] = [at(16, i * 72)]; for (let k = 1; k <= 3; k++) s.push(at(16 + k * 8.5, i * 72 + (r() - 0.5) * 12)); spokes.push(s); }
  const shards = Array.from({ length: N }, (_, i) => {
    const a = spokes[i] ?? [], b = spokes[(i + 1) % N] ?? [], arc = rim.slice(i * 4, i * 4 + 5);
    if (i === N - 1 && rim[0]) arc.push(rim[0]);
    return `${poly([...a, ...arc, ...[...b].reverse()])}Z`;
  });
  const spikes = Array.from({ length: 12 }, (_, i) => blade(...at(41, i * 30 + 15), i * 30 + 15 - 90, 9 + (i % 2) * 4, 2.6, 50 + i));
  const hex = `${poly([0, 60, 120, 180, 240, 300].map((deg) => at(20, deg)))}Z`;
  return { rim: `${poly(rim)}Z`, spokes: spokes.map(poly), shards, spikes, hex };
})();

// ---- the prompt card: a glass slab measured in px, so its facets keep their size as the card grows ----
export interface CardGlass { readonly outline: string; readonly inner: string; readonly facets: Facet[]; readonly topEdge: string; readonly cracks: string; readonly glints: readonly Pt[] }
const BLUE = ["#22324a", "#121a26", "#3a5272", "#0c121a", "#1c2a3e", "#4a6a92"] as const;
const EMBER = ["#3a1a16", "#1a0c0a", "#52261a", "#120806", "#2c1410", "#6a2e18"] as const;

/** DEFEND is a broad flat-topped slab with chipped corners; STRIKE and FINISH rise to a spear point. */
export function cardGlass(w: number, h: number, pointed: boolean): CardGlass {
  const cx = w / 2;
  const out: Pt[] = pointed
    ? [[cx, -16], [w - 8, 92], [w + 4, h * 0.5], [w - 4, h - 30], [w - 30, h + 6], [cx, h - 6], [26, h + 4], [-4, h - 40], [4, h * 0.5], [8, 92]]
    : [[22, 1], [w * 0.4, -6], [w * 0.62, 2], [w - 18, -4], [w + 4, 30], [w - 2, h * 0.5], [w + 4, h - 40], [w - 26, h + 4], [w * 0.5, h - 4], [20, h + 2], [-4, h - 34], [2, h * 0.45], [-6, 34]];
  const kx = 1 - 30 / w, ky = 1 - 32 / h;
  const inner: Pt[] = out.map((p) => [cx + (p[0] - cx) * kx, h / 2 + (p[1] - h / 2) * ky]);
  const shades = pointed ? EMBER : BLUE, facets: Facet[] = [];
  out.forEach((a, i) => {
    const b = out[(i + 1) % out.length], c = inner[(i + 1) % inner.length], d = inner[i];
    if (!b || !c || !d) return;
    facets.push({ d: `${poly([a, b, c, d])}Z`, fill: shades[(i * 3) % 6] ?? "#000" }, { d: `${poly([a, b, c])}Z`, fill: shades[(i * 5 + 2) % 6] ?? "#000" });
  });
  const r = rng(5);
  let cr = "";
  if (pointed) {
    for (let i = 0; i < 9; i++) {
      const p = out[Math.floor(r() * out.length)] ?? out[0] ?? [0, 0];
      let x = p[0], y = p[1];
      const line: Pt[] = [[x, y]];
      for (let k = 0; k < 4; k++) { x += (cx - x) * 0.07 + (r() - 0.5) * 10; y += (r() - 0.5) * 16; line.push([x, y]); }
      cr += poly(line);
    }
  }
  return { outline: `${poly(out)}Z`, inner: `${poly(inner)}Z`, facets, topEdge: poly(inner.slice(0, 4)), cracks: cr, glints: pointed ? [] : [[22, 6], [w - 18, -2], [w + 2, h * 0.5], [4, h - 36]] };
}

/** A jagged line from (x0, y) to (x1, y), for the card timers. */
export function jagLine(x0: number, x1: number, y: number, seed: number): string {
  const r = rng(seed), line: Pt[] = [];
  for (let i = 0; i <= 24; i++) line.push([x0 + ((x1 - x0) * i) / 24, y + (i === 0 || i === 24 ? 0 : (r() - 0.5) * 3)]);
  return poly(line);
}
