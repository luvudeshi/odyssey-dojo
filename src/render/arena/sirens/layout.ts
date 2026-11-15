// Where everything on the Sirens' islet sits. Pure and seeded, so the meadow is the same every run and can be
// tested without a browser. The camera is behind the hero (z about +5) looking toward the Sirens at z=-4 and out
// over the sea; the meadow is a green islet with rocky headlands left and right and a beach behind the Sirens.
import { mulberry } from "../../monsters/sirens/geo";
import type { Vec3 } from "../../monsters/sirens/geo";

export { mulberry };
export type { Vec3 };

/** The fight happens here: hero at z=+1.2, Sirens at z=-4 lunging forward. Nothing tall may stand inside. */
export const FIGHT_ZONE = { minX: -4.6, maxX: 4.6, minZ: -8, maxZ: 4.6 } as const;
/** The box the camera sweeps through, with a margin. */
export const CAMERA_ZONE = { minX: -3.6, maxX: 6.8, minZ: 2.5, maxZ: 9 } as const;
export const SEA_Y = -0.55;
/** The sea beyond the islet; the black ship rows along it. */
export const SHIP = { z: -62, startX: -34, endX: 40, speed: 0.22 } as const;

export function touchesZone(zone: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number, radius: number): boolean {
  return x > zone.minX - radius && x < zone.maxX + radius && z > zone.minZ - radius && z < zone.maxZ + radius;
}

function lattice(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1. */
export function noise2(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy), b = lattice(ix + 1, iy), c = lattice(ix, iy + 1), d = lattice(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const bump = (x: number, z: number, cx: number, cz: number, height: number, sigma: number): number =>
  height * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * sigma * sigma));

/** Distance from the islet's centre, a little squashed so it is wider than deep. */
export function islandDistance(x: number, z: number): number {
  return Math.hypot(x, (z + 3) * 0.85);
}

/** Ground height. Dead flat where the fight is, gently rolling beyond, rocky headlands left and right, sloping into the sea at the shore. */
export function groundHeight(x: number, z: number): number {
  const d = islandDistance(x, z);
  const rolling = (noise2(x * 0.11 + 3, z * 0.11) - 0.5) * 2.4 * smoothstep(6, 13, d);
  const fine = (noise2(x * 0.5, z * 0.5) - 0.5) * 0.18 * smoothstep(3, 8, d);
  const headlands =
    bump(x, z, -10.5, -9, 3.4, 3.4) + bump(x, z, 11.5, -11, 4.6, 3.8) + bump(x, z, -3.5, -17, 1.7, 3) + bump(x, z, 14, 2, 1.8, 3);
  const shore = smoothstep(16.5, 22, d) * 3.4;
  return rolling + fine + headlands - shore;
}

export interface Rock {
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly yaw: number;
  /** 0 pale stone, 1 warm sandstone, 2 dark basalt. */
  readonly shade: 0 | 1 | 2;
  readonly seed: number;
  readonly footprint: number;
}

/** Boulders: two rocky headlands to the left and right, sea stacks off the far beach, and a few at the meadow's edge. */
export function rocks(seed = 5): Rock[] {
  const random = mulberry(seed);
  const out: Rock[] = [];
  const add = (x: number, z: number, size: number, sink = 0.25): void => {
    const sy = size * (0.7 + random() * 0.7);
    out.push({
      position: [x, groundHeight(x, z) - sink * size, z],
      scale: [size * (0.9 + random() * 0.4), sy, size * (0.9 + random() * 0.4)],
      yaw: random() * Math.PI * 2,
      shade: random() < 0.45 ? 0 : random() < 0.6 ? 1 : 2,
      seed: Math.floor(random() * 1e6),
      footprint: size,
    });
  };
  for (let i = 0; i < 8; i++) add(-10.5 + (random() - 0.5) * 7, -9 + (random() - 0.5) * 6, 1.2 + random() * 2.2);
  for (let i = 0; i < 9; i++) add(11.5 + (random() - 0.5) * 8, -11 + (random() - 0.5) * 7, 1.3 + random() * 2.6);
  for (let i = 0; i < 4; i++) add(-3.5 + (random() - 0.5) * 7, -17 + (random() - 0.5) * 4, 1 + random() * 1.8);
  // Sea stacks off the far beach.
  for (const [x, z, s] of [[-14, -27, 3.2], [-6, -31, 2.2], [9, -29, 3.6], [18, -24, 2.4], [-22, -22, 2.6]] as const) add(x, z, s, -0.1);
  // A few boulders at the meadow's edge, clear of the fight and the camera.
  for (let i = 0; i < 40 && out.length < 32; i++) {
    const x = -14 + random() * 28;
    const z = -16 + random() * 28;
    const size = 0.5 + random() * 0.9;
    if (touchesZone(FIGHT_ZONE, x, z, size + 1.8) || touchesZone(CAMERA_ZONE, x, z, size + 1.5)) continue;
    if (islandDistance(x, z) > 15 || islandDistance(x, z) < 8.5) continue;
    add(x, z, size);
  }
  return out;
}

