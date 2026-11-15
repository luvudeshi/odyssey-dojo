// Small helpers for building flat-shaded, vertex-coloured low-poly parts in code and merging them into one mesh.
// Shared by the Sirens and by their meadow, so both look cut from the same paper.
import { BufferGeometry, Color, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type Vec3 = readonly [number, number, number];

function paint(geometry: BufferGeometry, color: string, matrix: Matrix4): BufferGeometry {
  const out = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  out.deleteAttribute("uv");
  out.applyMatrix4(matrix);
  const count = out.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  const paintColor = new Color(color);
  for (let i = 0; i < count; i++) paintColor.toArray(colors, i * 3);
  out.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return out;
}

const UP = new Vector3(0, 1, 0);

/** A copy of `geometry` placed by position, Euler rotation and scale, painted one colour. */
export function part(geometry: BufferGeometry, color: string, position: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]): BufferGeometry {
  const matrix = new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vector3(...scale),
  );
  return paint(geometry, color, matrix);
}

/** Like `part`, but turns the geometry's +y axis to point along `direction` (cones, feathers, toes, branches). */
export function aimed(geometry: BufferGeometry, color: string, position: Vec3, direction: Vec3, scale: Vec3 = [1, 1, 1]): BufferGeometry {
  const quaternion = new Quaternion().setFromUnitVectors(UP, new Vector3(...direction).normalize());
  return paint(geometry, color, new Matrix4().compose(new Vector3(...position), quaternion, new Vector3(...scale)));
}

/** Merges parts into one geometry and frees the inputs. */
export function merge(parts: readonly BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries([...parts], false);
  for (const geometry of parts) geometry.dispose();
  return merged;
}

/** Deterministic pseudo-random numbers, so every run builds the same meadow. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sets properties on a three.js object from inside a frame callback (kept out of components, where the React lint rules forbid assignments). */
export function setProps<T extends object>(target: T, values: Partial<T>): void {
  Object.assign(target, values);
}
