// One of Scylla's heads, built from flat-shaded wedges: a skull with horns and a frill, a hinged lower jaw, and three
// rows of teeth on each jaw (two along the edges, one down the middle). +z is the snout, the neck joins at the origin.
// The jaw's origin is its hinge. Skin colour is baked per phase, so the look changes without any shader.
import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, place, tint } from "../../arena/scylla/solid";

const TEETH = "#efe6cc";
const LENGTH = 1.5;

/** Teeth along a jaw: `down` hangs from the skull, otherwise they stand up from the jaw. */
function teeth(down: boolean, y: number, z0: number): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const radiusAt = (z: number): number => 0.42 + (0.17 - 0.42) * (z / LENGTH);
  for (let k = 0; k < 7; k++) {
    const z = z0 + k * 0.17;
    const size = 0.16 - k * 0.012;
    const cone = new ConeGeometry(0.045, size, 4);
    if (down) cone.rotateX(Math.PI);
    for (const x of [-1, 1]) parts.push(tint(place(cone.clone(), [x * radiusAt(z) * 0.82, y, z]), TEETH, 0.05, k));
    if (k % 2 === 0 && k < 6) parts.push(tint(place(cone.clone(), [0, y, z + 0.05], [0, 0, 0], [0.8, 0.8, 0.8]), TEETH, 0.05, k + 9));
  }
  return parts;
}

function frustum(top: number, bottom: number, length: number, flatten: number): BufferGeometry {
  const g = new CylinderGeometry(top, bottom, length, 6);
  g.rotateX(Math.PI / 2);
  g.rotateZ(Math.PI / 6);
  g.scale(1, flatten, 1);
  g.translate(0, 0, length / 2);
  return g;
}

export interface HeadGeometry { skull: BufferGeometry; jaw: BufferGeometry; eyes: BufferGeometry }

export function buildHead(skin: Color, belly: Color): HeadGeometry {
  const skullParts: BufferGeometry[] = [
    tint(place(frustum(0.17, 0.42, LENGTH, 0.62), [0, 0.1, 0]), skin, 0.1, 1),
    tint(place(new ConeGeometry(0.09, 0.6, 5), [0.3, 0.32, 0.15], [-0.9, 0, -0.6]), "#d8caa8", 0.08, 2),
    tint(place(new ConeGeometry(0.09, 0.6, 5), [-0.3, 0.32, 0.15], [-0.9, 0, 0.6]), "#d8caa8", 0.08, 3),
    tint(place(new ConeGeometry(0.1, 0.5, 4), [0, 0.38, 0.18], [-1.1, 0, 0]), belly, 0.08, 4),
    tint(place(new ConeGeometry(0.08, 0.4, 4), [0, 0.3, 0.42], [-0.75, 0, 0]), belly, 0.08, 5),
    box([0.2, 0.07, 0.34], [0.2, 0.26, 0.82], skin.getStyle(), [0, -0.3, 0.1], 0.1),
    box([0.2, 0.07, 0.34], [-0.2, 0.26, 0.82], skin.getStyle(), [0, 0.3, -0.1], 0.1),
    box([0.34, 0.03, 1.0], [0, -0.08, 0.7], "#7a1f2c", [0, 0, 0], 0.08),
    ...teeth(true, -0.1, 0.4),
  ];
  const jawParts: BufferGeometry[] = [
    tint(place(frustum(0.14, 0.34, LENGTH * 0.86, 0.4), [0, -0.05, 0.06]), belly, 0.1, 6),
    box([0.3, 0.03, 0.8], [0, 0.07, 0.65], "#c2485a", [0, 0, 0], 0.08),
    ...teeth(false, 0.1, 0.34),
  ];
  const eye = (x: number): BufferGeometry => place(new IcosahedronGeometry(0.075, 0), [x, 0.3, 0.7], [0, 0, 0], [1, 1, 1.3]);
  return {
    skull: mergeGeometries(skullParts, false),
    jaw: mergeGeometries(jawParts, false),
    eyes: mergeGeometries([eye(0.24), eye(-0.24)].map((g) => g.toNonIndexed()), false),
  };
}
