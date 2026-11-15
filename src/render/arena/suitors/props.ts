// The hall's story props: knocked-over feast tables and benches, spilt cups and food, the row of twelve axes, the great
// bow on its stone, the hearth's stone ring and the torch brackets. Built into one Solids like the shell.
import { BoxGeometry, CylinderGeometry, IcosahedronGeometry, LatheGeometry, TorusGeometry, Vector2 } from "three";
import { BENCHES, BOW, HEARTH, TABLES, TORCHES, axes, litter } from "./layout";
import type { Item, Table } from "./layout";
import { PAL } from "./hall";
import { Solids } from "./solids";

const box = new BoxGeometry(1, 1, 1);
const leg = new CylinderGeometry(0.06, 0.05, 1, 6);
const amphoraProfile = [[0.001, 0], [0.16, 0.02], [0.3, 0.3], [0.32, 0.55], [0.22, 0.78], [0.1, 0.9], [0.13, 1.0], [0.001, 1.0]].map(([x, y]) => new Vector2(x, y));
const amphora = new LatheGeometry(amphoraProfile, 8);
const cup = new CylinderGeometry(0.09, 0.055, 0.11, 7);
const apple = new IcosahedronGeometry(0.06, 0);
const loaf = new IcosahedronGeometry(0.13, 0);
const plate = new CylinderGeometry(0.17, 0.14, 0.025, 8);

