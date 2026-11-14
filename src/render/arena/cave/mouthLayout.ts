// Where everything in the cave mouth sits. Pure and seeded so the setting is identical every run and can be tested
// without a browser. The camera is behind the hero (z about +5) looking toward the giant (z=-4) and out of the mouth.

export type Vec3 = readonly [number, number, number];

/** Light: the sun is low, orange, and sits a little left of the giant as seen from the camera. */
export const SUN = {
  /** Unit vector from the scene toward the sun. */
  dir: [-0.29, 0.342, -0.894] as Vec3,
  /** Rotation that parks the HDRI's own sun (12 degrees up) in the same direction. */
  skyYaw: 2.449,
  /** Where the painted sun sits, lower than the light so the camera sees it through the mouth (the light's own
   *  direction is higher so its shafts reach the floor). The sea's glitter path points at this one. */
  visual: [-0.3, 0.2, -0.93] as Vec3,
} as const;

export const MOUTH = {
  frontZ: 10,
  /** The rim of the opening. Beyond it the floor runs on to a short ledge, then the sea. */
  lipZ: -15,
  ledgeZ: -17.5,
  seaY: -1.5,
  /** Roof and wall radii (half width, height) in the main hall and at the lip. */
  hall: { rx: 12.5, ry: 9.5 },
  lip: { rx: 11.5, ry: 8.6 },
} as const;

/** The fight happens here: hero at z=+1.2, giant at z=-4 lunging forward. Nothing solid goes inside. */
export const FIGHT_ZONE = { minX: -4.6, maxX: 4.6, minZ: -8, maxZ: 4.6 } as const;
/** The box the camera sweeps through, with a margin: no prop may stand here either. */
export const CAMERA_ZONE = { minX: -3.6, maxX: 6.8, minZ: 2.5, maxZ: 9 } as const;

export const FIRE = { x: -6.3, z: -2.4 } as const;

export interface Piece {
  readonly kind: "boulder" | "jar" | "post" | "sheep" | "stalactite";
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly yaw: number;
  /** Radius of the floor footprint, used to keep it out of the fight. */
  readonly footprint: number;
}

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

