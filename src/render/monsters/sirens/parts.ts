// The Siren's pieces, built in code: a great bird's body, tail, legs and wings, and a woman's chest, head and arms
// rising from it, as on the Greek vases. Metres, feet on y=0, facing +z. Each piece is one merged, vertex-coloured
// geometry; SirenFigure moves them as rigid groups. Built once and shared by both Sirens.
import { ConeGeometry, CylinderGeometry, IcosahedronGeometry, OctahedronGeometry, SphereGeometry, TorusGeometry } from "three";
import type { BufferGeometry } from "three";
import { aimed, merge, part } from "./geo";
import type { Vec3 } from "./geo";

export const COLORS = {
  plumage: "#5a3aa0",
  plumageDark: "#3b2478",
  covert: "#9a64d8",
  tip: "#f2b840",
  cream: "#f6ead0",
  skin: "#ecb48c",
  hair: "#2a1a33",
  hairLight: "#4a2d52",
  gold: "#e2a838",
  leg: "#e6a23a",
  claw: "#3a2418",
  chiton: "#f7f0de",
  mouth: "#7a1f2b",
} as const;

/** Where on the body the song comes from, and the pivots the figure moves parts around. */
export const SIREN = {
  torsoPivot: [0, 2.35, 0.05] as Vec3,
  headPivot: [0, 1.02, 0] as Vec3,
  shoulderX: 0.46,
  shoulderY: 0.76,
  wingPivot: [0.34, 0.68, -0.22] as Vec3,
  hip: [0.5, 1.15, 0.35] as Vec3,
  /** Throat, in the Siren's own coordinates (the weak spot's `position` in the enemy data matches). */
  throat: [0, 3.34, 0.5] as Vec3,
  mouth: [0, 0.17, 0.285] as Vec3,
} as const;

const ico = (detail = 1): IcosahedronGeometry => new IcosahedronGeometry(1, detail);

/** A flat-ish feather: a tapered diamond with a gold tip. Points along `direction` from `root`. */
function feather(root: Vec3, direction: Vec3, length: number, halfWidth: number, color: string, tip: string | null): BufferGeometry[] {
  const dir = Math.hypot(...direction);
  const unit: Vec3 = [direction[0] / dir, direction[1] / dir, direction[2] / dir];
  const bodyLength = tip ? length * 0.72 : length;
  const at = (t: number): Vec3 => [root[0] + unit[0] * t, root[1] + unit[1] * t, root[2] + unit[2] * t];
  const out = [aimed(new CylinderGeometry(halfWidth * 0.55, halfWidth, bodyLength, 4, 1), color, at(bodyLength / 2), unit, [1, 1, 0.14])];
  if (tip) out.push(aimed(new ConeGeometry(halfWidth * 0.55, length * 0.28, 4, 1), tip, at(bodyLength + length * 0.14), unit, [1, 1, 0.14]));
  return out;
}

/** The bird body: violet back, cream scalloped breast. */
export function bodyGeometry(): BufferGeometry {
  const parts = [
    part(ico(), COLORS.plumage, [0, 1.75, -0.05], [0, 0, 0], [1.0, 1.15, 1.25]),
    part(ico(), COLORS.cream, [0, 1.7, 0.5], [0, 0, 0], [0.78, 0.95, 0.72]),
    part(ico(), COLORS.plumageDark, [0, 1.35, -0.55], [0, 0, 0], [0.8, 0.7, 0.9]),
  ];
  // Rows of scallop feathers down the breast.
  for (let row = 0; row < 4; row++) {
    const y = 2.28 - row * 0.34;
    const count = 7 - row;
    const rise = (y - 1.75) / 1.15;
    const scale = Math.sqrt(Math.max(0.05, 1 - rise * rise));
    for (let i = 0; i < count; i++) {
      const phi = ((i + 0.5) / count - 0.5) * 1.9;
      const x = 0.95 * scale * Math.sin(phi);
      const z = -0.05 + 1.2 * scale * Math.cos(phi);
      parts.push(aimed(new ConeGeometry(0.2, 0.5, 4, 1), row % 2 === 0 ? COLORS.cream : COLORS.covert, [x, y, z], [Math.sin(phi) * 0.5, -1, 0.45 + Math.cos(phi) * 0.2], [1, 1, 0.3]));
    }
  }
  // Feathered thighs at the top of each leg.
  for (const side of [-1, 1]) parts.push(part(ico(), COLORS.cream, [side * 0.5, 1.15, 0.3], [0, 0, 0], [0.3, 0.45, 0.32]));
  return merge(parts);
}

