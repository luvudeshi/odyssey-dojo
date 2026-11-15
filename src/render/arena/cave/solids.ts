// Builds the cave's static shapes as flat-shaded, vertex-coloured geometry, merged into a few draw calls.
// Every facet gets its own colour between two tones, so rock reads as faceted low-poly with a warm/cool spread
// and the lights supply the orange sun and violet shadow.
import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Float32BufferAttribute, IcosahedronGeometry,
  LatheGeometry, Matrix4, Quaternion, Vector2, Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  FIGHT_ZONE, FIRE, MOUTH, boulders, hallRadii, homestead, mulberry, noise2, stalactites, wallInset,
} from "./mouthLayout";
import type { Piece } from "./mouthLayout";

const WARM_ROCK = new Color("#8a6a55");
const COOL_ROCK = new Color("#4d4672");
const DEEP_ROCK = new Color("#2e2a4a");

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Gives every triangle one flat colour: `pick` returns the mix between `a` and `b` for a triangle's centre. */
function paint(geometry: BufferGeometry, a: Color, b: Color, pick: (cx: number, cy: number, cz: number, index: number) => number): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.computeVertexNormals();
  const position = flat.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const tint = new Color();
  for (let i = 0; i < position.count; i += 3) {
    const cx = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
    const cy = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
    const cz = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
    tint.copy(a).lerp(b, Math.min(1, Math.max(0, pick(cx, cy, cz, i / 3))));
    for (let v = 0; v < 3; v++) colors.set([tint.r, tint.g, tint.b], (i + v) * 3);
  }
  flat.setAttribute("color", new Float32BufferAttribute(colors, 3));
  flat.deleteAttribute("uv");
  return flat;
}

function jitter(geometry: BufferGeometry, amount: number, seed: number): BufferGeometry {
  const position = geometry.getAttribute("position");
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    // Hash by the rounded position so the copies of one corner move together and no cracks open.
    const key = noise2(Math.round(v.x * 40) * 0.37 + seed, Math.round(v.y * 40) * 0.53 + Math.round(v.z * 40) * 0.29);
    v.multiplyScalar(1 + (key - 0.5) * 2 * amount);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  return geometry;
}

const matrixOf = (position: readonly [number, number, number], scale: readonly [number, number, number], yaw: number, tilt = 0): Matrix4 =>
  new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(tilt, yaw, 0)),
    new Vector3(...scale),
  );

/** One boulder for the thrown rock (render/effects/Boulder.tsx): the cave's faceted look, radius 1, centred on the origin. */
export function thrownRockGeometry(): BufferGeometry {
  return paint(jitter(new IcosahedronGeometry(1, 1), 0.22, 4.1), COOL_ROCK, WARM_ROCK, (_x, y, _z, i) => 0.4 + y * 0.12 + noise2(i * 0.7, 3) * 0.4);
}

/** Boulders and stalactites share one draw call. */
export function rockGeometry(): BufferGeometry {
  const random = mulberry(3);
  const parts: BufferGeometry[] = [];
  boulders().forEach((rock, index) => {
    const geometry = jitter(new IcosahedronGeometry(1, 1), 0.22, index * 1.7).applyMatrix4(matrixOf(rock.position, rock.scale, rock.yaw, random() * 0.4));
    const warm = random();
    parts.push(paint(geometry, COOL_ROCK, WARM_ROCK, (_x, y, _z, i) => 0.25 + warm * 0.4 + y * 0.05 + noise2(i * 0.7, index) * 0.35));
  });
  stalactites().forEach((tooth, index) => {
    const cone = new ConeGeometry(1, 1, 5, 1).rotateX(Math.PI);
    jitter(cone, 0.18, index * 2.3).applyMatrix4(matrixOf(tooth.position, tooth.scale, tooth.yaw));
    parts.push(paint(cone, DEEP_ROCK, COOL_ROCK, (_x, _y, _z, i) => noise2(i * 0.9, index * 3) * 0.9));
  });
  return mergeGeometries(parts);
}