export interface Bone {
  readonly kind: "skull" | "long" | "ribs" | "spine";
  readonly position: Vec3;
  readonly rotation: Vec3;
  readonly scale: number;
  /** Footprint radius, to keep the big ones out of the fight. */
  readonly footprint: number;
}

/** Heaps of bones at the meadow's edges, and single bones scattered through the grass, small ones even where the fight is. */
export function bones(seed = 12): Bone[] {
  const random = mulberry(seed);
  const out: Bone[] = [];
  const kinds = ["long", "long", "skull", "ribs", "spine", "long", "skull"] as const;
  const toss = (cx: number, cz: number, radius: number, count: number): void => {
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const kind = kinds[Math.floor(random() * kinds.length)] ?? "long";
      const pile = 1 - r / radius;
      const scale = 0.8 + random() * 0.6;
      out.push({
        kind,
        position: [x, groundHeight(x, z) + pile * 0.45 + 0.05, z],
        rotation: [(random() - 0.5) * 1.2, random() * Math.PI * 2, (random() - 0.5) * 1.2],
        scale,
        footprint: kind === "ribs" ? 0.7 * scale : 0.4 * scale,
      });
    }
  };
  // Heaps, outside the fight and clear of the camera.
  for (const [x, z, radius, count] of [
    [-6.4, -2.6, 1.9, 14], [7.6, -3.4, 1.8, 12], [-7, -8.6, 2.4, 16], [3.9, -11.5, 2.2, 14],
    [-2.4, -13.5, 1.8, 10], [9.2, -8.2, 1.5, 9], [-8.4, 3.2, 1.4, 8], [8.6, 4.5, 1.3, 7],
  ] as const) toss(x, z, radius, count);
  // Singles scattered through the grass.
  for (let i = 0; i < 50; i++) {
    const x = -13 + random() * 26;
    const z = -15 + random() * 27;
    if (islandDistance(x, z) > 15) continue;
    const kind = random() < 0.7 ? "long" : random() < 0.5 ? "skull" : "ribs";
    const scale = 0.7 + random() * 0.5;
    const footprint = kind === "ribs" ? 0.7 * scale : 0.4 * scale;
    // Skulls and ribs stand up off the ground, so they keep out of the fight and the camera's way.
    if (kind !== "long" && (touchesZone(FIGHT_ZONE, x, z, footprint) || touchesZone(CAMERA_ZONE, x, z, footprint))) continue;
    out.push({ kind, position: [x, groundHeight(x, z) + 0.05, z], rotation: [(random() - 0.5) * 0.3, random() * Math.PI * 2, (random() - 0.5) * 0.3], scale, footprint });
  }
  return out;
}

export interface Bloom {
  readonly position: Vec3;
  readonly size: number;
  /** Index into FLOWER_COLORS. */
  readonly color: number;
}

export const FLOWER_COLORS: readonly string[] = ["#ff5a5f", "#ffd23f", "#ffffff", "#c77dff", "#ff9f1c", "#5fd0ff", "#ff7bb0"];

/** Bright flowers in drifts through the grass. Low, so they sit anywhere, but never on a bone heap. */
export function flowers(seed = 21): Bloom[] {
  const random = mulberry(seed);
  const out: Bloom[] = [];
  const drifts = Array.from({ length: 16 }, () => ({
    x: -15 + random() * 30, z: -17 + random() * 32, color: Math.floor(random() * FLOWER_COLORS.length), radius: 1.2 + random() * 2.2,
  }));
  for (const drift of drifts) {
    for (let i = 0; i < 15; i++) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * drift.radius;
      const x = drift.x + Math.cos(a) * r, z = drift.z + Math.sin(a) * r;
      const d = islandDistance(x, z);
      if (d > 15.5) continue;
      const y = groundHeight(x, z);
      if (y > 1.4) continue;
      out.push({ position: [x, y, z], size: 0.7 + random() * 0.7, color: random() < 0.8 ? drift.color : Math.floor(random() * FLOWER_COLORS.length) });
    }
  }
  return out;
}

export interface Tuft {
  readonly position: Vec3;
  readonly size: number;
  readonly yaw: number;
}

/** Blades of grass, to break up the flat green. */
export function tufts(seed = 33): Tuft[] {
  const random = mulberry(seed);
  const out: Tuft[] = [];
  for (let i = 0; i < 300; i++) {
    const x = -16 + random() * 32;
    const z = -18 + random() * 34;
    if (islandDistance(x, z) > 16.5) continue;
    const y = groundHeight(x, z);
    if (y > 1.6) continue;
    out.push({ position: [x, y, z], size: 0.6 + random() * 0.8, yaw: random() * Math.PI });
  }
  return out;
}
