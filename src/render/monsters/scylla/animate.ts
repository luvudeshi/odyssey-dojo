// The per-frame motion of Scylla's necks and heads, kept out of the React component: it writes straight into three.js
// objects held in a `Rig`, every frame, with no allocation. Pure of React, so the component stays declarative.
import { Color, Matrix4, MathUtils, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from "three";
import type { Group, InstancedMesh } from "three";
import type { MonsterProps } from "../../../core/types";
import { battle, decay, nowSeconds } from "../../battle";
import { hitPulse } from "../../effects/pulse";
import { buildHead } from "./headGeometry";
import type { HeadGeometry } from "./headGeometry";
import { ATTACK_NECK, EXPOSED_NECKS, HEAD_SCALE, NECK_COUNT, headForward, neckBase, neckPoint, neckPose } from "./pose";
import type { NeckBlend, V3 } from "./pose";

export const SEG = 14;
export const PHASES = [
  { skin: "#5f8a76", belly: "#a9c0a0", eye: "#ffd25a", glow: 2.2, spikes: false },
  { skin: "#6c6f9e", belly: "#b8b0c8", eye: "#ff8a3a", glow: 3.2, spikes: true },
  { skin: "#94495c", belly: "#d0a49a", eye: "#ff3030", glow: 4.4, spikes: true },
] as const;

const UP = new Vector3(0, 1, 0);
const smooth = (a: number, b: number, v: number): number => MathUtils.smoothstep(v, a, b);

export interface Rig {
  necks: InstancedMesh | null;
  spikes: InstancedMesh | null;
  group: Group | null;
  heads: (Group | null)[];
  jaws: (Group | null)[];
  blends: NeckBlend[];
  heads3: HeadGeometry[];
  neckMaterial: MeshStandardMaterial;
  skinMaterial: MeshStandardMaterial;
  spikeMaterial: MeshStandardMaterial;
  eyeMaterial: MeshStandardMaterial;
  points: V3[];
  obj: Object3D;
  v: { dir: Vector3; mid: Vector3; up: Vector3; quat: Quaternion; right: Vector3; fwd: Vector3; basis: Matrix4; inverse: Matrix4 };
}

export function makeRig(): Rig {
  const flat = { flatShading: true, roughness: 0.7, emissive: new Color("#ff3a20"), emissiveIntensity: 0 };
  return {
    necks: null, spikes: null, group: null, heads: [], jaws: [],
    blends: Array.from({ length: NECK_COUNT }, () => ({ rear: 0, strike: 0, expose: 0, dead: 0 })),
    heads3: PHASES.map((p) => buildHead(new Color(p.skin), new Color(p.belly))),
    neckMaterial: new MeshStandardMaterial(flat),
    skinMaterial: new MeshStandardMaterial({ ...flat, vertexColors: true }),
    spikeMaterial: new MeshStandardMaterial({ color: "#e4d6b4", flatShading: true, roughness: 0.6 }),
    eyeMaterial: new MeshStandardMaterial({ color: "#ffd25a", emissive: new Color("#ffd25a"), emissiveIntensity: 2, toneMapped: false }),
    points: Array.from({ length: SEG + 1 }, () => [0, 0, 0] as V3),
    obj: new Object3D(),
    v: { dir: new Vector3(), mid: new Vector3(), up: new Vector3(), quat: new Quaternion(), right: new Vector3(), fwd: new Vector3(), basis: new Matrix4(), inverse: new Matrix4() },
  };
}

export function disposeRig(rig: Rig): void {
  rig.heads3.forEach((h) => { h.skull.dispose(); h.jaw.dispose(); h.eyes.dispose(); });
  [rig.neckMaterial, rig.skinMaterial, rig.spikeMaterial, rig.eyeMaterial].forEach((m) => { m.dispose(); });
}

export const bindGroup = (rig: Rig, g: Group | null): void => { rig.group = g; };
export const bindHead = (rig: Rig, i: number, g: Group | null): void => { rig.heads[i] = g; };
export const bindJaw = (rig: Rig, i: number, g: Group | null): void => { rig.jaws[i] = g; };
export const bindNecks = (rig: Rig, m: InstancedMesh | null): void => { rig.necks = m; };
export const bindSpikes = (rig: Rig, m: InstancedMesh | null): void => { rig.spikes = m; };
export const headGeometry = (rig: Rig, phase: number): HeadGeometry | undefined => rig.heads3[phase] ?? rig.heads3[0];

/** Neck colours: skin to belly along the neck, a darker band on every other segment; greyer once she is dead. */
export function paintNecks(rig: Rig, phase: number, defeated: boolean): void {
  const mesh = rig.necks;
  if (!mesh) return;
  const look = PHASES[phase] ?? PHASES[0];
  const skin = new Color(look.skin), belly = new Color(look.belly), c = new Color(), grey = new Color("#3c4448");
  for (let i = 0; i < NECK_COUNT; i++) {
    for (let s = 0; s < SEG; s++) {
      c.copy(skin).lerp(belly, (s / SEG) * 0.55).multiplyScalar(s % 2 === 0 ? 1 : 0.82);
      if (defeated) c.lerp(grey, 0.55);
      mesh.setColorAt(i * SEG + s, c);
    }
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function animate(rig: Rig, p: MonsterProps, delta: number): void {
  const dt = Math.min(delta, 0.05);
  const now = nowSeconds();
  const ph = Math.min(PHASES.length - 1, Math.max(0, p.phaseIndex));
  const { v, obj, points } = rig;
  const parent = rig.group?.parent;
  if (rig.group && parent) {
    // Cancel MonsterRig's motion so the necks stay rooted in the cave; this file does its own lunge and flinch.
    v.inverse.compose(parent.position, parent.quaternion, parent.scale).invert();
    rig.group.matrix.copy(v.inverse);
    rig.group.matrixWorldNeedsUpdate = true;
  }
  const flash = Math.max(p.hitFlash, hitPulse());
  const hit = decay(now, battle.enemyHitAt, 0.45);
  const stagger = decay(now, battle.phaseAt, 1.0);
  const active = p.attackId ? ATTACK_NECK[p.attackId] : undefined;
  const mesh = rig.necks, spikeMesh = rig.spikes;
  let deadAverage = 0;
  for (let i = 0; i < NECK_COUNT; i++) {
    const blend = rig.blends[i];
    if (!blend) continue;
    const isActive = i === active;
    const rear = isActive ? smooth(0, 0.55, p.windup) : 0;
    const strike = isActive ? smooth(0.78, 1, p.windup) : 0;
    blend.rear = rear > blend.rear ? rear : MathUtils.damp(blend.rear, rear, 9, dt);
    blend.strike = strike > blend.strike ? strike : MathUtils.damp(blend.strike, strike, 14, dt);
    const exposed = p.weakSpotId !== null && (i === EXPOSED_NECKS.jaw || i === EXPOSED_NECKS.neck) ? 1 : 0;
    blend.expose = MathUtils.damp(blend.expose, exposed, 7, dt);
    blend.dead = MathUtils.damp(blend.dead, p.defeated ? 1 : 0, 2.2, dt);
    deadAverage += blend.dead / NECK_COUNT;

    const pose = neckPose(i, blend, ph);
    const live = (1 - blend.strike) * (1 - 0.85 * blend.dead) * (1 - 0.6 * blend.expose);
    pose.h[0] += Math.sin(now * 0.7 + i * 1.3) * 0.35 * live + Math.sin(now * 15 + i) * 0.5 * stagger;
    pose.h[1] += Math.sin(now * 0.9 + i * 2.1) * 0.22 * live + 0.5 * hit;
    pose.h[2] += Math.sin(now * 0.5 + i) * 0.3 * live - 1.1 * hit;
    const base = neckBase(i);
    for (let s = 0; s <= SEG; s++) {
      const out = points[s];
      if (out) neckPoint(base, pose, s / SEG, out);
    }

    for (let s = 0; mesh && s < SEG; s++) {
      const a = points[s], b = points[s + 1];
      if (!a || !b) continue;
      v.dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const length = v.dir.length();
      v.dir.divideScalar(length || 1);
      v.mid.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      const t = (s + 0.5) / SEG;
      const r = (0.5 - 0.2 * t + Math.sin(t * 9 + i) * 0.03) * (1 + 0.06 * ph);
      v.quat.setFromUnitVectors(UP, v.dir);
      obj.position.copy(v.mid);
      obj.quaternion.copy(v.quat);
      obj.scale.set(r, length * 1.22, r);
      obj.updateMatrix();
      mesh.setMatrixAt(i * SEG + s, obj.matrix);
      if (spikeMesh && s % 2 === 1) {
        v.up.copy(UP).addScaledVector(v.dir, -v.dir.y);
        if (v.up.lengthSq() < 1e-4) v.up.set(0, 0, 1);
        v.up.normalize();
        v.quat.setFromUnitVectors(UP, v.up);
        obj.position.copy(v.mid).addScaledVector(v.up, r * 0.9);
        obj.quaternion.copy(v.quat);
        obj.scale.setScalar(1 + ph * 0.25);
        obj.updateMatrix();
        spikeMesh.setMatrixAt(i * (SEG / 2) + (s - 1) / 2, obj.matrix);
      }
    }

    // The head sits at the end of the neck, facing as headForward says, its jaw open by how far it is rearing.
    const head = rig.heads[i];
    if (head) {
      head.position.set(pose.h[0], pose.h[1], pose.h[2]);
      const f = headForward(base, pose, blend.dead);
      v.fwd.set(f[0], f[1], f[2]);
      v.right.crossVectors(UP, v.fwd).normalize();
      v.up.crossVectors(v.fwd, v.right);
      v.basis.makeBasis(v.right, v.up, v.fwd);
      head.quaternion.setFromRotationMatrix(v.basis);
      head.scale.setScalar(HEAD_SCALE * (1 + 0.05 * ph));
    }
    const jaw = rig.jaws[i];
    if (jaw) {
      const snap = 1 - smooth(0.93, 1, p.windup);
      const open = 0.18 + 0.1 * Math.sin(now * 1.7 + i) + 0.8 * blend.rear * (isActive ? snap : 1) +
        blend.expose * (0.2 + 0.25 * Math.sin(now * 6 + i)) + 0.5 * blend.dead + 0.5 * hit;
      jaw.rotation.x = MathUtils.clamp(open, 0.05, 1.1);
    }
  }
  if (mesh) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  if (spikeMesh) {
    spikeMesh.instanceMatrix.needsUpdate = true;
    spikeMesh.visible = (PHASES[ph]?.spikes ?? false) && deadAverage < 0.9;
    spikeMesh.computeBoundingSphere();
  }
  rig.neckMaterial.emissiveIntensity = flash * 0.9;
  rig.skinMaterial.emissiveIntensity = flash * 0.9;
  const look = PHASES[ph] ?? PHASES[0];
  rig.eyeMaterial.color.set(look.eye);
  rig.eyeMaterial.emissive.set(look.eye);
  rig.eyeMaterial.emissiveIntensity = (look.glow + flash * 4) * (1 - deadAverage);
}
