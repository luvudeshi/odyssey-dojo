// Collects many small shapes into one vertex-coloured geometry, so the whole hall draws in a handful of calls.
import { BufferGeometry, Color, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Vec3 } from "./layout";

export class Solids {
  private readonly parts: BufferGeometry[] = [];

  private base = new Matrix4();

  /** Everything added inside `fn` is placed relative to this position and rotation, so a prop can be built upright and then tipped over. */
  at(position: Vec3, rotation: Vec3, fn: () => void): this {
    const outer = this.base;
    this.base = outer.clone().multiply(new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(1, 1, 1)));
    fn();
    this.base = outer;
    return this;
  }

  /** Adds a copy of `geometry` placed by position, rotation (radians, XYZ order) and scale, painted one flat colour. */
  add(geometry: BufferGeometry, color: string, position: Vec3, rotation: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.deleteAttribute("uv");
    const local = new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...scale));
    g.applyMatrix4(this.base.clone().multiply(local));
    const paint = new Color(color);
    const count = g.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) paint.toArray(colors, i * 3);
    g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }

  /** One merged geometry, or an empty one when nothing was added. */
  build(): BufferGeometry {
    const merged = this.parts.length > 0 ? mergeGeometries(this.parts, false) : new BufferGeometry();
    for (const part of this.parts) part.dispose();
    return merged;
  }
}