function lattice(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1. */
export function noise2(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy), b = lattice(ix + 1, iy), c = lattice(ix, iy + 1), d = lattice(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Half width and height of the cave's cross-section at depth z: a big hall that pinches toward the mouth. */
export function hallRadii(z: number): { rx: number; ry: number } {
  const t = smooth(-6, MOUTH.lipZ, z);
  return {
    rx: MOUTH.hall.rx + (MOUTH.lip.rx - MOUTH.hall.rx) * t,
    ry: MOUTH.hall.ry + (MOUTH.lip.ry - MOUTH.hall.ry) * t,
  };
}

/** How far in from the ideal ellipse the rock wall sits at this angle and depth, below 1. Only ever pulls inward. */
export function wallInset(theta: number, z: number): number {
  const lipBoost = 1 + smooth(-8, MOUTH.lipZ, z) * 0.9;
  return 1 - (0.1 + noise2(theta * 3.1 + 7, z * 0.35) * 0.12) * lipBoost * 0.7;
}

/** Height of the roof above the floor at this x and z. */
export function roofHeight(x: number, z: number): number {
  const { rx, ry } = hallRadii(z);
  const c = Math.max(-1, Math.min(1, x / rx));
  return ry * Math.sqrt(1 - c * c) * wallInset(Math.acos(c), z);
}

/** Distance from the fire pit. */
export function nearFire(x: number, z: number): number {
  return Math.hypot(x - FIRE.x, z - FIRE.z);
}

interface Zone { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }

/** True when a circle of `radius` at (x, z) overlaps the zone. */
export function touchesZone(zone: Zone, x: number, z: number, radius: number): boolean {
  const dx = Math.max(zone.minX - x, 0, x - zone.maxX);
  const dz = Math.max(zone.minZ - z, 0, z - zone.maxZ);
  return Math.hypot(dx, dz) < radius;
}

/** Boulders: big ones against the walls, a ragged heap at the lip, small stones scattered clear of the fight. */
export function boulders(seed = 5): Piece[] {
  const random = mulberry(seed);
  const out: Piece[] = [];
  const add = (x: number, z: number, size: number, flat: number): void => {
    out.push({
      kind: "boulder",
      position: [x, size * flat * 0.35, z],
      scale: [size, size * flat, size * (0.8 + random() * 0.4)],
      yaw: random() * Math.PI * 2,
      footprint: size * 1.05,
    });
  };
  // Wall boulders down both flanks.
  for (let i = 0; i < 26; i++) {
    const z = 8 - (i / 25) * 22 + random();
    const side = i % 2 === 0 ? -1 : 1;
    const rx = hallRadii(z).rx;
    add(side * (rx - 1.6 - random() * 1.2), z, 1.4 + random() * 1.7, 0.75 + random() * 0.5);
  }
  // The lip: boulders piled at both ends of the opening, leaving the middle clear for the sky and sea.
  for (let i = 0; i < 12; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    add(side * (8.4 + random() * 2.6), MOUTH.lipZ + 0.8 - random() * 1.8, 1.1 + random() * 1.7, 0.8 + random() * 0.6);
  }
  // Scatter: stones between the walls and the fight.
  for (let i = 0; i < 26; i++) {
    const side = random() < 0.5 ? -1 : 1;
    add(side * (5.4 + random() * 2.6), -12 + random() * 17, 0.25 + random() * 0.45, 0.7);
  }
  return out.filter(
    (rock) =>
      !touchesZone(FIGHT_ZONE, rock.position[0], rock.position[2], rock.footprint + 0.3) &&
      !touchesZone(CAMERA_ZONE, rock.position[0], rock.position[2], rock.footprint + 0.5) &&
      nearFire(rock.position[0], rock.position[2]) > rock.footprint + 1.3,
  );
}

/** Highest point the giant's raised club or arms reach over the fight, with a margin. */
const REACH = 7;

/** Stone teeth hanging from the roof, thickest around the mouth where the camera sees them against the sky. */
export function stalactites(seed = 11): Piece[] {
  const random = mulberry(seed);
  const out: Piece[] = [];
  for (let i = 0; i < 38; i++) {
    const z = i < 16 ? MOUTH.lipZ + 0.5 + random() * 4 : -13 + random() * 18;
    const x = (random() * 2 - 1) * hallRadii(z).rx * 0.78;
    const length = 1.2 + random() * 2.6;
    const radius = 0.22 + random() * 0.3;
    out.push({
      kind: "stalactite",
      position: [x, roofHeight(x, z) - length / 2 + 0.5, z],
      scale: [radius, length, radius],
      yaw: random() * 3,
      footprint: radius,
    });
  }
  // Over the fight the lowest tip stays above the giant's raised club.
  return out.filter((tooth) => !touchesZone(FIGHT_ZONE, tooth.position[0], tooth.position[2], 0.1) || tooth.position[1] - tooth.scale[1] / 2 > REACH);
}

/** The shepherd's pen on the right, sheep inside it, big clay jars along the left wall. */
export function homestead(): Piece[] {
  const out: Piece[] = [];
  const pen = { x: 8, z: -6.4 };
  for (let i = 0; i < 9; i++) {
    const angle = -0.3 + (i / 8) * 2.6;
    out.push({
      kind: "post",
      position: [pen.x + Math.cos(angle) * 3.1, 1, pen.z + Math.sin(angle) * 2.3],
      scale: [1, 1, 1],
      yaw: angle,
      footprint: 0.2,
    });
  }
  const flock: readonly Vec3[] = [[-1.1, -0.7, 0.4], [1.1, 0.7, 2.6], [0.1, 1.8, 4.1], [2, -1.2, 5.2]];
  for (const [dx, dz, yaw] of flock) {
    out.push({ kind: "sheep", position: [pen.x + dx, 0, pen.z + dz], scale: [1, 1, 1], yaw, footprint: 1 });
  }
  const jars: readonly Vec3[] = [[-8.1, -1.2, 2.4], [-9.4, -4, 1.8], [-8.4, -6.8, 2.6], [-7.6, -9.4, 2], [9.4, 0.3, 2.2]];
  for (const [x, z, height] of jars) {
    out.push({ kind: "jar", position: [x, 0, z], scale: [height * 0.62, height, height * 0.62], yaw: x * 3, footprint: height * 0.65 });
  }
  return out;
}

/** Every floor-standing piece, for the test that keeps the fight and the camera clear. */
export function floorPieces(): Piece[] {
  return [...boulders(), ...homestead()];
}
