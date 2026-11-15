// Flat-shaded, vertex-coloured low-poly shapes for the strait's solids, merged into a few draw calls.
import {
  BoxGeometry, BufferGeometry, CatmullRomCurve3, Color, ConeGeometry, CylinderGeometry, Euler, Float32BufferAttribute,
  IcosahedronGeometry, Matrix4, Quaternion, TubeGeometry, Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry, noise2 } from "../cave/mouthLayout";
import { CLIFF, ROCK, SEA_Y, driftwood } from "./layout";
import type { Drift } from "./layout";

type V3 = readonly [number, number, number];

/** One flat colour per triangle, between `a` and `b` as `pick` says for the triangle's centre. */
export function paint(geometry: BufferGeometry, a: Color, b: Color, pick: (x: number, y: number, z: number, i: number) => number): BufferGeometry {
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

/** Moves each vertex along its distance from the origin; corners that share a position move together. */
export function jitter(geometry: BufferGeometry, amount: number, seed: number): BufferGeometry {
  const position = geometry.getAttribute("position");
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const key = noise2(Math.round(v.x * 40) * 0.37 + seed, Math.round(v.y * 40) * 0.53 + Math.round(v.z * 40) * 0.29);
    v.multiplyScalar(1 + (key - 0.5) * 2 * amount);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  return geometry;
}

export const place = (geometry: BufferGeometry, position: V3, scale: V3 = [1, 1, 1], rotation: V3 = [0, 0, 0]): BufferGeometry =>
  geometry.applyMatrix4(
    new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...scale)),
  );

const WOOD_DARK = new Color("#2b1d17");
const WOOD_LIGHT = new Color("#7a5a3e");
const ROPE = new Color("#a58a5c");

function timber(parts: BufferGeometry[], geometry: BufferGeometry, seed: number, dark = WOOD_DARK, light = WOOD_LIGHT): void {
  parts.push(paint(jitter(geometry, 0.03, seed), dark, light, (_x, _y, _z, i) => 0.15 + noise2(i * 0.8, seed) * 0.7));
}

/** The raft: the ship's keel and her mast lashed side by side, with broken deck planks across them. Deck top is y=0. */
export function raftGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const length = 3.9;
  // Keel on the left: a squared beam with the stubs of ribs, one end curving up.
  timber(parts, place(new BoxGeometry(0.55, 0.42, length, 1, 1, 6), [-1.45, -0.12, 0]), 1);
  timber(parts, place(new BoxGeometry(0.5, 0.4, 1.3), [-1.45, 0.12, -2.1], [1, 1, 1], [0.5, 0, 0]), 2);
  for (let i = 0; i < 5; i++) {
    timber(parts, place(new BoxGeometry(0.16, 0.5, 0.18), [-1.45 + (i % 2 === 0 ? 0.3 : -0.3), 0.2, -1.2 + i * 0.7]), 10 + i);
  }
  // Mast on the right: a round trunk with a splintered end and a rag of sail.
  timber(parts, place(new CylinderGeometry(0.24, 0.3, length, 7, 5).rotateX(Math.PI / 2), [1.45, -0.05, 0]), 3, new Color("#1a110d"), new Color("#4a3626"));
  timber(parts, place(new ConeGeometry(0.28, 0.5, 5).rotateX(-Math.PI / 2), [1.45, -0.05, -2.2]), 4);
  // Deck planks across both, a little uneven so they read as salvage.
  const random = mulberry(9);
  for (let i = 0; i < 9; i++) {
    const z = -1.7 + i * 0.5 + (random() - 0.5) * 0.08;
    const half = 1.9 + random() * 0.45;
    timber(parts, place(new BoxGeometry(half * 2, 0.13, 0.4), [(random() - 0.5) * 0.3, -0.065 - random() * 0.012, z], [1, 1, 1], [0, (random() - 0.5) * 0.05, 0]), 20 + i, new Color("#3b281d"), new Color("#8a6948"));
  }
  // Lashings where the planks cross the timbers.
  for (const z of [-1.0, 0.5, 1.8]) {
    for (const x of [-1.45, 1.45]) {
      parts.push(paint(new CylinderGeometry(0.3, 0.3, 0.12, 7), ROPE, ROPE, () => 0).applyMatrix4(
        new Matrix4().makeTranslation(x, 0.02, z - 0.0).multiply(new Matrix4().makeRotationX(Math.PI / 2)),
      ));
    }
  }
  return mergeGeometries(parts);
}

/** A piece of floating wreckage, lying flat with its origin on the water. */
export function driftGeometry(drift: Drift, index: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  if (drift.kind === "barrel") {
    timber(parts, new CylinderGeometry(0.34, 0.34, drift.length, 8).rotateZ(Math.PI / 2), index, new Color("#3a2a1f"), new Color("#9a7447"));
    parts.push(paint(new CylinderGeometry(0.36, 0.36, 0.07, 8).rotateZ(Math.PI / 2).translate(0, 0, 0), ROPE, ROPE, () => 0));
  } else if (drift.kind === "oar") {
    timber(parts, new CylinderGeometry(0.05, 0.06, drift.length, 5).rotateZ(Math.PI / 2), index);
    timber(parts, new BoxGeometry(0.5, 0.04, 0.3).translate(drift.length / 2 - 0.2, 0, 0), index + 1);
  } else {
    const thick = drift.kind === "beam" ? 0.32 : 0.1;
    timber(parts, jitter(new BoxGeometry(drift.length, thick, drift.kind === "beam" ? 0.34 : 0.36, 3, 1, 1), 0.06, index), index);
  }
  return mergeGeometries(parts);
}

