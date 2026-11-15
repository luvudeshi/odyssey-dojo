// The islet's solid pieces, built in code as flat-shaded, vertex-coloured low-poly geometry: the meadow, rocks,
// bones and the wreck. One merged mesh each, so the whole setting costs a handful of draw calls.
import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, OctahedronGeometry, TorusGeometry, Vector3 } from "three";
import { aimed, merge, mulberry, part } from "../../monsters/sirens/geo";
import { bones, groundHeight, islandDistance, noise2, rocks } from "./layout";
import type { Bone, Rock } from "./layout";

const GRASS_A = new Color("#5fa83a");
const GRASS_B = new Color("#9ccc4a");
const GRASS_DRY = new Color("#d2cf74");
const SAND = new Color("#ead9a0");
const ROCK_A = new Color("#b3a28a");
const ROCK_B = new Color("#8f7e6a");

function hash(a: number, b: number): number {
  let h = Math.imul(Math.floor(a * 100), 374761393) ^ Math.imul(Math.floor(b * 100), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The ground colour at a point: meadow greens with dry patches, sand near the water, grey rock on steep or high ground. */
function groundColor(x: number, z: number, height: number, slope: number, out: Color, jitter: number): Color {
  const n = noise2(x * 0.22, z * 0.22);
  out.copy(GRASS_A).lerp(GRASS_B, Math.min(1, n * 1.4 + jitter * 0.25));
  const dry = noise2(x * 0.15 + 9, z * 0.15 - 4);
  if (dry > 0.66) out.lerp(GRASS_DRY, (dry - 0.66) * 3);
  const d = islandDistance(x, z);
  if (d > 15 || height < 0.05) out.lerp(SAND, Math.max(0, Math.min(1, (d - 14) * 0.5 + (0.1 - height))));
  const rocky = Math.max(slope * 1.1, (height - 1.4) * 0.6);
  if (rocky > 0.35) out.lerp(jitter > 0.5 ? ROCK_A : ROCK_B, Math.max(0, Math.min(1, (rocky - 0.35) * 2.5)));
  return out;
}

/** The islet: a grid of flat triangles, each its own colour, dead flat under the fight and rolling beyond. */
export function terrainGeometry(): BufferGeometry {
  const x0 = -27, x1 = 27, z0 = -30, z1 = 17, step = 1.5;
  const cols = Math.round((x1 - x0) / step), rows = Math.round((z1 - z0) / step);
  const positions: number[] = [];
  const colors: number[] = [];
  const point = (i: number, j: number): Vector3 => {
    const x = x0 + i * step + (hash(i, j) - 0.5) * step * 0.55;
    const z = z0 + j * step + (hash(j + 91, i + 7) - 0.5) * step * 0.55;
    return new Vector3(x, groundHeight(x, z), z);
  };
  const grid: Vector3[][] = Array.from({ length: cols + 1 }, (_, i) => Array.from({ length: rows + 1 }, (_, j) => point(i, j)));
  const color = new Color();
  const push = (a: Vector3, b: Vector3, c: Vector3): void => {
    const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3, cy = (a.y + b.y + c.y) / 3;
    const slope = Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y);
    groundColor(cx, cz, cy, slope / step, color, hash(cx, cz));
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      colors.push(color.r, color.g, color.b);
    }
  };
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = grid[i]?.[j], b = grid[i + 1]?.[j], c = grid[i]?.[j + 1], d = grid[i + 1]?.[j + 1];
      if (!a || !b || !c || !d) continue;
      // Counter-clockwise seen from above, so the faces point up.
      push(a, c, b);
      push(b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const ROCK_SHADES = ["#c2b49c", "#b89066", "#6d6258"] as const;

/** A lumpy boulder: an icosphere with its points pushed in and out by a position hash, so neighbours stay joined. */
function lumpy(seed: number): BufferGeometry {
  const base = new IcosahedronGeometry(1, 1);
  const position = base.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const k = 0.78 + hash(x * 7.3 + seed, y * 5.1 + z * 3.7) * 0.5;
    position.setXYZ(i, x * k, y * k * 0.9, z * k);
  }
  base.computeVertexNormals();
  return base;
}

export function rockGeometry(list: readonly Rock[] = rocks()): BufferGeometry {
  return merge(list.map((rock) => part(lumpy(rock.seed), ROCK_SHADES[rock.shade], rock.position, [0, rock.yaw, 0], rock.scale)));
}

const BONE = ["#efe6cc", "#e2d6b6", "#f6eed8"] as const;

function boneParts(bone: Bone, index: number): BufferGeometry[] {
  const color = BONE[index % BONE.length] ?? BONE[0];
  const s = bone.scale;
  const [x, y, z] = bone.position;
  const place = (geometry: BufferGeometry, local: readonly [number, number, number], rotation: readonly [number, number, number], scale: readonly [number, number, number] = [1, 1, 1], tint: string = color): BufferGeometry => {
    // Rotate the local offset by the bone's yaw, then drop it at the bone's spot.
    const yaw = bone.rotation[1];
    const lx = local[0] * Math.cos(yaw) + local[2] * Math.sin(yaw);
    const lz = -local[0] * Math.sin(yaw) + local[2] * Math.cos(yaw);
    return part(geometry, tint, [x + lx * s, y + local[1] * s, z + lz * s], [bone.rotation[0] + rotation[0], yaw + rotation[1], bone.rotation[2] + rotation[2]], [scale[0] * s, scale[1] * s, scale[2] * s]);
  };
  switch (bone.kind) {
    case "skull":
      return [
        place(new IcosahedronGeometry(0.16, 0), [0, 0.15, 0], [0, 0, 0], [1, 0.95, 1.1]),
        place(new BoxGeometry(0.15, 0.07, 0.15), [0, 0.04, 0.1], [0, 0, 0]),
        place(new OctahedronGeometry(0.04, 0), [-0.06, 0.17, 0.14], [0, 0, 0], [1, 1.2, 0.8], "#2b2420"),
        place(new OctahedronGeometry(0.04, 0), [0.06, 0.17, 0.14], [0, 0, 0], [1, 1.2, 0.8], "#2b2420"),
      ];
    case "ribs":
      return Array.from({ length: 3 }, (_, i) =>
        place(new TorusGeometry(0.34 - Math.abs(i - 1) * 0.04, 0.03, 3, 6, Math.PI), [0, 0.02, (i - 1) * 0.2], [0, Math.PI / 2, 0]),
      ).concat([place(new CylinderGeometry(0.03, 0.03, 0.7, 3, 1), [0, 0.02, 0], [Math.PI / 2, 0, 0])]);
    case "spine":
      return Array.from({ length: 4 }, (_, i) => place(new OctahedronGeometry(0.06, 0), [0, 0.04, (i - 1.5) * 0.14], [0, 0, 0], [1.4, 1, 1]));
    case "long":
      return [
        place(new CylinderGeometry(0.03, 0.03, 0.7, 4, 1), [0, 0.04, 0], [0, 0, Math.PI / 2]),
        place(new OctahedronGeometry(0.07, 0), [-0.36, 0.04, 0], [0, 0, 0]),
        place(new OctahedronGeometry(0.07, 0), [0.36, 0.04, 0], [0, 0, 0]),
      ];
  }
}

/** Every skull, rib and long bone of every heap, merged. */
export function boneGeometry(list: readonly Bone[] = bones()): BufferGeometry {
  return merge(list.flatMap((bone, i) => boneParts(bone, i)));
}

/** A broken mast with a torn sail and rope, leaning on the left, and the ribs of a wrecked hull on the right. */
export function wreckGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const v3 = (v: Vector3): [number, number, number] => [v.x, v.y, v.z];
  const wood = "#6a4a30", pale = "#8c6a48", sail = "#d9ccb0", rope = "#b79a6a";
  // Mast: leans, ends in a splintered stump; a yard crosses it and a torn sail hangs from the yard.
  const base = new Vector3(-6.6, groundHeight(-6.6, -6.4) - 0.2, -6.4);
  const lean = new Vector3(0.28, 1, 0.12).normalize();
  parts.push(aimed(new CylinderGeometry(0.2, 0.27, 6.2, 7, 1), wood, v3(base.clone().addScaledVector(lean, 3.1)), [lean.x, lean.y, lean.z]));
  const top = base.clone().addScaledVector(lean, 6.2);
  parts.push(aimed(new ConeGeometry(0.2, 0.5, 5, 1), pale, v3(top.clone().addScaledVector(lean, 0.2)), [lean.x, lean.y, lean.z]));
  const yard = base.clone().addScaledVector(lean, 4.4);
  parts.push(part(new CylinderGeometry(0.09, 0.09, 3.4, 5, 1), wood, [yard.x, yard.y, yard.z], [0.3, 0.4, Math.PI / 2 + 0.12]));
  parts.push(part(new BoxGeometry(2.7, 2.2, 0.05), sail, [yard.x + 0.1, yard.y - 1.3, yard.z + 0.12], [0.05, 0.4, 0.06]));
  parts.push(part(new BoxGeometry(1.1, 0.8, 0.05), "#8a2a2a", [yard.x + 0.5, yard.y - 1.3, yard.z + 0.2], [0.05, 0.4, 0.06]));
  parts.push(part(new CylinderGeometry(0.03, 0.03, 4.4, 4, 1), rope, [yard.x + 0.9, yard.y - 2.1, yard.z + 0.5], [0.5, 0, 0.7]));
  // Hull ribs standing out of the grass on the right, with a fallen plank and a lone oar.
  const random = mulberry(77);
  for (let i = 0; i < 7; i++) {
    const x = 7.4 + i * 0.62, z = -9.2 - i * 0.08;
    const height = 2.4 - Math.abs(i - 3) * 0.28 + random() * 0.2;
    const y = groundHeight(x, z) - 0.15;
    parts.push(part(new TorusGeometry(1.1, 0.1, 4, 7, Math.PI * 0.9), i % 2 === 0 ? wood : pale, [x, y, z], [0, Math.PI / 2, Math.PI * 0.05 + 0.1], [1, height / 2.2, 1]));
  }
  const plankY = groundHeight(8.6, -7.4) + 0.12;
  parts.push(part(new BoxGeometry(3.4, 0.12, 0.45), pale, [8.6, plankY, -7.4], [0, 0.45, 0.03]));
  parts.push(aimed(new CylinderGeometry(0.05, 0.05, 3.4, 5, 1), wood, [6.8, groundHeight(6.8, -7) + 1.4, -7], [0.22, 1, 0.1]));
  parts.push(aimed(new BoxGeometry(0.34, 1.2, 0.04), wood, [6.55, groundHeight(6.8, -7) + 3, -7], [0.22, 1, 0.1]));
  return merge(parts);
}

/** A tuft of three crossed blades, widest at the ground. */
export function tuftGeometry(): BufferGeometry {
  const parts = [0, 1].map((i) => aimed(new ConeGeometry(0.07, 0.5, 3, 1), i === 1 ? "#7cc24a" : "#5da13a", [Math.cos(i * 3.1) * 0.05, 0.22, Math.sin(i * 3.1) * 0.05], [Math.cos(i * 3.1) * 0.3, 1, Math.sin(i * 3.1) * 0.3]));
  return merge(parts);
}

/** A flower: a stem and a flat eight-sided head. Colour comes from the instance and tints the stem too, which is fine at this size. */
export function flowerGeometry(): BufferGeometry {
  return merge([
    aimed(new ConeGeometry(0.02, 0.28, 3, 1), "#8fd05a", [0, 0.14, 0], [0, 1, 0]),
    part(new CylinderGeometry(0.1, 0.07, 0.05, 6, 1), "#ffffff", [0, 0.28, 0]),
    part(new OctahedronGeometry(0.04, 0), "#fff2a0", [0, 0.31, 0]),
  ]);
}