function table(s: Solids, t: Table, top: string): void {
  // Built upright, 2.4 m by 1 m, then rolled about its long axis and turned.
  s.at([t.x, 0.45, t.z], [0, t.yaw, 0], () => {
    s.at([0, 0, 0], [t.roll, 0, 0], () => {
      s.add(box, top, [0, 0.45, 0], [0, 0, 0], [2.4, 0.1, 1.0]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.add(leg, PAL.darkWood, [sx * 1.0, 0, sz * 0.38], [0, 0, 0], [1, 0.9, 1]);
    });
  });
}

function bench(s: Solids, t: Table): void {
  s.at([t.x, 0.3, t.z], [0, t.yaw, 0], () => {
    s.at([0, 0, 0], [t.roll, 0, 0], () => {
      s.add(box, PAL.wood, [0, 0.2, 0], [0, 0, 0], [2.0, 0.08, 0.4]);
      for (const sx of [-0.8, 0.8]) s.add(box, PAL.darkWood, [sx, -0.05, 0], [0, 0, 0], [0.08, 0.5, 0.36]);
    });
  });
}

function item(s: Solids, it: Item): void {
  const k = it.scale;
  const rot = [0, it.yaw, 0] as const;
  if (it.kind === "amphora") {
    const lying = (Math.floor(it.x * 7) & 1) === 0;
    if (lying) s.at([it.x, 0.3 * k, it.z], [0, it.yaw, Math.PI / 2], () => s.add(amphora, "#a5532f", [0, -0.5 * k, 0], [0, 0, 0], [0.6 * k, 0.6 * k, 0.6 * k]));
    else s.add(amphora, "#a5532f", [it.x, 0, it.z], rot, [0.6 * k, 0.6 * k, 0.6 * k]);
  } else if (it.kind === "cup") s.add(cup, "#c9a24a", [it.x, 0.055, it.z], [0.3 * Math.sin(it.yaw), it.yaw, 0], [k, k, k]);
  else if (it.kind === "loaf") s.add(loaf, "#b9823f", [it.x, 0.07, it.z], rot, [1.2 * k, 0.55 * k, 0.8 * k]);
  else if (it.kind === "apple") s.add(apple, "#b3392b", [it.x, 0.06, it.z], rot, [k, k, k]);
  else if (it.kind === "bone") s.add(new CylinderGeometry(0.03, 0.03, 0.4 * k, 5), "#e5dcc6", [it.x, 0.04, it.z], [Math.PI / 2, it.yaw, 0]);
  else if (it.kind === "plate") s.add(plate, "#8a5a3a", [it.x, 0.015, it.z], rot, [k, k, k]);
  else for (let i = 0; i < 3; i++) s.add(apple, "#5b2a63", [it.x + 0.07 * i, 0.05, it.z + 0.04 * (i % 2)], rot, [0.7 * k, 0.7 * k, 0.7 * k]);
}

/** Axe with its helve in the floor, head at the top and the ring at the butt. */
function axe(s: Solids, x: number, z: number): void {
  s.add(new CylinderGeometry(0.022, 0.022, 1.05, 5), PAL.wood, [x, 0.5, z]);
  s.add(box, "#9ba3ad", [x, 0.98, z], [0, 0, 0], [0.04, 0.24, 0.3]);
  s.add(new TorusGeometry(0.05, 0.012, 4, 8), "#9ba3ad", [x, 0.0, z], [Math.PI / 2, 0, 0]);
  s.add(new TorusGeometry(0.05, 0.012, 4, 8), "#9ba3ad", [x, 1.05, z], [0, Math.PI / 2, 0]);
}

/** The great bow lying across a stone block, with a quiver of arrows beside it. */
function bow(s: Solids): void {
  s.add(box, PAL.stone, [BOW.x, 0.25, BOW.z], [0, 0.2, 0], [1.6, 0.5, 0.7]);
  s.at([BOW.x, 0.62, BOW.z], [0, 0.2, 0], () => {
    s.add(new TorusGeometry(0.85, 0.035, 5, 12, Math.PI), "#2e1b10", [0, 0, 0], [Math.PI / 2, 0, 0]);
    s.add(new CylinderGeometry(0.006, 0.006, 1.7, 3), "#d9d2bc", [0, 0.0, -0.0], [0, 0, Math.PI / 2], [1, 1, 1]);
  });
  s.add(new CylinderGeometry(0.1, 0.12, 0.8, 6), "#6a3d22", [BOW.x + 1.1, 0.4, BOW.z + 0.2], [0.1, 0, 0.12]);
  for (let i = 0; i < 4; i++) s.add(new CylinderGeometry(0.008, 0.008, 0.5, 3), "#e8dcc0", [BOW.x + 1.05 + i * 0.04, 0.95, BOW.z + 0.18], [0.1, 0, 0.12]);
}

function hearth(s: Solids): void {
  s.add(new CylinderGeometry(HEARTH.radius, HEARTH.radius + 0.15, 0.38, 12), "#7d6a52", [HEARTH.x, 0.19, HEARTH.z]);
  s.add(new CylinderGeometry(HEARTH.radius - 0.35, HEARTH.radius - 0.35, 0.4, 12), "#2a1d17", [HEARTH.x, 0.2, HEARTH.z]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    s.add(new CylinderGeometry(0.1, 0.12, 0.45, 5), "#463024", [HEARTH.x + Math.cos(a) * 0.5, 0.5, HEARTH.z + Math.sin(a) * 0.5], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    s.add(new IcosahedronGeometry(0.3, 0), "#8a7a64", [HEARTH.x + Math.cos(a) * (HEARTH.radius + 0.06), 0.38, HEARTH.z + Math.sin(a) * (HEARTH.radius + 0.06)], [a, a * 2, 0], [1, 0.7, 1]);
  }
}

export function propSolids(): Solids {
  const s = new Solids();
  TABLES.forEach((t, i) => { table(s, t, i % 2 === 0 ? "#8a5a30" : "#7b4d2a"); });
  BENCHES.forEach((t) => { bench(s, t); });
  litter().forEach((it) => { item(s, it); });
  axes().forEach(([x, , z]) => { axe(s, x, z); });
  bow(s);
  hearth(s);
  for (const t of TORCHES) s.add(new CylinderGeometry(0.05, 0.035, 0.7, 5), "#2a1a10", [t.x, t.y - 0.1, t.z]);
  return s;
}
