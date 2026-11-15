// The megaron's shell: stone floor, painted plaster walls with a frieze, two doorways, a timber ceiling and the
// tall red columns of a Mycenaean hall (wider at the top than the foot). All of it goes into one Solids.
import { BoxGeometry, CylinderGeometry, ConeGeometry } from "three";
import { BACK_DOOR, COURT_DOOR, HALL, columns, mulberry } from "./layout";
import { Solids } from "./solids";

export const PAL = {
  plaster: "#c4a47e",
  plasterShade: "#bf9a6c",
  dado: "#7d3629",
  red: "#a8402f",
  blue: "#26407a",
  ochre: "#dcab4f",
  wood: "#6a4326",
  darkWood: "#46291a",
  stone: "#8a7458",
  night: "#10162b",
} as const;

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 10);

/** A box from corner to corner, so walls read as numbers. */
function slab(s: Solids, x1: number, x2: number, y1: number, y2: number, z1: number, z2: number, color: string): void {
  s.add(box, color, [(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2], [0, 0, 0], [x2 - x1, y2 - y1, z2 - z1]);
}

function floor(s: Solids): void {
  const random = mulberry(3);
  const tile = new BoxGeometry(1.04, 0.1, 1.04);
  const tones = ["#6e5d52", "#625248", "#78665a", "#5f5049"];
  for (let x = HALL.minX + 0.55; x < HALL.maxX; x += 1.1) {
    for (let z = HALL.minZ + 0.55; z < HALL.maxZ; z += 1.1) {
      s.add(tile, tones[Math.floor(random() * tones.length)] ?? "#8c7557", [x, -0.05 + random() * 0.012, z]);
    }
  }
  // The grout shows as this darker slab under the tiles.
  slab(s, HALL.minX, HALL.maxX, -0.3, -0.07, HALL.minZ, HALL.maxZ, "#3a2c20");
}

/** A wall along z at x, with an optional doorway. Thickness goes outward. */
function sideWall(s: Solids, x: number, outward: 1 | -1, door: boolean): void {
  const near = x;
  const far = x + outward * 0.7;
  const [a, b] = near < far ? [near, far] : [far, near];
  const wall = (z1: number, z2: number, y1: number, y2: number): void => {
    slab(s, a, b, y1, y2, z1, z2, PAL.plaster);
    if (y1 === 0) slab(s, near < far ? a : a + 0.02, near < far ? b - 0.02 : b, 0, 1.1, z1, z2, PAL.dado);
  };
  if (door) {
    const lo = COURT_DOOR.z - COURT_DOOR.halfWidth;
    const hi = COURT_DOOR.z + COURT_DOOR.halfWidth;
    wall(HALL.minZ, lo, 0, HALL.ceiling);
    wall(hi, HALL.maxZ, 0, HALL.ceiling);
    wall(lo, hi, COURT_DOOR.height, HALL.ceiling);
    for (const z of [lo, hi]) slab(s, a - 0.05, b + 0.05, 0, COURT_DOOR.height, z - 0.12, z + 0.12, PAL.darkWood);
    slab(s, a - 0.05, b + 0.05, COURT_DOOR.height - 0.2, COURT_DOOR.height + 0.15, lo, hi, PAL.darkWood);
  } else wall(HALL.minZ, HALL.maxZ, 0, HALL.ceiling);
  // The painted frieze: alternating red and blue blocks under a gold line, along the inside face.
  const face = outward === 1 ? near - 0.02 : near + 0.02;
  for (let z = HALL.minZ + 0.5; z < HALL.maxZ; z += 1.0) {
    const inDoor = door && Math.abs(z - COURT_DOOR.z) < COURT_DOOR.halfWidth;
    if (inDoor) continue;
    const red = Math.round((z - HALL.minZ) / 1.0) % 2 === 0;
    slab(s, face - 0.04, face + 0.04, 5.7, 6.3, z - 0.46, z + 0.46, red ? PAL.red : PAL.blue);
  }
  slab(s, face - 0.05, face + 0.05, 6.3, 6.42, HALL.minZ, HALL.maxZ, PAL.ochre);
  slab(s, face - 0.05, face + 0.05, 5.6, 5.7, HALL.minZ, HALL.maxZ, PAL.ochre);
}

function backWall(s: Solids): void {
  const z1 = HALL.minZ - 0.7;
  const z2 = HALL.minZ;
  const lo = BACK_DOOR.x - BACK_DOOR.halfWidth;
  const hi = BACK_DOOR.x + BACK_DOOR.halfWidth;
  slab(s, HALL.minX - 0.7, lo, 0, HALL.ceiling, z1, z2, PAL.plaster);
  slab(s, hi, HALL.maxX + 0.7, 0, HALL.ceiling, z1, z2, PAL.plaster);
  slab(s, lo, hi, BACK_DOOR.height, HALL.ceiling, z1, z2, PAL.plaster);
  slab(s, HALL.minX, lo, 0, 1.1, z2 - 0.05, z2, PAL.dado);
  slab(s, hi, HALL.maxX, 0, 1.1, z2 - 0.05, z2, PAL.dado);
  for (let x = HALL.minX + 0.5; x < HALL.maxX; x += 1.0) {
    const red = Math.round((x - HALL.minX) / 1.0) % 2 === 0;
    slab(s, x - 0.46, x + 0.46, 5.7, 6.3, z2 - 0.1, z2 - 0.02, red ? PAL.red : PAL.blue);
  }
  slab(s, HALL.minX, HALL.maxX, 6.3, 6.42, z2 - 0.11, z2 - 0.02, PAL.ochre);
  // The storeroom beyond the great door: a dark box, the door posts and a heavy lintel.
  slab(s, lo, hi, 0, BACK_DOOR.height, z1 - 3, z1 + 0.1, "#0b0708");
  for (const x of [lo, hi]) slab(s, x - 0.14, x + 0.14, 0, BACK_DOOR.height, z2 - 0.2, z2 + 0.05, PAL.darkWood);
  slab(s, lo - 0.2, hi + 0.2, BACK_DOOR.height - 0.2, BACK_DOOR.height + 0.2, z2 - 0.2, z2 + 0.05, PAL.darkWood);
}

function ceiling(s: Solids): void {
  slab(s, HALL.minX, HALL.maxX, HALL.ceiling, HALL.ceiling + 0.3, HALL.minZ, HALL.maxZ, PAL.darkWood);
  for (let z = HALL.minZ + 1.5; z < HALL.maxZ; z += 3) slab(s, HALL.minX, HALL.maxX, HALL.ceiling - 0.45, HALL.ceiling, z - 0.2, z + 0.2, PAL.wood);
  for (const x of [-4.4, 4.4]) slab(s, x - 0.22, x + 0.22, HALL.ceiling - 0.6, HALL.ceiling, HALL.minZ, HALL.maxZ, PAL.wood);
}

/** A Mycenaean column: foot narrower than head, dark bands, a flared capital and a square abacus. */
function column(s: Solids, x: number, z: number, height: number, r: number): void {
  s.add(box, PAL.stone, [x, 0.12, z], [0, 0, 0], [r * 2.8, 0.24, r * 2.8]);
  const shaft = new CylinderGeometry(r * 1.12, r * 0.8, height, 10);
  s.add(shaft, PAL.red, [x, height / 2, z]);
  for (const t of [0.12, 0.2, 0.8, 0.88]) {
    const rr = r * (0.8 + 0.32 * t) + 0.015;
    s.add(new CylinderGeometry(rr, rr, 0.09, 10), PAL.blue, [x, height * t, z]);
  }
  s.add(new CylinderGeometry(r * 1.7, r * 1.15, 0.35, 10), PAL.ochre, [x, height + 0.02, z]);
  s.add(box, PAL.blue, [x, height + 0.3, z], [0, 0, 0], [r * 3.4, 0.16, r * 3.4]);
}

export function hallSolids(): Solids {
  const s = new Solids();
  floor(s);
  sideWall(s, HALL.minX, -1, true);
  sideWall(s, HALL.maxX, 1, false);
  backWall(s);
  slab(s, HALL.minX, HALL.maxX, 0, HALL.ceiling, HALL.maxZ, HALL.maxZ + 0.7, PAL.plaster);
  ceiling(s);
  for (const c of columns()) column(s, c.x, c.z, c.height, c.radius);
  courtyard(s);
  return s;
}

/** What shows through the doorway: dark paving, two cypresses and a low wall. */
function courtyard(s: Solids): void {
  slab(s, HALL.minX - 8, HALL.minX, -0.3, 0, COURT_DOOR.z - 7, COURT_DOOR.z + 7, "#2a2a36");
  slab(s, HALL.minX - 8, HALL.minX - 7.5, 0, 1.2, COURT_DOOR.z - 7, COURT_DOOR.z + 7, "#4a4658");
  for (const [x, z, h] of [[-14.5, COURT_DOOR.z - 2.2, 5], [-13.5, COURT_DOOR.z + 2.8, 4]] as const) {
    s.add(new ConeGeometry(0.9, h, 6), "#17302a", [x, h / 2, z]);
    s.add(cyl, "#3a2a1e", [x, 0.3, z], [0, 0, 0], [0.12, 0.6, 0.12]);
  }
}