/** The tail: a fan of long feathers going back and down. Pivot at the root, behind the body. */
export function tailGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 1.5;
    parts.push(...feather([0, 0, 0], [Math.sin(a) * 0.9, -0.42 - Math.abs(a) * 0.1, -Math.cos(a)], 2.0 - Math.abs(a) * 0.5, 0.2, i % 2 === 0 ? COLORS.plumage : COLORS.covert, COLORS.tip));
  }
  return merge(parts);
}

/** One leg for the +x side (the left leg is this one mirrored), pivot at the hip: yellow shin and three claws. */
export function legGeometry(): BufferGeometry {
  const ankle: Vec3 = [0, -1.08, 0.12];
  const parts: BufferGeometry[] = [aimed(new CylinderGeometry(0.075, 0.1, 1.1, 5, 1), COLORS.leg, [0, -0.54, 0.06], [0, -1, 0.12])];
  for (const [dx, dz] of [[-0.38, 1], [0, 1.1], [0.38, 1], [0, -0.7]] as const) {
    const length = dz > 0 ? 0.55 : 0.32;
    const direction: Vec3 = [dx, -0.12, dz];
    const norm = Math.hypot(...direction);
    const start: Vec3 = [ankle[0] + (direction[0] / norm) * length * 0.5, ankle[1] + (direction[1] / norm) * length * 0.5, ankle[2] + (direction[2] / norm) * length * 0.5];
    parts.push(aimed(new ConeGeometry(0.075, length, 4, 1), COLORS.leg, start, direction));
    parts.push(aimed(new ConeGeometry(0.05, 0.2, 4, 1), COLORS.claw, [ankle[0] + (direction[0] / norm) * (length + 0.06), ankle[1] + (direction[1] / norm) * (length + 0.06), ankle[2] + (direction[2] / norm) * (length + 0.06)], direction));
  }
  parts.push(part(ico(0), COLORS.leg, ankle, [0, 0, 0], [0.12, 0.1, 0.14]));
  return merge(parts);
}

/** Chest in a cream chiton with a gold belt, skin on the neck and shoulders. Pivot at the waist. */
export function torsoGeometry(): BufferGeometry {
  return merge([
    part(new CylinderGeometry(0.38, 0.56, 0.9, 8, 1), COLORS.chiton, [0, 0.43, 0]),
    part(new TorusGeometry(0.5, 0.05, 4, 8), COLORS.gold, [0, 0.13, 0], [Math.PI / 2, 0, 0]),
    part(ico(), COLORS.skin, [0, 0.88, 0.02], [0, 0, 0], [0.4, 0.17, 0.32]),
    part(new CylinderGeometry(0.12, 0.15, 0.4, 6, 1), COLORS.skin, [0, 1.0, 0.03]),
    part(ico(0), COLORS.skin, [0.43, 0.77, 0], [0, 0, 0], [0.18, 0.18, 0.18]),
    part(ico(0), COLORS.skin, [-0.43, 0.77, 0], [0, 0, 0], [0.18, 0.18, 0.18]),
    // Gold brooches at the shoulders.
    part(ico(0), COLORS.gold, [0.3, 0.84, 0.2], [0, 0, 0], [0.07, 0.07, 0.07]),
    part(ico(0), COLORS.gold, [-0.3, 0.84, 0.2], [0, 0, 0], [0.07, 0.07, 0.07]),
  ]);
}

