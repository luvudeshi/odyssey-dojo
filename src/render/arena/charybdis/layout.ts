// Where everything in Charybdis's strait sits. Pure and seeded, so the setting is identical every run and can be
// tested without a browser. The camera is behind the hero (z about +5) looking toward the whirlpool at z=-4.
import { CAMERA_ZONE, FIGHT_ZONE, mulberry } from "../cave/mouthLayout";

export type Vec3 = readonly [number, number, number];

/** The whirlpool's centre on the water. The monster stands here and the water's dish is dug here. */
export const WHIRL = { x: 0, z: -4 } as const;

/** Still water level under the raft. The deck's top is y=0, where the hero's feet are. */
export const SEA_Y = -0.26;

/** Unit vector toward the low sun: dim and orange, behind the whirlpool and a little left of it. */
export const SUN_DIR: Vec3 = [-0.46, 0.09, -0.885];

/** The raft of keel and mast: lashed timbers the hero stands on. Deck top is y=0. */
export const RAFT = { x: 0, z: 0.7, halfWidth: 2.3, halfLength: 2.3 } as const;

/** The low rock under the fig tree. Left of the whirlpool, behind it. */
export const ROCK = { x: -9.2, z: -10.5, radius: 3.6, height: 2.4 } as const;

/** Scylla's cliff, far off on the right. */
export const CLIFF = { x: 34, z: -78, width: 30, height: 34 } as const;

export interface Drift {
  readonly kind: "plank" | "barrel" | "oar" | "beam";
  readonly position: Vec3;
  readonly length: number;
  readonly yaw: number;
  /** Half the piece's length: how far it reaches from its centre. Used to keep it out of the fight. */
  readonly footprint: number;
}

export const inBox = (
  zone: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number },
  x: number,
  z: number,
  margin: number,
): boolean => x > zone.minX - margin && x < zone.maxX + margin && z > zone.minZ - margin && z < zone.maxZ + margin;

/** Wreckage floating on the strait. None of it floats between the camera and the hero or inside the fight. */
export function driftwood(seed = 5): Drift[] {
  const random = mulberry(seed);
  const kinds = ["plank", "plank", "barrel", "oar", "beam", "plank"] as const;
  const out: Drift[] = [];
  for (let attempts = 0; out.length < 16 && attempts < 400; attempts++) {
    const x = -22 + random() * 44;
    const z = -30 + random() * 40;
    const kind = kinds[Math.floor(random() * kinds.length)] ?? "plank";
    const length = kind === "barrel" ? 0.9 : kind === "beam" ? 3 + random() * 2 : 1.6 + random() * 1.8;
    const footprint = length / 2;
    const yaw = random() * Math.PI;
    // The raft, the fight, the camera's path and the whirlpool's own dish stay clear.
    if (inBox(FIGHT_ZONE, x, z, footprint + 1.5) || inBox(CAMERA_ZONE, x, z, footprint + 1)) continue;
    if (Math.hypot(x - WHIRL.x, z - WHIRL.z) < 6.5) continue;
    if (Math.abs(x - RAFT.x) < RAFT.halfWidth + footprint + 0.5 && Math.abs(z - RAFT.z) < RAFT.halfLength + footprint + 0.5) continue;
    if (Math.hypot(x - ROCK.x, z - ROCK.z) < ROCK.radius + footprint + 1) continue;
    out.push({ kind, position: [x, SEA_Y + 0.02, z], length, yaw, footprint });
  }
  return out;
}

/** Planks that circle the whirlpool's back half, drawn in. Angle is measured from +x through -z. */
export function circlingDebris(index: number, seconds: number): { x: number; z: number; yaw: number; fade: number } {
  const lap = 26 + index * 4;
  const t = (((seconds / lap + index * 0.37) % 1) + 1) % 1;
  const angle = 0.12 * Math.PI + t * 0.76 * Math.PI;
  const radius = 8.4 - index * 0.55 - t * 1.4;
  const fade = Math.min(1, t * 8, (1 - t) * 8);
  return {
    x: WHIRL.x + Math.cos(angle) * radius,
    z: WHIRL.z - Math.sin(angle) * radius,
    yaw: -angle + Math.PI / 2,
    fade,
  };
}
