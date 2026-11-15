// Poses the spartan's own skeleton from live MediaPipe landmarks, after the animation mixer has written the clip
// pose. Each driven bone is set in world space (shortest rotation from its bind direction to the landmark direction,
// parent first) and slerped in by a weight, so a lost limb or a hurt moment eases back to the clip, never to garbage.
import { Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import type { PoseFrame } from "../../../core/types";
import { buildBoneRig, LIMBS } from "./boneMap";
import type { BoneRig, DrivenBone, LimbKey } from "./boneMap";
import { arc, bendJoint, finiteQuat, finiteVec } from "./math";
import { PoseTargets } from "./targets";

/** No new webcam frame for this long and the clip takes over (the rule PlayerFigure uses). */
const STALE_SECONDS = 0.5;
/** The player left for this long: measure the neutral stance again when they return. */
const RECALIBRATE_SECONDS = 3;
/** Weights ease at this rate (about 100 ms to settle). */
const EASE_PER_SECOND = 10;
/** When poses stop arriving the hero leaves its last tracked pose for the ready stance at this rate (about half a second). */
const LEAVE_PER_SECOND = 6;
/** A limb or the torso that drops out of the picture for a blink keeps its last tracked direction this long before easing back to the clip. */
const HOLD_SECONDS = 0.35;
/** How far (metres) the hips may be moved to keep the lowest foot on the floor. */
const MAX_LOWER = 0.7;
const MAX_RAISE = 0.15;
/** A drop smaller than this leaves the clip's legs alone when the camera cannot see the legs. */
const LEG_FULL_DROP = 0.05;
const FORWARD = new Vector3(0, 0, -1);

const TORSO_ORDER = ["pelvis", "spine1", "spine2", "spine3", "neck", "head"] as const;

export class BodyTracker {
  /** Metres to add to the hero's sideways position. */
  stepX = 0;
  /** True while the skeleton is being overridden. */
  active = false;
  private readonly targets = new PoseTargets();
  private weight = 0;
  private readonly limbWeight = {} as Record<LimbKey, number>;
  private torsoWeight = 0;
  private readonly limbOkAt = {} as Record<LimbKey, number>;
  private torsoOkAt = -Infinity;
  private lastFrame: PoseFrame | null = null;
  private lastSeen = -Infinity;
  private live = false;
  private readonly rootQ = new Quaternion();
  private readonly parentQ = new Quaternion();
  private readonly bindQ = new Quaternion();
  private readonly worldQ = new Quaternion();
  private readonly deltaQ = new Quaternion();
  private readonly spine = new Quaternion();
  private readonly rest = new Vector3();
  private readonly v = new Vector3();
  private readonly hip = new Vector3();
  private readonly knee = new Vector3();
  private readonly ankle = new Vector3();
  private readonly legDir = { thighL: new Vector3(), calfL: new Vector3(), thighR: new Vector3(), calfR: new Vector3() };
  private readonly scale = new Vector3();
  private readonly pelvisAt = new Vector3();

  constructor(readonly root: Object3D, private readonly rig: BoneRig) {
    for (const l of LIMBS) { this.limbWeight[l.key] = 0; this.limbOkAt[l.key] = -Infinity; }
  }

  /** The weights and targets, for a debug overlay or a test. */
  get debug(): { weight: number; torso: number; limbs: Readonly<Record<LimbKey, number>>; step: number; drop: number; calibrated: boolean } {
    return { weight: this.weight, torso: this.torsoWeight, limbs: this.limbWeight, step: this.targets.step, drop: this.targets.drop, calibrated: this.targets.calibrated };
  }

  /**
   * Call once per rendered frame, after the mixer. `now` is seconds on the same clock as battle.ts, `share` is how
   * much of the pose the body may own right now (1 normally, less while a hurt or finishing clip plays).
   */
  update(frame: PoseFrame | null, now: number, dt: number, share: number): void {
    if (frame !== this.lastFrame) {
      this.lastFrame = frame;
      if (frame) {
        if (now - this.lastSeen > RECALIBRATE_SECONDS) this.targets.recalibrate();
        this.lastSeen = now;
        this.targets.ingest(frame);
      }
    }
    this.live = frame !== null && now - this.lastSeen < STALE_SECONDS;
    const k = 1 - Math.exp(-EASE_PER_SECOND * Math.min(dt, 0.05));
    const goal = this.live ? Math.max(0, Math.min(1, share)) : 0;
    this.weight += (goal - this.weight) * (this.live || goal > this.weight ? k : 1 - Math.exp(-LEAVE_PER_SECOND * Math.min(dt, 0.05)));
    if (this.weight < 0.002) {
      this.weight = 0;
      this.active = false;
      this.stepX = 0;
      return;
    }
    this.active = true;
    const t = this.targets;
    this.stepX = t.step * this.weight;
    for (const l of LIMBS) {
      if (t.dirOk[l.key]) this.limbOkAt[l.key] = now;
      this.limbWeight[l.key] += ((now - this.limbOkAt[l.key] < HOLD_SECONDS ? 1 : 0) - this.limbWeight[l.key]) * k;
    }
    if (t.torsoOk) this.torsoOkAt = now;
    this.torsoWeight += ((now - this.torsoOkAt < HOLD_SECONDS ? 1 : 0) - this.torsoWeight) * k;

    this.root.updateWorldMatrix(true, true);
    this.root.getWorldQuaternion(this.rootQ);
    this.root.getWorldScale(this.scale);
    this.driveTorso();
    this.driveArms();
    this.driveLegsAndHips();
  }

  private bindScene(b: DrivenBone): Quaternion {
    return this.bindQ.copy(this.rootQ).multiply(b.bind);
  }

  /** Sets `b` so its world rotation is `target`, blended with the clip pose by `w`. */
  private write(b: DrivenBone, target: Quaternion, w: number): void {
    if (w <= 0.001 || !finiteQuat(target) || !b.bone.parent) return;
    b.bone.parent.getWorldQuaternion(this.parentQ);
    this.parentQ.invert().multiply(target);
    if (!finiteQuat(this.parentQ)) return;
    if (w >= 0.999) b.bone.quaternion.copy(this.parentQ);
    else b.bone.quaternion.slerp(this.parentQ, w);
  }

  private driveTorso(): void {
    const t = this.targets;
    const w = this.weight * this.torsoWeight;
    if (w <= 0.001) return;
    const r = this.rig.torso;
    for (const key of TORSO_ORDER) {
      const b = r[key];
      switch (key) {
        case "pelvis": this.worldQ.copy(t.pelvis); break;
        case "spine1": this.worldQ.copy(t.pelvis).slerp(t.chest, 1 / 3); break;
        case "spine2": this.worldQ.copy(t.pelvis).slerp(t.chest, 2 / 3); break;
        case "spine3": this.worldQ.copy(t.chest); break;
        case "neck": this.worldQ.copy(t.chest).slerp(t.head, 0.35); break;
        case "head": this.worldQ.copy(t.head); break;
      }
      this.worldQ.multiply(this.bindScene(b));
      this.write(b, this.worldQ, w);
    }
  }

  private poseLimb(key: LimbKey, dir: Vector3, w: number): void {
    if (w <= 0.001 || !finiteVec(dir)) return;
    const b = this.rig.limbs[key];
    this.rest.copy(b.rest).applyQuaternion(this.rootQ);
    arc(this.rest, dir, this.deltaQ);
    this.worldQ.copy(this.deltaQ).multiply(this.bindScene(b));
    this.write(b, this.worldQ, w);
  }

  private driveArms(): void {
    for (const l of LIMBS) {
      if (l.key.startsWith("upperarm") || l.key.startsWith("lowerarm")) this.poseLimb(l.key, this.targets.dir[l.key], this.weight * this.limbWeight[l.key]);
    }
  }

  /**
   * Legs and pelvis height. With the legs in the picture they follow the landmarks and the pelvis moves so the lowest
   * foot is back on the floor (the duck). Without them the feet stay planted and the knees bend as the hips come down.
   */
  private driveLegsAndHips(): void {
    const t = this.targets;
    const { pelvis } = this.rig.torso;
    const parent = pelvis.bone.parent;
    if (!parent) return;
    const bindPos = this.root.localToWorld(this.pelvisAt.copy(pelvis.position));
    let lift = -t.drop;
    if (t.legsSeen) {
      for (const l of LIMBS) if (isLeg(l.key)) this.poseLimb(l.key, t.dir[l.key], this.weight * this.limbWeight[l.key]);
      const floorY = Math.min(...this.rig.footBind.map((f) => this.root.localToWorld(this.ankle.copy(f)).y));
      pelvis.bone.position.copy(parent.worldToLocal(this.v.copy(bindPos)));
      pelvis.bone.updateWorldMatrix(false, true);
      let lowest = Infinity;
      for (const foot of this.rig.footBones) lowest = Math.min(lowest, foot.getWorldPosition(this.ankle).y);
      lift = Math.max(-MAX_LOWER, Math.min(MAX_RAISE, floorY - lowest));
    } else {
      this.plantLegs();
      const w = this.weight * Math.min(1, t.drop / LEG_FULL_DROP);
      for (const key of ["thighL", "calfL", "thighR", "calfR"] as const) this.poseLimb(key, this.legDir[key], w);
    }
    if (!Number.isFinite(lift)) return;
    this.v.copy(bindPos);
    this.v.y += lift;
    parent.worldToLocal(this.v);
    if (finiteVec(this.v)) pelvis.bone.position.lerp(this.v, this.weight * this.torsoWeight);
  }

  /** The legs are out of the picture: keep the feet planted at their bind spot and bend the knees as the hips come down. */
  private plantLegs(): void {
    const drop = this.targets.drop;
    const s = this.scale.x;
    for (const side of ["L", "R"] as const) {
      const thigh = this.rig.limbs[`thigh${side}`];
      const calf = this.rig.limbs[`calf${side}`];
      this.root.localToWorld(this.ankle.copy(this.rig.footBind[side === "L" ? 0 : 1]));
      this.root.localToWorld(this.hip.copy(thigh.position));
      this.hip.y -= drop;
      bendJoint(this.hip, this.ankle, thigh.length * s, calf.length * s, FORWARD, this.knee);
      this.legDir[`thigh${side}`].subVectors(this.knee, this.hip).normalize();
      this.legDir[`calf${side}`].subVectors(this.ankle, this.knee).normalize();
    }
  }
}

function isLeg(key: LimbKey): boolean {
  return key.startsWith("thigh") || key.startsWith("calf");
}

export function createBodyTracker(root: Object3D): BodyTracker | null {
  const rig = buildBoneRig(root);
  return rig ? new BodyTracker(root, rig) : null;
}