/** The big stone shell: roof, walls and the pinched rim of the opening. Seen from inside. */
export function shellGeometry(): BufferGeometry {
  const rows = 36, around = 34;
  const zFront = MOUTH.frontZ, zBack = MOUTH.lipZ - 0.4;
  const points: Vector3[][] = [];
  for (let r = 0; r <= rows; r++) {
    const z = zFront + ((zBack - zFront) * r) / rows;
    const { rx, ry } = hallRadii(z);
    const row: Vector3[] = [];
    for (let a = 0; a <= around; a++) {
      const theta = (a / around) * Math.PI;
      const k = wallInset(theta, z) * (1 - noise2(a * 9.1, r * 4.3) * 0.035);
      row.push(new Vector3(Math.cos(theta) * rx * k, Math.max(0, Math.sin(theta) * ry * k), z));
    }
    points.push(row);
  }
  const positions: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let a = 0; a < around; a++) {
      const p00 = points[r]?.[a], p01 = points[r]?.[a + 1], p10 = points[r + 1]?.[a], p11 = points[r + 1]?.[a + 1];
      if (!p00 || !p01 || !p10 || !p11) continue;
      positions.push(...p00.toArray(), ...p10.toArray(), ...p01.toArray(), ...p01.toArray(), ...p10.toArray(), ...p11.toArray());
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  // Cooler and darker high up and toward the camera, warmer near the mouth where the sky lights it.
  return paint(geometry, DEEP_ROCK, WARM_ROCK, (x, y, z, i) => {
    const mouthGlow = smooth(-2, MOUTH.lipZ, z) * 0.45;
    return noise2(i * 0.31, 2) * 0.45 + mouthGlow - y * 0.03 + 0.1;
  });
}

/** The floor: flat where the fight is, rough toward the walls, sloping into a ledge at the mouth. */
export function floorGeometry(): BufferGeometry {
  const rows = 40, across = 36;
  const zFront = MOUTH.frontZ, zBack = MOUTH.ledgeZ;
  const heightAt = (x: number, z: number): number => {
    const dx = Math.max(FIGHT_ZONE.minX - x, 0, x - FIGHT_ZONE.maxX);
    const dz = Math.max(FIGHT_ZONE.minZ - z, 0, z - FIGHT_ZONE.maxZ);
    const rough = smooth(0.2, 4, Math.hypot(dx, dz)) * (noise2(x * 0.5, z * 0.5) - 0.35) * 0.9;
    const ledge = -smooth(MOUTH.lipZ - 0.2, MOUTH.ledgeZ + 0.3, z + noise2(x * 0.6, 5) * 0.6) * 1.1;
    return rough + ledge;
  };
  const points: Vector3[][] = [];
  for (let r = 0; r <= rows; r++) {
    const z = zFront + ((zBack - zFront) * r) / rows;
    const half = hallRadii(z).rx * 0.99;
    const row: Vector3[] = [];
    for (let c = 0; c <= across; c++) {
      const x = (c / across * 2 - 1) * half;
      row.push(new Vector3(x, heightAt(x, z), z));
    }
    points.push(row);
  }
  const positions: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < across; c++) {
      const p00 = points[r]?.[c], p01 = points[r]?.[c + 1], p10 = points[r + 1]?.[c], p11 = points[r + 1]?.[c + 1];
      if (!p00 || !p01 || !p10 || !p11) continue;
      positions.push(...p00.toArray(), ...p01.toArray(), ...p10.toArray(), ...p01.toArray(), ...p11.toArray(), ...p10.toArray());
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const dust = new Color("#7a5f4a"), cool = new Color("#3e3858");
  return paint(geometry, cool, dust, (x, _y, z, i) => {
    const soot = Math.hypot(x - FIRE.x, z - FIRE.z);
    return 0.35 + noise2(x * 0.4, z * 0.4) * 0.4 + noise2(i * 0.5, 9) * 0.25 - (soot < 2.4 ? 0.4 : 0);
  });
}

