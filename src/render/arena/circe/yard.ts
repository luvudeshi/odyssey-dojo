// The yard around Circe's hall: the grass and far hills, tall trees, her tame lions and wolves, the crew of Odysseus
// as pigs in a pen, the braziers' stands and the herb moly in a pot. Metres, same frame as hall.ts.
import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, PlaneGeometry } from "three";
import type { BufferGeometry } from "three";
import { GRASS_Y } from "./hall";
import { merge, mulberry, paint, place } from "./kit";
import type { V3 } from "./kit";

export const BRAZIERS: readonly V3[] = [[-4.8, 0, -2.4], [4.8, 0, -2.4]];
export const BRAZIER_HEIGHT = 1.45;
const MOLY_AT: V3 = [-2.9, 0, -0.4];

const blob = (r: number, detail = 1): IcosahedronGeometry => new IcosahedronGeometry(r, detail);

/** Value noise for the ground and the trees, deterministic. */
export function noise(x: number, z: number): number {
  const h = (a: number, b: number): number => {
    const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const top = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * sx;
  const bottom = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * sx;
  return top + (bottom - top) * sz;
}

/** Rolling grass: flat near the courtyard, hummocky further out, in two greens. */
export function grassGeometry(): BufferGeometry {
  const plane = new PlaneGeometry(140, 140, 56, 56).rotateX(-Math.PI / 2);
  const position = plane.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const r = Math.hypot(x, z + 4);
    const rise = Math.min(1, Math.max(0, (r - 12) / 20));
    position.setY(i, GRASS_Y + (noise(x * 0.09, z * 0.09) - 0.4) * 5 * rise * rise + noise(x * 0.4, z * 0.4) * 0.15 * rise);
  }
  return paint(plane, "#4f7a3a", 0.07, 3);
}

/** Round hills on the horizon, violet where the haze takes them. */
export function hillGeometry(): BufferGeometry {
  const random = mulberry(11);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const angle = Math.PI * (0.78 + (i / 11) * 1.44);
    const r = 82 + random() * 14;
    const size = 16 + random() * 16;
    parts.push(place(paint(blob(1, 1), i % 2 ? "#5a4a7c" : "#6b5a86", 0.05, i), [Math.sin(angle) * r, GRASS_Y - 2, -Math.cos(angle) * r - 6], random() * 6, [size * 1.5, size * 0.55, size]));
  }
  return merge(parts);
}

function cypress(x: number, z: number, height: number, hex: string, seed: number): BufferGeometry[] {
  const w = height * 0.12;
  return [
    place(paint(new CylinderGeometry(0.16, 0.22, 1.2, 5), "#5a3d2a", 0.03, seed), [x, GRASS_Y + 0.6, z]),
    place(paint(new ConeGeometry(w * 1.3, height * 0.55, 6), hex, 0.05, seed + 1), [x, GRASS_Y + height * 0.38, z]),
    place(paint(new ConeGeometry(w * 1.0, height * 0.5, 6), hex, 0.05, seed + 2), [x, GRASS_Y + height * 0.62, z]),
    place(paint(new ConeGeometry(w * 0.7, height * 0.4, 6), hex, 0.05, seed + 3), [x, GRASS_Y + height * 0.84, z]),
  ];
}

function umbrellaPine(x: number, z: number, height: number, hex: string, seed: number): BufferGeometry[] {
  const lean = (seed % 5) * 0.03 - 0.06;
  return [
    place(paint(new CylinderGeometry(0.2, 0.38, height * 0.8, 6), "#5a3d2a", 0.03, seed), [x, GRASS_Y + height * 0.4, z], 0, 1, [0, lean]),
    place(paint(blob(1, 1), hex, 0.06, seed + 1), [x, GRASS_Y + height * 0.86, z], seed, [height * 0.34, height * 0.15, height * 0.34]),
    place(paint(blob(1, 1), hex, 0.06, seed + 2), [x + height * 0.14, GRASS_Y + height * 0.74, z], seed, [height * 0.22, height * 0.1, height * 0.22]),
  ];
}