/** Head with long dark hair and a gold circlet; pivot at the base of the neck. */
export function headGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [
    part(ico(), COLORS.skin, [0, 0.34, 0.02], [0, 0, 0], [0.27, 0.33, 0.29]),
    aimed(new ConeGeometry(0.045, 0.11, 4, 1), COLORS.skin, [0, 0.3, 0.3], [0, 0.2, 1]),
    part(ico(), COLORS.hair, [0, 0.41, -0.08], [0, 0, 0], [0.31, 0.36, 0.33]),
    part(new TorusGeometry(0.3, 0.028, 4, 10), COLORS.gold, [0, 0.53, 0], [Math.PI / 2 - 0.1, 0, 0]),
  ];
  [-0.3, -0.16, 0, 0.16, 0.3].forEach((x, i) => {
    const length = 0.9 + (i % 2) * 0.35 + (Math.abs(x) < 0.1 ? 0.3 : 0);
    parts.push(aimed(new ConeGeometry(0.1, length, 4, 1), i % 2 === 0 ? COLORS.hair : COLORS.hairLight, [x, 0.3 - length / 2 + 0.1, -0.14 - Math.abs(x) * 0.1], [0.05 * (i - 2), -1, -0.05], [1, 1, 0.6]));
  });
  return merge(parts);
}

/** Upper arm, for the +x side, hanging from the shoulder. */
export function upperArmGeometry(): BufferGeometry {
  return merge([
    part(new CylinderGeometry(0.075, 0.09, 0.7, 6, 1), COLORS.skin, [0, -0.35, 0]),
    part(new CylinderGeometry(0.095, 0.095, 0.09, 6, 1), COLORS.gold, [0, -0.12, 0]),
  ]);
}

/** Forearm and hand, hanging from the elbow. */
export function foreArmGeometry(): BufferGeometry {
  return merge([
    part(new CylinderGeometry(0.06, 0.075, 0.62, 6, 1), COLORS.skin, [0, -0.31, 0]),
    part(ico(0), COLORS.skin, [0, -0.68, 0.02], [0, 0, 0], [0.095, 0.12, 0.08]),
  ]);
}

/**
 * One wing for the +x side, lying in the x-y plane with its spar along +x from the shoulder. Long violet
 * primaries hang from the spar and fan from straight down (near the body) to outward (at the tip), pink coverts
 * overlap them and every primary ends in gold. The other wing is this one mirrored.
 */
export function wingGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [
    part(new CylinderGeometry(0.07, 0.12, 1.7, 5, 1), COLORS.plumageDark, [0.85, 0, 0], [0, 0, -Math.PI / 2]),
    part(ico(0), COLORS.plumageDark, [1.7, 0, 0], [0, 0, 0], [0.14, 0.14, 0.14]),
  ];
  const count = 10;
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const angle = -((78 - 62 * u) * Math.PI) / 180;
    const length = 1.0 + 1.15 * Math.pow(u, 0.8);
    const root: Vec3 = [0.15 + u * 1.5, 0, -0.02];
    const dir: Vec3 = [Math.cos(angle), Math.sin(angle), 0];
    parts.push(...feather(root, dir, length, 0.17 + 0.05 * u, i % 2 === 0 ? COLORS.plumage : COLORS.plumageDark, COLORS.tip));
  }
  for (let i = 0; i < 8; i++) {
    const u = i / 7;
    const angle = -((70 - 52 * u) * Math.PI) / 180;
    const root: Vec3 = [0.2 + u * 1.4, 0.02, 0.03];
    parts.push(...feather(root, [Math.cos(angle), Math.sin(angle), 0], 0.55 + 0.45 * u, 0.17, COLORS.covert, null));
  }
  return merge(parts);
}

/** Small round eye and the mouth, kept apart because they change (glow, open and shut). */
export const eyeGeometry = (): SphereGeometry => new SphereGeometry(0.05, 6, 4);
export const mouthGeometry = (): SphereGeometry => new SphereGeometry(0.06, 7, 5);
export const noteGeometry = (): OctahedronGeometry => new OctahedronGeometry(0.09, 0);
