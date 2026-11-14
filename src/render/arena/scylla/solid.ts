// Small helpers for building flat-shaded, vertex-coloured low-poly geometry that merges into few draw calls.
import { BoxGeometry, Color, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from "three";
import type { BufferGeometry } from "three";
import type { Vec3 } from "./layout";
import { noise2 } from "./layout";

/** Gives every triangle one flat colour: `color` with a little brightness jitter, so facets catch the light apart. */
export function tint(geometry: BufferGeometry, color: string | Color, jitter = 0.12, seed = 0): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.deleteAttribute("uv");
  const position = flat.getAttribute("position");
  const out = new Float32Array(position.count * 3);
  const base = new Color(color);
  const c = new Color();
  for (let i = 0; i < position.count; i += 3) {
    const cx = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
    const cy = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
    const k = 1 + (noise2(cx * 7.3 + seed, cy * 5.1 + i * 0.013) - 0.5) * 2 * jitter;
    c.copy(base).multiplyScalar(k);
    for (let v = 0; v < 3; v++) out.set([c.r, c.g, c.b], (i + v) * 3);
  }
  flat.setAttribute("color", new Float32BufferAttribute(out, 3));
  flat.computeVertexNormals();
  return flat;
}

export function place(geometry: BufferGeometry, position: Vec3, rotation: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]): BufferGeometry {
  return geometry.applyMatrix4(
    new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...scale)),
  );
}

/** A box centred at `position`. */
export const box = (size: Vec3, position: Vec3, color: string, rotation: Vec3 = [0, 0, 0], jitter = 0.12): BufferGeometry =>
  tint(place(new BoxGeometry(...size), position, rotation), color, jitter, position[0] * 3 + position[2]);

/** Moves each vertex a little, hashed by its rounded position so shared corners move together. */
export function jitterVertices(geometry: BufferGeometry, amount: number, seed: number): BufferGeometry {
  const p = geometry.getAttribute("position");
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = noise2(Math.round(v.x * 40) * 0.37 + seed, Math.round(v.y * 40) * 0.53 + Math.round(v.z * 40) * 0.29);
    v.multiplyScalar(1 + (k - 0.5) * 2 * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return geometry;
}
