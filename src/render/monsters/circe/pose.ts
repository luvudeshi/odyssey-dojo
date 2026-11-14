// What Circe's body does, as plain numbers, so a test can check each attack reads differently without a browser.
// Arm angles in radians: `out` is how far the arm swings away from the body (for the wand arm, away means toward
// screen-left), `fwd` swings it toward the camera, `elbow` bends the forearm up and forward.
import type { MonsterProps } from "../../../core/types";

export interface CirclePose {
  wandOut: number; wandFwd: number; wandElbow: number;
  cupOut: number; cupFwd: number; cupElbow: number;
  /** Body turns: lean sideways (positive tips the head toward screen-left), twist about y, bow forward (positive), head nod. */
  lean: number; twist: number; bow: number; nod: number;
  /** Metres the whole figure drops: kneeling when beaten. */
  drop: number;
  /** 0..1 glows. */
  orb: number; ring: number; wandGlow: number; cupGlow: number; eyes: number;
  /** Strength of the sweeping arc, on the left (-1 side of screen) or right (+1). */
  arcLeft: number; arcRight: number;
  /** Overhead green ring that says "this one comes high". */
  halo: number;
}

export const POSE_KEYS: readonly (keyof CirclePose)[] = [
  "wandOut", "wandFwd", "wandElbow", "cupOut", "cupFwd", "cupElbow", "lean", "twist", "bow", "nod", "drop",
  "orb", "ring", "wandGlow", "cupGlow", "eyes", "arcLeft", "arcRight", "halo",
];

export function newPose(): CirclePose {
  return {
    wandOut: 0, wandFwd: 0, wandElbow: 0, cupOut: 0, cupFwd: 0, cupElbow: 0, lean: 0, twist: 0, bow: 0, nod: 0, drop: 0,
    orb: 0, ring: 0, wandGlow: 0, cupGlow: 0, eyes: 0, arcLeft: 0, arcRight: 0, halo: 0,
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (p: number): number => p * p * (3 - 2 * p);

/** Arms at rest: the wand held up before her, the cup held out at the other side. */
const REST = { wandOut: 0.35, wandFwd: 0.5, wandElbow: 1.25, cupOut: 0.4, cupFwd: 0.7, cupElbow: 1.1 } as const;

type Target = Partial<CirclePose>;

/** Where each attack sends her at the top of the windup. The four are different on purpose: side, side, up, forward. */
export const ATTACK_POSES: Readonly<Record<string, Target>> = {
  // Wand arm flung out and up on the left of the screen; the stroke comes from there.
  wand_left: { wandOut: 1.95, wandFwd: 0.15, wandElbow: 0.35, lean: 0.14, twist: -0.3, arcLeft: 1, wandGlow: 1 },
  // Wand arm swept across the body to the right of the screen.
  wand_right: { wandOut: -1.0, wandFwd: 1.35, wandElbow: 0.3, lean: -0.14, twist: 0.3, arcRight: 1, wandGlow: 1 },
  // The cup raised over her head, and a green ring above: the throw comes high.
  cup: { cupOut: 2.55, cupFwd: 0.25, cupElbow: 0.45, bow: -0.1, halo: 1, cupGlow: 1, wandGlow: 0.3 },
  // Both hands forward and wide, an orb of swine-magic gathering between them and a sigil on the floor.
  spell: { wandOut: 0.5, wandFwd: 1.5, wandElbow: 0.25, cupOut: 0.5, cupFwd: 1.5, cupElbow: 0.25, orb: 1, ring: 1, wandGlow: 1, cupGlow: 0.6, nod: 0.15 },
};

/** Writes the target pose for this moment into `out`. */
export function circePose(out: CirclePose, p: Pick<MonsterProps, "windup" | "attackId" | "defeated" | "phaseIndex" | "hitFlash">, now: number): CirclePose {
  const breathe = Math.sin(now * 1.7);
  const sway = Math.sin(now * 0.9);
  Object.assign(out, newPose(), REST);
  out.wandElbow += breathe * 0.04;
  out.cupElbow -= breathe * 0.04;
  out.wandOut += sway * 0.03;
  out.lean = sway * 0.015;
  out.wandGlow = 0.35 + 0.15 * p.phaseIndex;
  out.cupGlow = 0.25;
  out.eyes = p.phaseIndex >= 2 ? 1 : p.phaseIndex === 1 ? 0.35 : 0;
  if (p.defeated) {
    Object.assign(out, newPose(), { wandOut: 0.25, wandFwd: 0.5, wandElbow: 0.3, cupOut: 0.3, cupFwd: 0.3, cupElbow: 0.3 });
    out.drop = 0.95; out.bow = 0.5; out.nod = 0.5; out.twist = -0.15; out.lean = 0.05;
    return out;
  }
  const target = p.attackId !== null && p.windup > 0 ? ATTACK_POSES[p.attackId] : undefined;
  if (target) {
    const w = ease(Math.min(1, p.windup));
    for (const key of POSE_KEYS) {
      const to = target[key];
      if (to !== undefined) out[key] = lerp(out[key], to, w);
    }
  }
  // A hit rocks her back.
  out.bow -= 0.2 * p.hitFlash;
  out.nod -= 0.25 * p.hitFlash;
  return out;
}
