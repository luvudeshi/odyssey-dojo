// Where the battle camera wants to be, as a pure function of the fight so it can be tested without a browser.
// The hero stands near z=+1.2 facing -z and the monster at z=-4; the base shot looks over the hero's right shoulder.
import { decay } from "./battle";
import type { Battle } from "./battle";

export interface Shot {
  px: number; py: number; pz: number;
  lx: number; ly: number; lz: number;
  fov: number;
  /** How quickly the rig eases toward this shot (per second). */
  lambda: number;
  /** Instant punch-in on a hit: the share of the way to the look-at point, and extra field of view. Not damped. */
  kick: number;
  fovKick: number;
}

export const MONSTER_Z = -4;
const BASE = { px: 1.5, py: 2.2, pz: 5.2, lx: 0.9, ly: 1.7, lz: -1.6, fov: 52 } as const;

export function makeShot(): Shot {
  return { ...BASE, lambda: 3, kick: 0, fovKick: 0 };
}

const ease = (p: number): number => p * p * (3 - 2 * p);

/** A slow sweep around the middle of the arena, kept to the front so the camera never ends up behind the monster. */
function orbit(out: Shot, phase: number, height: number): void {
  const angle = Math.sin(phase) * 1.1;
  out.px = Math.sin(angle) * 6;
  out.pz = -1.4 + Math.cos(angle) * 6;
  out.py = height;
  out.lx = 0; out.ly = 1.9; out.lz = -1.4;
  out.fov = 55;
  out.lambda = 2;
}

export function cameraShot(out: Shot, b: Battle, now: number, calm: boolean): Shot {
  Object.assign(out, BASE, { lambda: 3, kick: 0, fovKick: 0 });
  const sway = calm ? 0 : 1;
  out.px += Math.sin(now * 0.45) * 0.4 * sway;
  out.py += Math.sin(now * 0.7) * 0.07 * sway;
  out.lx += Math.sin(now * 0.45 + 1) * 0.15 * sway;
  // Follow the hero a little as it steps about.
  out.px += b.heroX * 0.6; out.lx += b.heroX * 0.4;
  out.pz += b.heroZ * 0.5; out.lz += b.heroZ * 0.3;

  const phase = b.state?.phase;
  if (phase?.kind === "defend") {
    const e = ease(Math.min(1, Math.max(0, 1 - phase.msLeft / phase.totalMs)));
    out.pz += 0.9 * e; out.py -= 0.5 * e; out.ly += 0.9 * e; out.fov += 5 * e;
  } else if (phase?.kind === "strike") {
    const [sx, sy, sz] = phase.weakSpot.position;
    out.px = 1.3 + b.heroX * 0.5; out.py = 2.2; out.pz = 4.0 + b.heroZ * 0.5;
    // Look most of the way to the weak spot, but keep the hero in frame.
    out.lx = 0.4 * out.lx + 0.6 * sx; out.ly = 0.4 * out.ly + 0.6 * sy; out.lz = 0.4 * out.lz + 0.6 * (MONSTER_Z + sz);
    out.fov -= 4; out.lambda = 4;
  } else if (phase?.kind === "finisher") {
    orbit(out, now * 0.4, 2.6);
  } else if (phase?.kind === "won") {
    orbit(out, 0.6 + (now - b.wonAt) * 0.3, 2.8);
  } else if (phase?.kind === "lost") {
    Object.assign(out, { px: 1.1, py: 0.45, pz: 2.8, lx: 0, ly: 2.4, lz: -3.2, fov: 58 });
  }

  const wide = decay(now, b.phaseAt, 1.8);
  out.px += 1.6 * wide; out.py -= 0.4 * wide; out.pz += 1.5 * wide; out.fov += 12 * wide;
  const hit = decay(now, b.enemyHitAt, 0.35);
  out.kick = 0.1 * hit; out.fovKick = -4 * hit;
  return out;
}
