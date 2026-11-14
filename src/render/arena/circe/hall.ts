// Circe's hall: a polished stone courtyard with a crimson carpet, a columned portico with a pediment, the great loom
// and the table of cups in the two bays you can see through. Metres; the fighters stand on the carpet near z=0 and
// z=-4, the portico steps sit at z=-7 and the back wall at z=-12.
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, PlaneGeometry, Shape } from "three";
import type { BufferGeometry } from "three";
import { merge, paint, place } from "./kit";

export const COLUMN_X: readonly number[] = [-8.9, -5.9, -2.9, 2.9, 5.9, 8.9];
export const COLUMN_Z = -8.6;
export const PLATFORM_Y = 0.45;
/** The courtyard is this many 1.5 m tiles wide; the grass starts beyond it. */
export const APRON_TILES = 7;
export const GRASS_Y = -0.12;
export const LOOM_AT = { x: -4.4, z: -10.2 } as const;
export const TABLE_AT = { x: 4.4, z: -10.0 } as const;

const box = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d);

/** The courtyard slab: marble tiles in two tones, a crimson carpet with gold edges, and the stone under it. */
export function floorGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const size = 1.5;
  for (let i = 0; i < APRON_TILES; i++) {
    for (let j = 0; j < 18; j++) {
      const tile = new PlaneGeometry(size - 0.04, size - 0.04).rotateX(-Math.PI / 2);
      const x = -(APRON_TILES * size) / 2 + size * (i + 0.5);
      const z = -16.5 + size * (j + 0.5);
      parts.push(place(paint(tile, (i + j) % 2 === 0 ? "#dccfb8" : "#bfae92", 0.025, i * 31 + j), [x, 0.004, z]));
    }
  }
  parts.push(place(paint(box(APRON_TILES * size, 0.3, 27), "#a89880", 0.02, 5), [0, -0.155, -3]));
  const carpet = new PlaneGeometry(2.7, 24).rotateX(-Math.PI / 2);
  parts.push(place(paint(carpet, "#a3132b", 0.03, 7), [0, 0.014, -4.5]));
  for (const x of [-1.3, 1.3]) parts.push(place(paint(new PlaneGeometry(0.16, 24).rotateX(-Math.PI / 2), "#e6b84a", 0.02, 9), [x, 0.02, -4.5]));
  return merge(parts);
}

function column(x: number, z: number, seed: number): BufferGeometry[] {
  const y0 = PLATFORM_Y;
  return [
    place(paint(box(1.55, 0.25, 1.55), "#e9dcc3", 0.03, seed), [x, y0 + 0.125, z]),
    place(paint(new CylinderGeometry(0.5, 0.62, 5.3, 10), "#efe3cb", 0.035, seed + 1), [x, y0 + 0.25 + 2.65, z]),
    place(paint(new CylinderGeometry(0.86, 0.52, 0.3, 10), "#e9dcc3", 0.03, seed + 2), [x, y0 + 5.7, z]),
    place(paint(box(1.7, 0.22, 1.7), "#e3d4ba", 0.03, seed + 3), [x, y0 + 5.96, z]),
  ];
}

function pediment(): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-10.9, 0);
  shape.lineTo(10.9, 0);
  shape.lineTo(0, 2.6);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false });
  return place(paint(geometry, "#2f7a80", 0.03, 21), [0, 7.9, COLUMN_Z - 0.2]);
}

function loom(): BufferGeometry[] {
  const { x, z } = LOOM_AT;
  const y = PLATFORM_Y;
  const parts: BufferGeometry[] = [];
  for (const dx of [-1.15, 1.15]) parts.push(place(paint(box(0.2, 3.7, 0.2), "#6b4527", 0.04, 31), [x + dx, y + 1.85, z]));
  parts.push(place(paint(box(2.7, 0.2, 0.22), "#7a4f2b", 0.04, 32), [x, y + 3.65, z]));
  parts.push(place(paint(box(2.5, 0.16, 0.2), "#7a4f2b", 0.04, 33), [x, y + 0.55, z]));
  for (let i = 0; i < 15; i++) parts.push(place(paint(box(0.025, 2.7, 0.025), "#efe6d2", 0.03, 40 + i), [x - 1.0 + i * 0.143, y + 2.0, z + 0.05]));
  parts.push(place(paint(box(2.05, 1.25, 0.05), "#a5203c", 0.06, 60), [x, y + 1.25, z + 0.02]));
  parts.push(place(paint(box(2.05, 0.2, 0.06), "#e6b84a", 0.03, 61), [x, y + 1.35, z + 0.03]));
  parts.push(place(paint(box(2.05, 0.1, 0.06), "#2f7a80", 0.03, 62), [x, y + 1.7, z + 0.03]));
  parts.push(place(paint(box(0.9, 0.12, 0.5), "#6b4527", 0.04, 63), [x + 0.2, y + 0.45, z + 0.9]));
  return parts;
}

