// Charybdis's body parts as geometry. Local space: the monster stands at the origin, facing +z (the camera), with the
// water's surface at about y=0. All sizes in metres.
import { BufferGeometry, ConeGeometry, Float32BufferAttribute, Matrix4, SphereGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** The throat's centre height: the weak spot "the throat of the whirlpool" sits here. */
export const THROAT_Y = 1.4;
export const MOUTH_Z = 0.9;
export const THROAT_Z = -3.4;
export const MOUTH_RX = 2.35;
export const MOUTH_RY = 2.5;

/** Radius of the funnel (as a share of the mouth's) at depth t: 0 at the throat, 1 at the mouth. */
export const funnelRadius = (t: number): number => 0.09 + 0.91 * t ** 1.6;

function grid(rows: number, cols: number, at: (row: number, col: number) => readonly [number, number, number], wrap: boolean): BufferGeometry {
  const position: number[] = [];
  const stride = cols + (wrap ? 0 : 1);
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < stride; c++) position.push(...at(r / rows, c / cols));
  }
  const index: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const c2 = wrap ? (c + 1) % cols : c + 1;
      const a = r * stride + c, b = r * stride + c2, d = (r + 1) * stride + c, e = (r + 1) * stride + c2;
      index.push(a, b, d, b, e, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  return geometry;
}

/** The funnel: a hollow cone open toward the camera, narrowing into the dark throat. An upright oval, taller than wide. */
export function funnelGeometry(): BufferGeometry {
  return grid(14, 18, (t, u) => {
    const phi = u * Math.PI * 2;
    const k = funnelRadius(t);
    return [Math.cos(phi) * MOUTH_RX * k, THROAT_Y + Math.sin(phi) * MOUTH_RY * k, THROAT_Z + (MOUTH_Z - THROAT_Z) * t];
  }, true);
}

/**
 * A breaking wave seen from the side: a sheet that rises from the back, arches over and curls forward (+z) with a
 * hollow underneath. Width along x. About 2.4 m tall, so shaders can read height as y / 2.4.
 */
export function waveGeometry(width = 3.2): BufferGeometry {
  const profile: readonly (readonly [number, number])[] = [
    [-1.5, 0], [-1.15, 0.9], [-0.55, 1.75], [0.15, 2.3], [0.85, 2.4], [1.35, 2.05], [1.5, 1.5], [1.25, 1.1], [0.75, 1.0],
  ];
  return grid(profile.length - 1, 10, (v, u) => {
    const i = Math.min(profile.length - 1, Math.round(v * (profile.length - 1)));
    const [z, y] = profile[i] ?? [0, 0];
    const x = (u - 0.5) * width;
    // The ends are lower and the lip ragged, so the sheet reads as a wave and not a wall.
    const drop = 1 - 0.5 * (2 * Math.abs(u - 0.5)) ** 2;
    const ragged = 1 + 0.08 * Math.sin(u * 17 + i * 2.1);
    return [x, y * drop * ragged, z * (0.85 + 0.15 * drop)];
  }, false);
}

/** A tapering column of water, 2.4 m tall with its foot at y=0, for the spout. */
export function columnGeometry(): BufferGeometry {
  return grid(6, 8, (t, u) => {
    const phi = u * Math.PI * 2;
    const r = 0.62 * (1 - 0.55 * t) * (1 + 0.1 * Math.sin(phi * 3 + t * 8));
    return [Math.cos(phi) * r, t * 2.4, Math.sin(phi) * r];
  }, true);
}

/** Fangs of foam around the mouth's rim, pointing forward and in. Merged into one geometry. */
export function fangGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const count = 16;
  for (let i = 0; i < count; i++) {
    const phi = (i / count) * Math.PI * 2 + (i % 2) * 0.05;
    const size = i % 2 === 0 ? 1 : 0.62;
    const cone = new ConeGeometry(0.3 * size, 1.5 * size, 5, 1);
    // Cone points +y; turn it to point +z, then tip it toward the throat's axis.
    cone.rotateX(Math.PI / 2);
    const x = Math.cos(phi) * MOUTH_RX * 0.97, y = THROAT_Y + Math.sin(phi) * MOUTH_RY * 0.97;
    // Tip toward the axis: rotating +z about the rim's tangent by a negative angle leans it inward.
    cone.applyMatrix4(new Matrix4().makeRotationAxis(new Vector3(-Math.sin(phi), Math.cos(phi), 0), 0.45));
    cone.translate(x, y, MOUTH_Z - 0.2 * size);
    const flat = cone.toNonIndexed();
    flat.deleteAttribute("uv");
    parts.push(flat);
  }
  return mergeGeometries(parts);
}

/** A low-poly ball for the eye deep in the throat. */
export const eyeGeometry = (): BufferGeometry => new SphereGeometry(0.42, 10, 8);