function sheepPart(parts: BufferGeometry[], piece: Piece): void {
  const [x, , z] = piece.position;
  // Earth-toned wool, a dark face and legs: pale wool just clips to white under the low orange sun.
  const wool = new Color("#b5a088"), shade = new Color("#6e5e54"), dark = new Color("#2a2224");
  const at = (px: number, py: number, pz: number): Matrix4 =>
    new Matrix4().makeTranslation(x, 0, z).multiply(new Matrix4().makeRotationY(piece.yaw)).multiply(new Matrix4().makeScale(1.5, 1.5, 1.5)).multiply(new Matrix4().makeTranslation(px, py, pz));
  // Three overlapping fleece lumps make a lumpy back instead of one egg.
  for (const [px, py, pz, size] of [[0, 0.62, 0.22, 0.34], [0, 0.66, -0.12, 0.36], [0, 0.6, -0.42, 0.3]] as const) {
    const lump = jitter(new IcosahedronGeometry(size, 0), 0.14, x + z + pz).applyMatrix4(at(px, py, pz).multiply(new Matrix4().makeScale(1.05, 0.95, 1.1)));
    parts.push(paint(lump, shade, wool, (_x, y, _z, i) => 0.3 + y * 0.5 + noise2(i, 4) * 0.4));
  }
  parts.push(paint(new BoxGeometry(0.2, 0.22, 0.3).applyMatrix4(at(0, 0.72, 0.62)), dark, dark, () => 0));
  for (const ex of [-0.13, 0.13]) parts.push(paint(new BoxGeometry(0.1, 0.05, 0.14).applyMatrix4(at(ex, 0.8, 0.54)), dark, dark, () => 0));
  for (const [lx, lz] of [[-0.17, -0.45], [0.17, -0.45], [-0.17, 0.3], [0.17, 0.3]] as const) {
    parts.push(paint(new CylinderGeometry(0.05, 0.045, 0.42, 5).applyMatrix4(at(lx, 0.21, lz)), dark, dark, () => 0));
  }
}

/** The shepherd's pen, sheep, big clay jars, and the fire pit's stones and logs. One draw call. */
export function homesteadGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const wood = new Color("#6b4a32"), woodLit = new Color("#9a7048"), clay = new Color("#6e3a2a"), clayLit = new Color("#b8663c");
  const posts = homestead().filter((p) => p.kind === "post");
  posts.forEach((post, index) => {
    parts.push(paint(new CylinderGeometry(0.14, 0.17, 2, 5).applyMatrix4(new Matrix4().makeTranslation(...post.position)), wood, woodLit, (_x, _y, _z, i) => noise2(i, index)));
    const next = posts[index + 1];
    if (!next) return;
    for (const height of [0.8, 1.6]) {
      const from = new Vector3(post.position[0], height, post.position[2]);
      const to = new Vector3(next.position[0], height, next.position[2]);
      const mid = from.clone().add(to).multiplyScalar(0.5);
      const rail = new BoxGeometry(from.distanceTo(to), 0.12, 0.12)
        .applyMatrix4(new Matrix4().compose(mid, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.atan2(to.z - from.z, to.x - from.x)), new Vector3(1, 1, 1)));
      parts.push(paint(rail, wood, woodLit, (_x, _y, _z, i) => noise2(i, height * 9)));
    }
  });
  for (const piece of homestead()) {
    if (piece.kind === "sheep") sheepPart(parts, piece);
    if (piece.kind === "jar") {
      const profile = [[0.0, 0], [0.5, 0], [0.8, 0.25], [1, 0.5], [0.85, 0.78], [0.5, 0.92], [0.58, 1], [0.0, 1]].map(([r, h]) => new Vector2(r, h));
      const lathe = new LatheGeometry(profile, 8).applyMatrix4(matrixOf(piece.position, piece.scale, piece.yaw));
      parts.push(paint(lathe, clay, clayLit, (_x, y, _z, i) => 0.3 + y * 0.12 + noise2(i, 2) * 0.35));
    }
  }
  // Fire pit: a ring of stones and a few charred logs.
  const random = mulberry(21);
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const size = 0.26 + random() * 0.12;
    const stone = jitter(new IcosahedronGeometry(1, 1), 0.2, i).applyMatrix4(matrixOf([FIRE.x + Math.cos(angle) * 0.95, size * 0.45, FIRE.z + Math.sin(angle) * 0.95], [size * 1.3, size, size * 1.1], angle));
    parts.push(paint(stone, COOL_ROCK, WARM_ROCK, () => 0.3 + random() * 0.4));
  }
  for (let i = 0; i < 4; i++) {
    const log = new CylinderGeometry(0.1, 0.12, 1.1, 6).rotateZ(Math.PI / 2)
      .applyMatrix4(matrixOf([FIRE.x, 0.18 + (i % 2) * 0.14, FIRE.z], [1, 1, 1], i * 0.8));
    parts.push(paint(log, new Color("#20140e"), new Color("#4a2a1a"), () => random()));
  }
  return mergeGeometries(parts);
}
