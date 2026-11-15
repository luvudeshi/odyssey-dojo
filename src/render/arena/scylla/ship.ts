// The black ship: planked deck with a pointed bow, rails, a mast with a furled sail, oars, hoplite shields on the rail,
// and a few story props. Deck top is y=0, the hero stands at z=+1.2. Everything merges into one geometry.
import { BufferGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry, TorusGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DECK, deckHalfWidth, mulberry } from "./layout";
import type { Vec3 } from "./layout";
import { box, place, tint } from "./solid";

const PI = Math.PI;
const PLANKS = ["#3d312b", "#33292a", "#463629", "#2d2526"];

function cylinder(r0: number, r1: number, h: number, position: Vec3, rotation: Vec3, color: string, sides = 7): BufferGeometry {
  return tint(place(new CylinderGeometry(r1, r0, h, sides), position, rotation), color, 0.1, position[2]);
}

function deck(): BufferGeometry[] {
  const random = mulberry(5);
  const parts: BufferGeometry[] = [];
  const width = 0.37;
  for (let x = -DECK.halfWidth; x < DECK.halfWidth - 0.01; x += width) {
    const cx = x + width / 2;
    // The first z (from the stern) where the deck is wide enough to hold this plank.
    let front: number = DECK.sternZ;
    for (let k = 0; k < 120; k++) {
      const z = DECK.sternZ - k * 0.1;
      if (deckHalfWidth(z) < Math.abs(cx) - 0.05) break;
      front = z;
    }
    const length = DECK.sternZ - front;
    parts.push(box([width - 0.03, 0.14, length], [cx, -0.07, front + length / 2], PLANKS[Math.floor(random() * PLANKS.length)] ?? "#3d312b", [0, 0, 0], 0.1));
  }
  // Cross beams show through the planking at the sides.
  for (let z = -4; z < DECK.sternZ; z += 1.7) {
    const half = deckHalfWidth(z);
    parts.push(box([half * 2 + 0.5, 0.2, 0.22], [0, -0.22, z], "#241d1d", [0, 0, 0], 0.08));
  }
  return parts;
}

function hull(): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(box([0.35, 1.7, DECK.sternZ + 1.8], [side * 3.55, -0.75, (DECK.sternZ - 1.8) / 2], "#1b1820", [0, 0, side * 0.3], 0.08));
    parts.push(box([0.2, 0.12, DECK.sternZ + 1.4], [side * 3.78, -0.28, (DECK.sternZ - 1.4) / 2], "#59422f", [0, 0, side * 0.3], 0.1));
    parts.push(box([0.2, 0.12, DECK.sternZ + 1.4], [side * 3.62, -0.92, (DECK.sternZ - 1.4) / 2], "#59422f", [0, 0, side * 0.3], 0.1));
    // Rail, posts and the bow's slanted rail.
    parts.push(box([0.16, 0.14, DECK.sternZ + 1.5], [side * 3.4, 0.98, (DECK.sternZ - 1.5) / 2], "#2a2024", [0, 0, 0], 0.08));
    for (let z = -1; z < DECK.sternZ; z += 1.5) parts.push(box([0.12, 1, 0.12], [side * 3.4, 0.5, z], "#2a2024", [0, 0, 0], 0.08));
    parts.push(box([0.16, 0.14, 4.4], [side * 1.95, 0.98, -3.7], "#2a2024", [0, side * 0.34, 0], 0.08));
    parts.push(box([0.35, 1.2, 4.6], [side * 1.85, -0.4, -3.7], "#1b1820", [0, side * 0.34, side * 0.25], 0.08));
  }
  parts.push(box([0.5, 1.6, 0.5], [0, -0.7, DECK.bowZ + 0.3], "#1b1820", [0.2, 0, 0], 0.08));
  // The stem post curls up from the bow; a bronze eye and a lantern hang on it.
  parts.push(box([0.3, 1.9, 0.3], [0, 0.85, DECK.bowZ - 0.1], "#241d1d", [-0.25, 0, 0], 0.08));
  parts.push(box([0.26, 0.9, 0.26], [0, 1.9, DECK.bowZ - 0.6], "#241d1d", [-0.95, 0, 0], 0.08));
  parts.push(tint(place(new IcosahedronGeometry(0.17, 0), [0, 2.1, DECK.bowZ - 1.02]), "#a8742f", 0.1));
  return parts;
}

