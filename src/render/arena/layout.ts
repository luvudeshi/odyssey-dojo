// Where the cave's rocks, stalactites and torches sit. Pure and seeded, so the cave is the same every run
// and the layout can be tested without a browser.

export type Vec3 = readonly [number, number, number];

export interface Rock {
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly rotation: Vec3;
  /** Which of the rock colours to use: 0, 1 or 2. */
  readonly shade: 0 | 1 | 2;
}

export interface Stalactite {
  readonly position: Vec3;
  readonly length: number;
  readonly radius: number;
}

/** The cave is a dome centred behind the monster. Angles are measured from straight ahead (-z), positive to the right. */
export const CAVE = {
  centerZ: -2,
  radius: 11,
  /** The dome is squashed to this fraction of its radius in height. */
  squash: 0.8,
  /** Nothing solid may sit closer to the centre than this: the fight happens inside it. */
  clearRadius: 7.5,
  /** Angle of the cave mouth. */
  mouthAngle: 0.62,
  mouthHalfWidth: 0.27,
} as const;

/** Angles of the four torches. */
export const TORCH_ANGLES: readonly number[] = [-0.95, -0.3, 1.15, -1.75];
export const TORCH_RADIUS = 8.2;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A point on the cave floor at the given angle and distance from the cave's centre. */
export function onFloor(angle: number, distance: number, y = 0): Vec3 {
  return [Math.sin(angle) * distance, y, CAVE.centerZ - Math.cos(angle) * distance];
}

/** Height of the dome above a floor point this far from the centre. */
export function domeHeight(distance: number): number {
  const inside = CAVE.radius * CAVE.radius - distance * distance;
  return inside <= 0 ? 0 : Math.sqrt(inside) * CAVE.squash;
}

function inMouth(angle: number, margin: number): boolean {
  return Math.abs(angle - CAVE.mouthAngle) < CAVE.mouthHalfWidth + margin;
}

function shadeOf(value: number): 0 | 1 | 2 {
  return value < 0.34 ? 0 : value < 0.67 ? 1 : 2;
}

/** Boulders along the wall, a ragged frame around the mouth, and rubble at the wall's foot. */
export function caveRocks(seed = 7): Rock[] {
  const random = mulberry(seed);
  const spin = (): Vec3 => [random() * Math.PI, random() * Math.PI, random() * Math.PI];
  const rocks: Rock[] = [];

  // Wall boulders: only the arc the camera can see, skipping the mouth.
  const count = 40;
  for (let i = 0; i < count; i++) {
    const angle = -2.2 + (4.4 * (i + random() * 0.6)) / count;
    const low = i % 2 === 0;
    const size = low ? 1.2 + random() * 1.1 : 0.9 + random() * 0.9;
    const distance = CAVE.radius - 1 - random() * 0.9 - (low ? 0 : 0.5);
    const y = low ? size * 0.35 : 2.6 + random() * 2.2;
    const rotation = spin();
    const shade = shadeOf(random());
    if (inMouth(angle, 0.05)) continue;
    rocks.push({
      position: onFloor(angle, distance, y),
      scale: [size, size * (0.8 + random() * 0.7), size],
      rotation,
      shade,
    });
  }

  // The mouth's frame: rocks down both sides and across the top so the opening is ragged, not an oval.
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const side = (t - 0.5) * 2;
    const angle = CAVE.mouthAngle + side * (CAVE.mouthHalfWidth + 0.04);
    const y = 5.4 - Math.abs(side) ** 2.2 * 4.6;
    const size = 0.9 + random() * 0.6;
    rocks.push({
      position: onFloor(angle, CAVE.radius - 1.5, Math.max(y, size * 0.4)),
      scale: [size, size * (0.9 + random() * 0.5), size],
      rotation: spin(),
      shade: shadeOf(random()),
    });
  }

  // Rubble: small stones on the floor between the wall and the fight.
  for (let i = 0; i < 22; i++) {
    const angle = -2.1 + random() * 4.2;
    const distance = CAVE.clearRadius + 0.4 + random() * 1.6;
    const size = 0.18 + random() * 0.32;
    rocks.push({
      position: onFloor(angle, distance, size * 0.3),
      scale: [size, size * 0.7, size],
      rotation: spin(),
      shade: shadeOf(random()),
    });
  }
  return rocks;
}

/** Stone teeth hanging from the roof, kept in front of the camera and above head height. */
export function caveStalactites(seed = 11): Stalactite[] {
  const random = mulberry(seed);
  const out: Stalactite[] = [];
  for (let i = 0; i < 26; i++) {
    const angle = -1.9 + random() * 3.8;
    const distance = 2 + random() * 7;
    const length = 0.7 + random() * 1.9;
    const radius = 0.14 + random() * 0.22;
    const roof = domeHeight(distance);
    if (roof - length < 5.6) continue;
    out.push({ position: onFloor(angle, distance, roof - length / 2 - 0.1), length, radius });
  }
  return out;
}

/** Torch flicker, 0.7..1.15, from a few sines so each torch (by `index`) wavers on its own. */
export function flicker(timeSeconds: number, index: number): number {
  const t = timeSeconds + index * 12.7;
  const wave = Math.sin(t * 11.3) * 0.5 + Math.sin(t * 23.7 + 1.3) * 0.3 + Math.sin(t * 5.1 + index) * 0.2;
  return 0.925 + wave * 0.225;
}
