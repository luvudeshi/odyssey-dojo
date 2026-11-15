// Where everything in Odysseus's hall sits. Pure and seeded, so the hall is the same every run and a test can check
// that nothing solid stands in the fight or in the camera's way. The hero is at z=+1.2, Antinous at z=-4 and the
// camera behind the hero looks down the hall toward the hearth and the far wall.

export type Vec3 = readonly [number, number, number];

export const HALL = { minX: -11, maxX: 11, minZ: -17, maxZ: 11, ceiling: 7.4 } as const;

/** The fight happens here: the hero, Antinous when he lunges, and the men standing behind him. */
export const FIGHT_ZONE = { minX: -4.6, maxX: 4.6, minZ: -8, maxZ: 4.6 } as const;
/** The box the camera sweeps through, with a margin. */
export const CAMERA_ZONE = { minX: -3.6, maxX: 6.8, minZ: 2.5, maxZ: 9 } as const;

export const HEARTH = { x: 0.3, z: -11.4, radius: 1.7 } as const;

/** The doorway to the night courtyard in the left wall, centred on this z. */
export const COURT_DOOR = { z: -6.5, halfWidth: 2.1, height: 4.4 } as const;
/** The great door in the back wall. */
export const BACK_DOOR = { x: 0, halfWidth: 1.7, height: 4.6 } as const;

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

export interface Column {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly radius: number;
}

/** Four tall painted columns round the hearth and a row down each side aisle. */
export function columns(): Column[] {
  const out: Column[] = [];
  const around: Vec3[] = [[-4, 0, -9.2], [4.6, 0, -9.2], [-4, 0, -13.6], [4.6, 0, -13.6]];
  for (const [x, , z] of around) out.push({ x, z, height: HALL.ceiling - 0.2, radius: 0.5 });
  for (const z of [-1.5, -6.5, -11.5]) {
    out.push({ x: -8, z, height: HALL.ceiling - 0.2, radius: 0.42 });
    out.push({ x: 8, z, height: HALL.ceiling - 0.2, radius: 0.42 });
  }
  return out;
}

export interface Table {
  readonly x: number;
  readonly z: number;
  /** Turn about the vertical axis; the feast table's long side runs along z at 0. */
  readonly yaw: number;
}

/** Upright feast tables along the left aisle and behind the hearth, kept out of the fight zone and the camera's way. */
export const TABLES: readonly Table[] = [
  { x: -6.4, z: -3.4, yaw: 0 },
  { x: -6.4, z: -8.4, yaw: 0 },
  { x: -2.4, z: -15.6, yaw: Math.PI / 2 },
];

/** Stools drawn up to the left aisle tables and chairs at their far ends. */
export const STOOLS: readonly { readonly x: number; readonly z: number }[] = [-2.4, -4.4, -6.4, -8.4, -10.4].map((z) => ({ x: -5.2, z }));
export const CHAIRS: readonly { readonly x: number; readonly z: number }[] = [-3.4, -8.4].map((z) => ({ x: -7.8, z }));

/** Twelve axes stuck in the floor, helves up and rings aligned, down the right side. */
export function axes(): Vec3[] {
  return Array.from({ length: 12 }, (_, i) => [5.5, 0, -1.2 - i * 0.95] as const);
}

export const BOW = { x: 5.4, z: -13.6 } as const;

export interface Torch {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Which wall or column face it hangs from: its flame sits out from the support by this much. */
  readonly lit: boolean;
}

/** Torches on the aisle columns and one by the courtyard door. The first two carry a real light. */
export const TORCHES: readonly Torch[] = [
  { x: -7.45, y: 3.3, z: -1.5, lit: true },
  { x: 7.45, y: 3.3, z: -6.5, lit: true },
  { x: 7.45, y: 3.3, z: -11.5, lit: false },
  { x: -7.45, y: 3.3, z: -11.5, lit: false },
];

export type Kind = "amphora" | "cup" | "loaf" | "apple" | "bone" | "plate" | "grape";

export interface Item {
  readonly kind: Kind;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
}

/** Cups, food and spilt jars on the floor. All of it is under 0.6 m, so it may lie anywhere, even in the fight zone. */
export function litter(seed = 5): Item[] {
  const random = mulberry(seed);
  const kinds: Kind[] = ["amphora", "cup", "cup", "loaf", "apple", "apple", "bone", "plate", "grape"];
  const out: Item[] = [];
  for (let i = 0; i < 60; i++) {
    const x = -9.5 + random() * 19;
    const z = -15.5 + random() * 20;
    const kind = kinds[Math.floor(random() * kinds.length)] ?? "cup";
    // Keep clear of the hearth, the doorway and the camera's box.
    if (Math.hypot(x - HEARTH.x, z - HEARTH.z) < HEARTH.radius + 0.6) continue;
    if (x > CAMERA_ZONE.minX && x < CAMERA_ZONE.maxX && z > CAMERA_ZONE.minZ) continue;
    out.push({ kind, x, z, yaw: random() * Math.PI * 2, scale: 0.8 + random() * 0.5 });
  }
  return out;
}

/** The tallest and widest things that stand on the floor, as circles, for the clearance test. */
export function solidFootprints(): { x: number; z: number; r: number }[] {
  return [
    ...columns().map((c) => ({ x: c.x, z: c.z, r: c.radius })),
    ...TABLES.map((t) => ({ x: t.x, z: t.z, r: 1.3 })),
    ...STOOLS.map((t) => ({ x: t.x, z: t.z, r: 0.4 })),
    ...CHAIRS.map((t) => ({ x: t.x, z: t.z, r: 0.4 })),
    ...axes().map(([x, , z]) => ({ x, z, r: 0.4 })),
    { x: HEARTH.x, z: HEARTH.z, r: HEARTH.radius },
    { x: BOW.x, z: BOW.z, r: 0.6 },
  ];
}

export function overlapsBox(f: { x: number; z: number; r: number }, box: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
  const cx = Math.min(Math.max(f.x, box.minX), box.maxX);
  const cz = Math.min(Math.max(f.z, box.minZ), box.maxZ);
  return Math.hypot(f.x - cx, f.z - cz) < f.r;
}