function rigging(): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const mast: Vec3 = [-3.0, 0, -0.8];
  parts.push(cylinder(0.2, 0.14, 6.2, [mast[0], 3.1, mast[2]], [0, 0, 0], "#4a3a30"));
  parts.push(cylinder(0.11, 0.11, 4.6, [mast[0], 5.3, mast[2]], [0, 0, PI / 2], "#4a3a30"));
  parts.push(cylinder(0.3, 0.3, 4.0, [mast[0], 5.05, mast[2]], [0, 0, PI / 2], "#b49b78", 8));
  // Oars: five a side, dipping into the water, blades flat.
  const random = mulberry(9);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const z = -1.6 + k * 1.5, tilt = PI / 2 - (0.3 + random() * 0.14);
      const ux = side * Math.sin(tilt), uy = -Math.cos(tilt);
      parts.push(cylinder(0.06, 0.05, 5.6, [side * 3.4 + ux * 1.6, 0.95 + uy * 1.6, z], [0, 0, side * tilt], "#6a5340", 5));
      parts.push(box([0.95, 0.05, 0.26], [side * 3.4 + ux * 4.3, 0.95 + uy * 4.3, z], "#5b4636", [0, 0, side * (tilt - PI / 2)], 0.1));
    }
  }
  return parts;
}

function props(): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const rims = ["#8f2d25", "#1b1b1f", "#b08a3a", "#2c4a72"];
  for (const side of [-1, 1]) {
    // Hoplite shields hung on the rail's outside.
    for (let k = 0; k < 6; k++) {
      const z = 0.4 + k * 1.2;
      parts.push(cylinder(0.5, 0.5, 0.06, [side * 3.62, 0.5, z], [0, 0, PI / 2], "#9a6a2e", 12));
      parts.push(cylinder(0.42, 0.42, 0.09, [side * 3.67, 0.5, z], [0, 0, PI / 2], rims[(k + (side > 0 ? 1 : 0)) % rims.length] ?? "#1b1b1f", 12));
    }
  }
  // Jars, a chest, a coil of rope and spears leaning on the mast.
  for (const [x, z, r] of [[2.7, 1.9, 0.3], [2.75, 2.5, 0.26], [-2.7, 3.1, 0.28]] as const) {
    parts.push(tint(place(new SphereGeometry(r, 7, 5), [x, r * 1.15, z], [0, 0, 0], [1, 1.3, 1]), "#a8693d", 0.12, x));
    parts.push(cylinder(r * 0.4, r * 0.55, 0.25, [x, r * 2.5, z], [0, 0, 0], "#8a5330"));
  }
  parts.push(box([0.9, 0.5, 0.55], [-2.55, 0.25, 2.2], "#4d3a2c", [0, 0.15, 0], 0.1));
  parts.push(tint(place(new TorusGeometry(0.34, 0.1, 5, 9), [2.1, 0.1, -1.7], [PI / 2, 0, 0]), "#8a7656", 0.12));
  for (let k = 0; k < 3; k++) parts.push(cylinder(0.025, 0.025, 3.6, [-2.6 + k * 0.1, 1.8, -0.4 + k * 0.08], [0.04 * k, 0, -0.08], "#6a5340", 4));
  return parts;
}

export function shipGeometry(): BufferGeometry {
  return mergeGeometries([...deck(), ...hull(), ...rigging(), ...props()], false);
}
