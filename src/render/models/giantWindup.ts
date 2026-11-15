// How the giant's whole body leans for each attack, on top of the one shared Attack clip, so a player can tell
// left club from right club from grab from boulder before the card says so. Pure: no three.js.

export interface Lean {
  /** Radians about z: positive tips the head toward screen-left (-x). */
  roll: number;
  /** Radians about y: positive turns his front toward screen-right (+x). */
  yaw: number;
  /** Radians about x: positive tips the head toward the hero. */
  pitch: number;
  /** Metres. */
  x: number;
  z: number;
}

const NONE: Lean = { roll: 0, yaw: 0, pitch: 0, x: 0, z: 0 };

/** Full lean at the end of the windup, per attack id in src/enemies/defs/polyphemus.ts. */
const FULL: Readonly<Record<string, Lean>> = {
  club_left: { roll: 0.3, yaw: -0.5, pitch: 0, x: -0.7, z: 0 },
  club_right: { roll: -0.3, yaw: 0.5, pitch: 0, x: 0.7, z: 0 },
  grab: { roll: 0, yaw: 0, pitch: 0.3, x: 0, z: 0.6 },
  boulder: { roll: 0, yaw: 0, pitch: -0.22, x: 0, z: -0.3 },
};

const ease = (t: number): number => {
  const k = Math.min(1, Math.max(0, t / 0.6));
  return k * k * (3 - 2 * k);
};

/** Writes the lean into `out` (no allocation per frame). No attack, or an unknown one, is upright. */
export function giantLean(attackId: string | null, windup: number, out: Lean): Lean {
  const full = (attackId === null ? undefined : FULL[attackId]) ?? NONE;
  const k = windup > 0 ? ease(windup) : 0;
  out.roll = full.roll * k;
  out.yaw = full.yaw * k;
  out.pitch = full.pitch * k;
  out.x = full.x * k;
  out.z = full.z * k;
  return out;
}
