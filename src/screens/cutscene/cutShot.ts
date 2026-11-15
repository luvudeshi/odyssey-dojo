// The cutscene camera, a pure function of the cutscene time. It starts low and close on the monster and swings up and
// round to the live fight shot (the target the rig already computed), so the hand-over to the fight has no jump.
import type { Shot } from "../../render/cameraShots";
import { moveAt } from "./timing";

interface Start { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number; swing: number }

const DEFAULT: Start = { px: -2.4, py: 0.6, pz: -0.4, lx: 0.2, ly: 2.6, lz: -4, fov: 40, swing: 2.4 };
const STARTS: Readonly<Record<string, Partial<Start>>> = {};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Mixes `target` (the fight shot) toward the opening shot of this stop at time `ms`. Returns it. */
export function cutShot(target: Shot, enemyId: string, ms: number): Shot {
  const s = { ...DEFAULT, ...STARTS[enemyId] };
  const e = moveAt(ms);
  const arc = Math.sin(Math.PI * e) * s.swing;
  target.px = lerp(s.px, target.px, e) + arc;
  target.py = lerp(s.py, target.py, e);
  target.pz = lerp(s.pz, target.pz, e);
  target.lx = lerp(s.lx, target.lx, e);
  target.ly = lerp(s.ly, target.ly, e);
  target.lz = lerp(s.lz, target.lz, e);
  target.fov = lerp(s.fov, target.fov, e);
  target.kick = 0; target.fovKick = 0;
  return target;
}
