// The cliff over the strait: a sheer wall with strata, ledges and a cave halfway up, built as one flat-shaded grid
// with the cave's opening cut out, a dark unlit hollow behind it, a lip of rock and boulders around the rim.
import { BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, SphereGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MOUTH, SEA_Y, cliffZ, gridLines, mouthRadius, mulberry, noise2, smooth } from "./layout";
import { box, jitterVertices, place, tint } from "./solid";

const COOL = new Color("#5d6272");
const WARM = new Color("#9a8068");
const WET = new Color("#2c3a3c");

function rockColor(x: number, y: number, z: number, out: Color): Color {
  const band = noise2(y * 0.9, x * 0.05) * 0.7 + noise2(x * 0.6, y * 2.4) * 0.3;
  out.copy(COOL).lerp(WARM, band);
  out.lerp(WET, (1 - smooth(-0.5, 2.2, y)) * 0.8);
  out.multiplyScalar(0.65 + smooth(0, 14, y) * 0.35 + (z - MOUTH.z) * 0.01);
  return out;
}

type P3 = [number, number, number];

/** The wall, as separate triangles each with its own flat colour. The mouth's ellipse is left open. */
export function wallGeometry(): BufferGeometry {
  const xs = gridLines(-9, 40, -8, 9, 0.4, 3);
  const ys = gridLines(SEA_Y - 0.5, 46, -0.5, 12.5, 0.4, 4);
  const positions: number[] = [];
  const colors: number[] = [];
  const c = new Color();
  const corner = (x: number, y: number): P3 => [x, y, cliffZ(x, y)];
  for (let j = 0; j + 1 < ys.length; j++) {
    for (let i = 0; i + 1 < xs.length; i++) {
      const x0 = xs[i] ?? 0, x1 = xs[i + 1] ?? 0, y0 = ys[j] ?? 0, y1 = ys[j + 1] ?? 0;
      if (mouthRadius((x0 + x1) / 2, (y0 + y1) / 2) < 1) continue;
      const a = corner(x0, y0), b = corner(x1, y0), d = corner(x1, y1), e = corner(x0, y1);
      const tris: P3[][] = (i + j) % 2 === 0 ? [[a, b, d], [a, d, e]] : [[a, b, e], [b, d, e]];
      tris.forEach((tri, t) => {
        const cx = tri.reduce((sum, q) => sum + q[0], 0) / 3, cy = tri.reduce((sum, q) => sum + q[1], 0) / 3;
        const cz = tri.reduce((sum, q) => sum + q[2], 0) / 3;
        rockColor(cx, cy, cz, c);
        const k = 1 + (noise2(cx * 5, cy * 5 + t) - 0.5) * 0.22;
        for (const q of tri) {
          positions.push(...q);
          colors.push(c.r * k, c.g * k, c.b * k);
        }
      });
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** The ledge under the mouth, boulders around its rim and rubble at the cliff's foot. */
export function rimGeometry(): BufferGeometry {
  const random = mulberry(21);
  const parts: BufferGeometry[] = [];
  parts.push(box([MOUTH.rx * 1.9, 0.7, 2.6], [MOUTH.x, MOUTH.y - MOUTH.ry - 0.25, MOUTH.z + 0.7], "#6d6459", [0.05, 0, 0.02], 0.18));
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const size = 0.5 + random() * 0.55;
    const r = 1.03 + random() * 0.08;
    const x = MOUTH.x + Math.cos(a) * MOUTH.rx * r, y = MOUTH.y + Math.sin(a) * MOUTH.ry * r;
    const rock = jitterVertices(new IcosahedronGeometry(1, 0), 0.25, i * 1.3);
    const shade = random();
    parts.push(tint(place(rock, [x, y, MOUTH.z + 0.1], [random() * 3, random() * 3, random() * 3], [size, size * 0.8, size * 0.9]), shade < 0.5 ? "#5e6070" : "#7f6e5d", 0.15, i));
  }
  for (let i = 0; i < 14; i++) {
    const x = (random() < 0.5 ? -8 + random() * 5 : 4.5 + random() * 8), size = 0.5 + random() * 1.0;
    const rock = jitterVertices(new IcosahedronGeometry(1, 1), 0.22, i * 2.1);
    parts.push(tint(place(rock, [x, SEA_Y + size * 0.25, MOUTH.z + 0.3 + random() * 1.2], [0, random() * 3, 0], [size, size * 0.9, size]), "#4d5560", 0.15, i + 40));
  }
  return mergeGeometries(parts, false);
}

/** The inside of the cave: an unlit half-ellipsoid behind the opening, from dim violet at the rim to near black. */
export function hollowGeometry(): BufferGeometry {
  const g = new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  g.scale(MOUTH.rx * 1.04, MOUTH.ry * 1.04, 7);
  g.translate(MOUTH.x, MOUTH.y, MOUTH.z);
  const p = g.getAttribute("position");
  const colors = new Float32Array(p.count * 3);
  const rim = new Color("#2e2836"), deep = new Color("#0b0508");
  const c = new Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(rim).lerp(deep, smooth(0, 4.5, MOUTH.z - p.getZ(i)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return g;
}