function table(): BufferGeometry[] {
  const { x, z } = TABLE_AT;
  const y = PLATFORM_Y;
  const parts: BufferGeometry[] = [];
  parts.push(place(paint(box(2.6, 0.1, 1.0), "#7a4f2b", 0.04, 70), [x, y + 1.0, z]));
  parts.push(place(paint(box(2.7, 0.04, 1.1), "#a5203c", 0.05, 71), [x, y + 1.07, z]));
  for (const [dx, dz] of [[-1.15, -0.4], [1.15, -0.4], [-1.15, 0.4], [1.15, 0.4]] as const) {
    parts.push(place(paint(box(0.12, 1.0, 0.12), "#6b4527", 0.04, 72), [x + dx, y + 0.5, z + dz]));
  }
  for (const [i, dx] of [-0.9, -0.45, 0.0, 0.6].entries()) {
    parts.push(place(paint(new CylinderGeometry(0.1, 0.05, 0.3, 6), "#e8c04a", 0.05, 80 + i), [x + dx, y + 1.24, z + 0.2]));
  }
  parts.push(place(paint(new CylinderGeometry(0.28, 0.16, 0.6, 7), "#b8552e", 0.05, 90), [x + 0.95, y + 1.4, z - 0.15]));
  parts.push(place(paint(new CylinderGeometry(0.26, 0.12, 0.2, 7), "#e8c04a", 0.05, 91), [x + 0.5, y + 1.19, z - 0.1]));
  return parts;
}

/** Everything solid in and around the portico. */
export function hallGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(place(paint(box(21.5, PLATFORM_Y - GRASS_Y, 5.2), "#b9a98d", 0.03, 1), [0, (PLATFORM_Y + GRASS_Y) / 2, -9.6]));
  parts.push(place(paint(box(7, 0.16, 0.5), "#c9b99d", 0.03, 2), [0, 0.08, -6.75]));
  parts.push(place(paint(box(7.4, 0.3, 0.45), "#cbbb9f", 0.03, 3), [0, 0.15, -7.2]));
  COLUMN_X.forEach((x, i) => { parts.push(...column(x, COLUMN_Z, 100 + i * 7)); });
  parts.push(place(paint(box(22, 0.85, 1.3), "#e6d8bd", 0.03, 10), [0, 6.45, COLUMN_Z]));
  parts.push(place(paint(box(22, 0.6, 1.1), "#b8552e", 0.04, 11), [0, 7.2, COLUMN_Z - 0.05]));
  for (let i = 0; i < 21; i++) parts.push(place(paint(box(0.3, 0.6, 0.12), "#3b2a3a", 0.03, 120 + i), [-10 + i, 7.2, COLUMN_Z + 0.55]));
  parts.push(place(paint(box(22.4, 0.3, 1.5), "#ead9bb", 0.03, 12), [0, 7.65, COLUMN_Z]));
  parts.push(pediment());
  parts.push(place(paint(box(22, 7, 0.7), "#7d5a50", 0.04, 13), [0, PLATFORM_Y + 3.5, -12.2]));
  for (const x of [-1.55, 1.55]) parts.push(place(paint(box(0.3, 4, 0.5), "#3e2c3a", 0.03, 14), [x, PLATFORM_Y + 2.0, -11.8]));
  parts.push(place(paint(box(3.4, 0.35, 0.5), "#3e2c3a", 0.03, 15), [0, PLATFORM_Y + 4.1, -11.8]));
  parts.push(...loom(), ...table());
  return merge(parts);
}

/** Lit surfaces that are drawn unshaded: the doorway's glow and the green wine in the cups. */
export function glowGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(place(paint(new PlaneGeometry(2.8, 3.9), "#ffb35c", 0.04, 200), [0, PLATFORM_Y + 1.95, -11.8]));
  const { x, z } = TABLE_AT;
  for (const dx of [-0.9, -0.45, 0.0, 0.6]) {
    parts.push(place(paint(new PlaneGeometry(0.17, 0.17).rotateX(-Math.PI / 2), "#7dffb0", 0.01, 201), [x + dx, PLATFORM_Y + 1.38, z + 0.2]));
  }
  return merge(parts);
}
