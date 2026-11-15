// Where everything in Scylla's strait sits, in world metres. Pure and seeded so the setting is the same every run and
// can be tested without a browser. The hero stands on the black ship's deck at z=+1.2 facing -z; the camera is behind
// him; the sheer cliff with Scylla's cave stands across the water at z=-11; Charybdis churns far off to the left.

export type Vec3 = readonly [number, number, number];

export const SEA_Y = -0.7;
/** Where the hero's head is, for the necks to aim at. */
export const HERO_HEAD: Vec3 = [0, 1.6, 1.2];

/** The cave mouth: an ellipse cut in the cliff face, halfway up. */
export const MOUTH = { x: 0.6, y: 5.0, z: -11, rx: 3.7, ry: 2.2 } as const;

/** Charybdis: the whirlpool on the far side of the strait. */
export const WHIRL = { x: -17, z: -19 } as const;

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise in 0..1. */
export function noise2(x: number, y: number): number {
  const hash = (i: number, j: number): number => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy) * (1 - ux) + hash(ix + 1, iy) * ux;
  const bottom = hash(ix, iy + 1) * (1 - ux) + hash(ix + 1, iy + 1) * ux;
  return top * (1 - uy) + bottom * uy;
}

export const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 at the centre of the mouth, 1 on its edge, more outside. */
export function mouthRadius(x: number, y: number): number {
  return Math.hypot((x - MOUTH.x) / MOUTH.rx, (y - MOUTH.y) / MOUTH.ry);
}

/**
 * The cliff face's depth at (x, y): big bulges, small facets and rock strata, leaning out toward the ship high up
 * and curving away at the left end. The face is flat at the mouth's edge so the cave meets it without a gap.
 */
export function cliffZ(x: number, y: number): number {
  const big = (noise2(x * 0.22 + 3, y * 0.22) - 0.5) * 3.2 + (noise2(x * 0.5, y * 0.5 + 9) - 0.5) * 1.4;
  const small = (noise2(x * 0.9 + 7, y * 0.9) - 0.5) * 0.8;
  const strata = Math.sin(y * 1.7 + noise2(x * 0.2, 5) * 3) * 0.14;
  const calm = smooth(1.05, 2.4, mouthRadius(x, y)) * (0.25 + 0.75 * smooth(0.5, 6, y));
  const lean = Math.max(0, y - 9.5) * 0.2;
  const away = Math.max(0, -6 - x) ** 1.5 * 0.9;
  return MOUTH.z + (big + small + strata) * calm + lean - away;
}

/** Grid lines for the cliff: fine around the mouth, coarse far from it. */
export function gridLines(from: number, to: number, fineFrom: number, fineTo: number, fine: number, coarse: number): number[] {
  const out: number[] = [];
  let v = from;
  while (v < to) {
    out.push(v);
    v += v >= fineFrom && v < fineTo ? fine : coarse;
  }
  out.push(to);
  return out;
}

/** Half the deck's width at depth z: full along the waist, narrowing to a point at the bow. */
export function deckHalfWidth(z: number): number {
  if (z >= DECK.waistZ) return DECK.halfWidth;
  const t = Math.min(1, (DECK.waistZ - z) / (DECK.waistZ - DECK.bowZ));
  return DECK.halfWidth * (1 - t ** 1.7) + 0.4 * t ** 1.7 * (1 - t);
}

export const DECK = { halfWidth: 3.3, waistZ: -1.5, bowZ: -5.6, sternZ: 7.5 } as const;
