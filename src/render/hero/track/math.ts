// Pure maths for body tracking: landmark segments to scene directions, shortest-arc rotations, frames, clamps.
// Scene axes: x to the player's right, y up, z toward the camera (the monster is at -z). MediaPipe world landmarks
// have y DOWN, so a landmark (x, y, z) is scene (x, -y, z): the same convention PlayerFigure and heroPose use.
import { Matrix4, Quaternion, Vector3 } from "three";

interface Point { readonly x: number; readonly y: number; readonly z: number }

const MIN_LENGTH = 1e-4;
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _m = new Matrix4();
const _axis = new Vector3();

export const UP: Readonly<Vector3> = new Vector3(0, 1, 0);

export function finiteVec(v: Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export function finiteQuat(q: Quaternion): boolean {
  return Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);
}

/** Landmark (y down) to scene axes. */
export function toScene(p: Point, out: Vector3): Vector3 {
  return out.set(p.x, -p.y, p.z);
}

/** Unit direction from landmark a to landmark b in scene axes. False (and `out` untouched) for a missing or zero-length segment. */
export function segmentDir(a: Point, b: Point, out: Vector3): boolean {
  _x.set(b.x - a.x, -(b.y - a.y), b.z - a.z);
  const length = _x.length();
  if (!Number.isFinite(length) || length < MIN_LENGTH) return false;
  out.copy(_x).divideScalar(length);
  return true;
}

/** Rotation that turns unit vector `from` onto unit vector `to` by the shortest way. */
export function arc(from: Vector3, to: Vector3, out: Quaternion): Quaternion {
  return out.setFromUnitVectors(from, to);
}

/** A right-handed frame whose y axis is `yDir` and whose x axis is as close to `xHint` as it can be. False when they are parallel or invalid. */
export function frameFromXY(xHint: Vector3, yDir: Vector3, out: Quaternion): boolean {
  if (!finiteVec(xHint) || !finiteVec(yDir)) return false;
  _y.copy(yDir);
  if (_y.lengthSq() < MIN_LENGTH) return false;
  _y.normalize();
  _x.copy(xHint).addScaledVector(_y, -xHint.dot(_y));
  if (_x.lengthSq() < 1e-6) return false;
  _x.normalize();
  _z.crossVectors(_x, _y);
  out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  return finiteQuat(out);
}

/** A frame from an x axis and a z (back) axis, e.g. the ear line and the direction opposite to where the head faces. */
export function frameFromXZ(xHint: Vector3, zBack: Vector3, out: Quaternion): boolean {
  if (!finiteVec(xHint) || !finiteVec(zBack) || xHint.lengthSq() < MIN_LENGTH) return false;
  _x.copy(xHint).normalize();
  _z.copy(zBack).addScaledVector(_x, -zBack.dot(_x));
  if (_z.lengthSq() < 1e-6) return false;
  _z.normalize();
  _y.crossVectors(_z, _x);
  out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  return finiteQuat(out);
}

/** Pulls `dir` toward `ref` until the angle between them is at most `maxRad`. A joint cannot fold or twist further than that. */
export function clampAngle(dir: Vector3, ref: Vector3, maxRad: number): void {
  const angle = dir.angleTo(ref);
  if (!(angle > maxRad)) return;
  _axis.crossVectors(ref, dir);
  if (_axis.lengthSq() < 1e-9) return;
  dir.copy(ref).applyAxisAngle(_axis.normalize(), maxRad);
}

/**
 * Knee position for a two-bone leg from `hip` to `ankle` with bone lengths l1 and l2, bending toward `hint`. Used for
 * the legs when the camera cannot see them: the feet stay planted while the hips come down.
 */
export function bendJoint(hip: Vector3, ankle: Vector3, l1: number, l2: number, hint: Vector3, out: Vector3): Vector3 {
  _x.subVectors(ankle, hip);
  const reach = Math.min(Math.max(_x.length(), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  _x.normalize();
  const along = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const height = Math.sqrt(Math.max(l1 * l1 - along * along, 0));
  _y.copy(hint).addScaledVector(_x, -hint.dot(_x));
  if (_y.lengthSq() < 1e-9) _y.set(0, 0, -1);
  _y.normalize();
  return out.copy(hip).addScaledVector(_x, along).addScaledVector(_y, height);
}
