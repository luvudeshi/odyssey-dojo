// Small helpers for building Circe's world as flat-shaded, vertex-coloured geometry merged into a few draw calls.
import { BufferGeometry, Color, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type V3 = readonly [number, number, number];

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tint = new Color();

/** Flat colour per triangle: `hex` with each facet nudged in lightness by up to `variance`, so faces catch the light differently. */
export function paint(geometry: BufferGeometry, hex: string, variance = 0.06, seed = 1): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  flat.computeVertexNormals();
  flat.deleteAttribute("uv");
  const count = flat.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  const random = mulberry(seed);
  for (let i = 0; i < count; i += 3) {
    tint.set(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    tint.getHSL(hsl);
    tint.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + (random() - 0.5) * 2 * variance)));
    for (let v = 0; v < 3; v++) colors.set([tint.r, tint.g, tint.b], (i + v) * 3);
  }
  flat.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return flat;
}

const euler = new Euler();
const quat = new Quaternion();

/** Moves, turns (yaw, then tilt about x and z) and scales a geometry in place. */
export function place(geometry: BufferGeometry, position: V3, yaw = 0, scale: V3 | number = 1, tilt: readonly [number, number] = [0, 0]): BufferGeometry {
  const s = typeof scale === "number" ? ([scale, scale, scale] as const) : scale;
  euler.set(tilt[0], yaw, tilt[1], "YXZ");
  return geometry.applyMatrix4(new Matrix4().compose(new Vector3(...position), quat.setFromEuler(euler), new Vector3(...s)));
}

export const merge = (parts: readonly BufferGeometry[]): BufferGeometry => {
  const merged = mergeGeometries([...parts]);
  for (const part of parts) part.dispose();
  return merged;
};