/** Where the trees stand: x, z and height in metres. Framing trees at the edges of the shot, then the ring. */
export function treeSpots(): [number, number, number][] {
  const random = mulberry(5);
  const spots: [number, number, number][] = [];
  // Framing trees at the edges of the shot, then the ring.
  spots.push([-9.8, -0.5, 9], [10.2, -1.5, 10], [-11.5, 3, 11], [12.5, 2.5, 8.5]);
  for (let i = 0; i < 70; i++) {
    const x = (random() - 0.5) * 80;
    const z = -22 - random() * 30;
    spots.push([x, z, 11 + random() * 7]);
  }
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1;
    spots.push([side * (13 + random() * 22), -18 + random() * 24, 9 + random() * 7]);
  }
  return spots;
}

/** Tall trees ringed round the clearing, the near ones framing the fight. */
export function treeGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const greens = ["#2f6a4a", "#3a7448", "#457a42", "#33645a"];
  treeSpots().forEach(([x, z, h], i) => {
    const hex = greens[i % greens.length] ?? "#2f6a4a";
    parts.push(...(i % 3 === 0 ? umbrellaPine(x, z, h * 0.8, hex, i * 9) : cypress(x, z, h, hex, i * 9)));
  });
  return merge(parts);
}

/** A seated big cat or wolf facing +z. `mane` gives a lion. */
function beast(x: number, z: number, yaw: number, body: string, mane: string | null, base = 0): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const at = (p: V3): V3 => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return [x + p[0] * c + p[2] * s, p[1] + base, z - p[0] * s + p[2] * c];
  };
  const put = (g: BufferGeometry, p: V3, scale: V3): BufferGeometry => place(g, at(p), yaw, scale);
  parts.push(put(paint(blob(1, 1), body, 0.05, 1), [0, 0.5, -0.25], [0.42, 0.45, 0.62]));
  parts.push(put(paint(blob(1, 1), body, 0.05, 2), [0, 0.72, 0.18], [0.36, 0.55, 0.38]));
  for (const dx of [-0.17, 0.17]) parts.push(put(paint(new BoxGeometry(0.14, 0.75, 0.14), body, 0.05, 3), [dx, 0.37, 0.4], [1, 1, 1]));
  parts.push(put(paint(blob(1, 0), body, 0.05, 4), [0, 1.18, 0.4], [0.27, 0.27, 0.3]));
  parts.push(put(paint(new BoxGeometry(0.16, 0.12, 0.24), mane ? "#e9d6b0" : "#cbd0d6", 0.03, 5), [0, 1.1, 0.68], [1, 1, 1]));
  if (mane) parts.push(put(paint(blob(1, 1), mane, 0.07, 6), [0, 1.13, 0.28], [0.46, 0.46, 0.34]));
  else for (const dx of [-0.13, 0.13]) parts.push(put(paint(new ConeGeometry(0.07, 0.24, 4), body, 0.04, 7), [dx, 1.5, 0.3], [1, 1, 1]));
  parts.push(place(paint(new BoxGeometry(0.1, 0.1, 0.9), body, 0.05, 8), at([0.3, 0.07, -0.7]), yaw + 0.4));
  return parts;
}

function pig(x: number, z: number, yaw: number, seed: number): BufferGeometry[] {
  const hex = seed % 2 ? "#f2a9ae" : "#e898a0";
  const at = (p: V3): V3 => [x + p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw), p[1] + GRASS_Y, z - p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw)];
  const parts: BufferGeometry[] = [
    place(paint(blob(1, 1), hex, 0.05, seed), at([0, 0.45, 0]), yaw, [0.34, 0.32, 0.55]),
    place(paint(blob(1, 0), hex, 0.05, seed + 1), at([0, 0.5, 0.55]), yaw, [0.22, 0.22, 0.24]),
    place(paint(new CylinderGeometry(0.1, 0.1, 0.12, 6).rotateX(Math.PI / 2), "#c9707c", 0.03, seed + 2), at([0, 0.46, 0.78]), yaw),
  ];
  for (const dx of [-0.13, 0.13]) {
    parts.push(place(paint(new ConeGeometry(0.07, 0.14, 3), "#c9707c", 0.03, seed + 3), at([dx, 0.72, 0.5]), yaw));
    for (const dz of [-0.32, 0.32]) parts.push(place(paint(new BoxGeometry(0.1, 0.3, 0.1), hex, 0.04, seed + 4), at([dx * 1.1, 0.15, dz]), yaw));
  }
  parts.push(place(paint(new BoxGeometry(0.05, 0.05, 0.14), hex, 0.03, seed + 5), at([0, 0.62, -0.62]), yaw));
  return parts;
}

