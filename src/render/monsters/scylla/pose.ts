// Where Scylla's six necks and heads are, as pure functions of the fight, in world metres (so tests need no browser).
// A neck is a cubic Bezier from its root inside the cave to its head. A pose is the head position plus how the neck
// leaves the cave (`c1`, offset from the root) and how it arrives at the head (`c2`, offset from the head). Poses
// blend linearly, which blends the curves smoothly.
import { HERO_HEAD, MOUTH } from "../../arena/scylla/layout";

export type V3 = [number, number, number];
export interface Pose { h: V3; c1: V3; c2: V3 }

export const NECK_COUNT = 6;
/** Which neck winds up for which attack in src/enemies/defs/scylla.ts. Necks 1 and 4 only weave. */
export const ATTACK_NECK: Readonly<Record<string, number>> = { head_left: 0, head_right: 5, head_high: 2, head_center: 3 };
/** The two necks that hang down and hold still while the player may strike. */
export const EXPOSED_NECKS = { jaw: 2, neck: 3 } as const;

export const neckBase = (i: number): V3 => [MOUTH.x + (i - 2.5) * 1.05, MOUTH.y - 0.5 + (i % 2) * 0.35, MOUTH.z - 1];

const REST_X = [-3.0, -1.55, -0.2, 1.4, 2.85, 4.3];
const REST_Y = [3.7, 4.3, 3.5, 3.9, 4.4, 3.8];
const REST_Z = [-5.2, -6.0, -5.0, -5.4, -6.0, -5.1];

/** Phase 0..2: the heads hang lower and closer as the fight goes on. */
export function restPose(i: number, phase: number): Pose {
  return {
    h: [REST_X[i] ?? 0, (REST_Y[i] ?? 4) - 0.45 * phase, (REST_Z[i] ?? -5) + 0.5 * phase],
    c1: [0, 0.2, 3.6],
    c2: [0, 2.2, -1.8],
  };
}

const REAR: Readonly<Record<number, Pose>> = {
  0: { h: [-4.6, 5.0, -4.8], c1: [-0.5, 0.4, 3.4], c2: [0.6, -2.8, -0.4] },
  5: { h: [5.6, 4.9, -5.0], c1: [0.5, 0.4, 3.4], c2: [-0.6, -2.8, -0.4] },
  2: { h: [-0.9, 7.4, -7.0], c1: [0, 1.6, 2.0], c2: [0, -3.4, -0.6] },
  3: { h: [1.9, 7.0, -7.6], c1: [0, 1.4, 1.6], c2: [0, -3.2, -1.0] },
};

const STRIKE: Readonly<Record<number, Pose>> = {
  0: { h: [-1.0, 1.5, 0.1], c1: [0, 0.2, 3.4], c2: [-1.8, 1.2, -2.4] },
  5: { h: [1.7, 1.5, 0.1], c1: [0, 0.2, 3.4], c2: [1.8, 1.2, -2.4] },
  2: { h: [0.2, 2.4, 0.3], c1: [0, 1.0, 2.4], c2: [0, 2.8, -0.8] },
  3: { h: [0.3, 1.5, 0.2], c1: [0, 0.2, 3.4], c2: [0, 0.8, -3.2] },
};

/** While the player may strike: one head hangs with its jaw low and snapping, one neck is stretched out toward him. */
const EXPOSED: Readonly<Record<number, Pose>> = {
  2: { h: [-0.75, 4.1, -3.2], c1: [0, 0.4, 3.0], c2: [0.2, 2.2, -2.2] },
  3: { h: [1.25, 2.5, -2.0], c1: [0, 0.4, 3.0], c2: [0.4, 2.0, -2.8] },
};

/** Defeated: the necks go slack and the heads droop forward over the water, where the won camera orbit can see them. */
export function deadPose(i: number): Pose {
  return { h: [(REST_X[i] ?? 0) * 0.9 + 0.3, 0.5 + (i % 3) * 0.5, -8.0 + (i % 2) * 0.9], c1: [0, 0.4, 3.4], c2: [0, 2.0, -1.2] };
}

const mix3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const mixPose = (a: Pose, b: Pose, k: number): Pose => ({ h: mix3(a.h, b.h, k), c1: mix3(a.c1, b.c1, k), c2: mix3(a.c2, b.c2, k) });

/** How far each neck is into each pose, 0..1. */
export interface NeckBlend { rear: number; strike: number; expose: number; dead: number }

export function neckPose(i: number, blend: NeckBlend, phase: number): Pose {
  let pose = restPose(i, phase);
  const rear = REAR[i], strike = STRIKE[i], exposed = EXPOSED[i];
  if (rear) pose = mixPose(pose, rear, blend.rear);
  if (strike) pose = mixPose(pose, strike, blend.strike);
  if (exposed) pose = mixPose(pose, exposed, blend.expose);
  return mixPose(pose, deadPose(i), blend.dead);
}

/** Point `t` (0..1) along the neck. */
export function neckPoint(base: V3, pose: Pose, t: number, out: V3 = [0, 0, 0]): V3 {
  const u = 1 - t;
  const p1: V3 = [base[0] + pose.c1[0], base[1] + pose.c1[1], base[2] + pose.c1[2]];
  const p2: V3 = [pose.h[0] + pose.c2[0], pose.h[1] + pose.c2[1], pose.h[2] + pose.c2[2]];
  for (let k = 0; k < 3; k++) {
    out[k] = u * u * u * (base[k] ?? 0) + 3 * u * u * t * (p1[k] ?? 0) + 3 * u * t * t * (p2[k] ?? 0) + t * t * t * (pose.h[k] ?? 0);
  }
  return out;
}

const normalize = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** The way a head faces: mostly at the hero, bent by how the neck arrives, and mostly along the neck once dead. */
export function headForward(base: V3, pose: Pose, dead: number): V3 {
  const tip = neckPoint(base, pose, 0.94);
  const along = normalize([pose.h[0] - tip[0], pose.h[1] - tip[1], pose.h[2] - tip[2]]);
  const toHero = normalize([HERO_HEAD[0] - pose.h[0], HERO_HEAD[1] - pose.h[1], HERO_HEAD[2] - pose.h[2]]);
  const w = 0.82 * (1 - dead);
  return normalize([along[0] + (toHero[0] - along[0]) * w, along[1] + (toHero[1] - along[1]) * w, along[2] + (toHero[2] - along[2]) * w]);
}

/** Where the lower jaw's middle is, for the weak-spot marker: along the head's forward axis, a little below it. */
export function jawPoint(base: V3, pose: Pose): V3 {
  const f = headForward(base, pose, 0);
  const right = normalize([f[2], 0, -f[0]]);
  const up: V3 = [f[1] * right[2] - f[2] * right[1], f[2] * right[0] - f[0] * right[2], f[0] * right[1] - f[1] * right[0]];
  const s = HEAD_SCALE;
  return [
    pose.h[0] + f[0] * 0.62 * s - up[0] * 0.2 * s,
    pose.h[1] + f[1] * 0.62 * s - up[1] * 0.2 * s,
    pose.h[2] + f[2] * 0.62 * s - up[2] * 0.2 * s,
  ];
}

export const HEAD_SCALE = 1.15;