export function driftGeometries(): BufferGeometry[] {
  return driftwood().map((drift, index) => place(driftGeometry(drift, index), drift.position, [1, 1, 1], [0, drift.yaw, 0]));
}

const ROCK_DARK = new Color("#231f2e");
const ROCK_LIGHT = new Color("#6d5a5a");

/** The low rock and the fig tree that leans over the water, as two merged meshes' worth of geometry. */
export function rockGeometry(): BufferGeometry {
  const random = mulberry(31);
  const parts: BufferGeometry[] = [];
  const blobs = 9;
  for (let i = 0; i < blobs; i++) {
    const angle = (i / blobs) * Math.PI * 2;
    const reach = i === 0 ? 0 : ROCK.radius * (0.45 + random() * 0.3);
    const size = i === 0 ? ROCK.radius * 0.95 : ROCK.radius * (0.42 + random() * 0.25);
    const geometry = jitter(new IcosahedronGeometry(1, 1), 0.2, i * 3.1);
    place(geometry, [ROCK.x + Math.cos(angle) * reach, SEA_Y + size * 0.28, ROCK.z + Math.sin(angle) * reach * 0.85], [size, size * 0.62, size * 0.9], [random(), random() * 3, random()]);
    parts.push(paint(geometry, ROCK_DARK, ROCK_LIGHT, (_x, y, _z, k) => (y - SEA_Y) * 0.22 + noise2(k * 0.6, i) * 0.4));
  }
  return mergeGeometries(parts);
}

const LEAF_DARK = new Color("#1f3a22");
const LEAF_LIGHT = new Color("#7c9a3c");
const BARK_DARK = new Color("#2a2019");
const BARK_LIGHT = new Color("#6a5645");

/** The fig tree: a gnarled trunk that rises from the rock and leans out over the water, with a dense low-poly crown. */
export function treeGeometry(): BufferGeometry {
  const random = mulberry(17);
  const base = new Vector3(ROCK.x + 0.4, SEA_Y + ROCK.height * 0.8, ROCK.z + 0.2);
  const trunk = new CatmullRomCurve3([
    base.clone(),
    base.clone().add(new Vector3(0.7, 1.8, 0.3)),
    base.clone().add(new Vector3(2.4, 3.4, 0.9)),
    base.clone().add(new Vector3(4.6, 4.4, 1.5)),
  ]);
  const parts: BufferGeometry[] = [];
  const bark = (geometry: BufferGeometry, seed: number): void => {
    parts.push(paint(jitter(geometry, 0.06, seed), BARK_DARK, BARK_LIGHT, (_x, y, _z, i) => 0.2 + (y - base.y) * 0.04 + noise2(i, seed) * 0.4));
  };
  bark(new TubeGeometry(trunk, 10, 0.5, 6, false), 1);
  bark(new ConeGeometry(0.95, 1.4, 6).translate(base.x, base.y - 0.1, base.z), 2);
  const limbs: V3[] = [[-2.2, 3.2, -0.6], [1.4, 4.4, -1.8], [3.4, 2.4, 2.2]];
  limbs.forEach((offset, index) => {
    const start = trunk.getPoint(0.55 + index * 0.12);
    const end = start.clone().add(new Vector3(...offset).multiplyScalar(0.7));
    const mid = start.clone().lerp(end, 0.5).add(new Vector3(0, 0.5, 0));
    bark(new TubeGeometry(new CatmullRomCurve3([start, mid, end]), 6, 0.2, 5, false), 5 + index);
  });
  // The crown: clustered, squashed blobs of leaf along the upper trunk and the limbs.
  const centres: Vector3[] = [trunk.getPoint(1), trunk.getPoint(0.8), trunk.getPoint(0.65)];
  limbs.forEach((offset, index) => {
    centres.push(trunk.getPoint(0.55 + index * 0.12).add(new Vector3(...offset).multiplyScalar(0.7)));
  });
  centres.forEach((centre, c) => {
    for (let i = 0; i < 4; i++) {
      const size = 1 + random() * 0.8;
      const geometry = jitter(new IcosahedronGeometry(1, 1), 0.28, c * 7 + i);
      place(geometry, [centre.x + (random() - 0.5) * 2.2, centre.y + 0.6 + (random() - 0.4) * 1.6, centre.z + (random() - 0.5) * 2.2], [size * 1.25, size * 0.78, size * 1.25], [random(), random(), random()]);
      parts.push(paint(geometry, LEAF_DARK, LEAF_LIGHT, (_x, y, _z, k) => (y - base.y) * 0.1 + noise2(k * 0.5, c + i) * 0.45));
    }
  });
  return mergeGeometries(parts);
}

const CLIFF_DARK = new Color("#1b1626");
const CLIFF_LIGHT = new Color("#54404f");

/** Scylla's cliff, a far-off wall of stacked jagged blocks with a black cave in its face. */
export function cliffGeometry(): BufferGeometry {
  const random = mulberry(41);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const width = CLIFF.width * (0.5 + random() * 0.35) * (1 - t * 0.55);
    const height = CLIFF.height * (0.22 + random() * 0.18);
    const geometry = jitter(new IcosahedronGeometry(1, 1), 0.3, i * 2.3);
    place(
      geometry,
      [CLIFF.x + (random() - 0.5) * CLIFF.width * 0.4, SEA_Y + t * CLIFF.height * 0.75, CLIFF.z + (random() - 0.5) * 6],
      [width * 0.5, height, width * 0.35],
      [0, random() * 3, (random() - 0.5) * 0.2],
    );
    parts.push(paint(geometry, CLIFF_DARK, CLIFF_LIGHT, (_x, y, _z, k) => (y - SEA_Y) / CLIFF.height + noise2(k * 0.4, i) * 0.35));
  }
  return mergeGeometries(parts);
}