/** Where the animals stand: x, z and yaw. Exported so a look with real animal models puts them in the same places. */
export const WOLVES: readonly (readonly [number, number, number])[] = [[-2.4, -9.2, 0.3], [2.4, -9.2, -0.3]];
export const PIGS: readonly (readonly [number, number, number])[] = [[-7.2, -4.6, 0.7], [-8.2, -4.2, 2.2], [-6.6, -5.9, 4.1], [-7.9, -5.5, 5.5]];

function pen(withPigs: boolean): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const [x0, x1, z0, z1] = [-9.0, -5.9, -7.2, -3.2];
  const post = (px: number, pz: number, i: number): void => {
    parts.push(place(paint(new BoxGeometry(0.14, 1.0, 0.14), "#6b4527", 0.05, i), [px, GRASS_Y + 0.5, pz]));
  };
  let n = 0;
  for (let x = x0; x <= x1 + 0.01; x += 1.03) { post(x, z0, n++); post(x, z1, n++); }
  for (let z = z0; z <= z1 + 0.01; z += 1.0) { post(x0, z, n++); post(x1, z, n++); }
  for (const y of [0.35, 0.75]) {
    for (const z of [z0, z1]) parts.push(place(paint(new BoxGeometry(x1 - x0, 0.07, 0.07), "#7a4f2b", 0.05, 30), [(x0 + x1) / 2, GRASS_Y + y, z]));
    for (const x of [x0, x1]) parts.push(place(paint(new BoxGeometry(0.07, 0.07, z1 - z0), "#7a4f2b", 0.05, 31), [x, GRASS_Y + y, (z0 + z1) / 2]));
  }
  parts.push(place(paint(new BoxGeometry(1.0, 0.5, 0.6), "#a8794a", 0.05, 32), [-8.2, GRASS_Y + 0.25, -6.5]));
  if (!withPigs) return parts;
  PIGS.forEach(([px, pz, yaw], i) => {
    parts.push(...pig(px, pz, yaw, 40 + i * 6));
  });
  return parts;
}

/** Everything standing in the yard that takes the sun. */
export function yardGeometry(modelledAnimals = false): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(...beast(-4.0, -7.4, 0.15, "#c8964a", "#7a4a22"), ...beast(4.0, -7.4, -0.15, "#c8964a", "#7a4a22"));
  if (!modelledAnimals) parts.push(...beast(-2.4, -9.2, 0.3, "#a6acb6", null, 0), ...beast(2.4, -9.2, -0.3, "#8d939e", null, 0));
  parts.push(...pen(!modelledAnimals));
  for (const [x, , z] of BRAZIERS) {
    parts.push(place(paint(new CylinderGeometry(0.05, 0.09, BRAZIER_HEIGHT, 5), "#6b4a2a", 0.04, 50), [x, BRAZIER_HEIGHT / 2, z]));
    parts.push(place(paint(new CylinderGeometry(0.42, 0.18, 0.3, 7), "#b07a3a", 0.05, 51), [x, BRAZIER_HEIGHT + 0.1, z]));
    parts.push(place(paint(new CylinderGeometry(0.34, 0.4, 0.1, 7), "#8a5a2a", 0.04, 52), [x, 0.05, z]));
  }
  const [mx, , mz] = MOLY_AT;
  parts.push(place(paint(new CylinderGeometry(0.2, 0.14, 0.32, 7), "#b8552e", 0.05, 60), [mx, 0.16, mz]));
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    parts.push(place(paint(new CylinderGeometry(0.012, 0.012, 0.5, 4), "#3f7a3a", 0.03, 61 + i), [mx + Math.cos(a) * 0.08, 0.55, mz + Math.sin(a) * 0.08], 0, 1, [Math.sin(a) * 0.1, Math.cos(a) * 0.1]));
  }
  return merge(parts);
}

/** The moly's milk-white flowers, drawn unshaded so they shine against the dusk. */
export function molyGlowGeometry(): BufferGeometry {
  const [mx, , mz] = MOLY_AT;
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    parts.push(place(paint(blob(0.07, 0), "#fffbea", 0.01, 70 + i), [mx + Math.cos(a) * 0.14, 0.84 + (i % 2) * 0.06, mz + Math.sin(a) * 0.14]));
  }
  return merge(parts);
}
