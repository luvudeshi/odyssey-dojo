// How the monster moves, whatever model it is. Offsets are added to the wrapper group around the model.
import { decay } from "./battle";
import type { Battle } from "./battle";

export interface MonsterMotion {
  /** Where the damped advance toward the hero is heading, and how fast it gets there. */
  advanceTarget: number;
  advanceLambda: number;
  /** Extra, undamped offsets. */
  x: number; y: number; z: number; rx: number; rz: number; sy: number;
}

export function makeMotion(): MonsterMotion {
  return { advanceTarget: 0, advanceLambda: 14, x: 0, y: 0, z: 0, rx: 0, rz: 0, sy: 1 };
}

export const ADVANCE = 1.6;

export function monsterMotion(out: MonsterMotion, b: Battle, now: number, calm: boolean): MonsterMotion {
  const sway = calm ? 0 : 1;
  out.rz = Math.sin(now * 0.8) * 0.02 * sway;
  out.x = Math.sin(now * 0.5) * 0.06 * sway;
  out.sy = 1 + Math.sin(now * 1.6) * 0.012 * sway;
  out.y = 0; out.z = 0; out.rx = 0;
  out.advanceTarget = 0; out.advanceLambda = 14; // snaps back fast once the attack has landed or been stopped

  const phase = b.state?.phase;
  if (phase?.kind === "defend") {
    const w = Math.min(1, Math.max(0, 1 - phase.msLeft / phase.totalMs));
    out.advanceTarget = ADVANCE * w * w;
    out.advanceLambda = 6;
    out.rx = 0.1 * w;
  }
  out.z += 0.5 * decay(now, b.playerHitAt, 0.25) - 0.5 * decay(now, b.enemyHitAt, 0.4);
  out.rx -= 0.12 * decay(now, b.enemyHitAt, 0.4);
  const stagger = decay(now, b.phaseAt, 1.0);
  out.rz += Math.sin(now * 14) * 0.12 * stagger * sway;
  out.y -= 0.25 * stagger;
  if (phase?.kind === "won") out.y -= 0.25 * Math.min(1, (now - b.wonAt) / 1.2);
  return out;
}
