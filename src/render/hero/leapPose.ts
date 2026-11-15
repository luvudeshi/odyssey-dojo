// Acts out the hero's leap and his held defends with his own hips, spine and legs, on top of whatever the clip (or
// the webcam) posed. The spartan has no jump or kick clip, so this is his jump: he sinks onto bent knees with his feet
// planted, springs off, draws his legs up in the air (or throws the kick), and absorbs the landing. The same moves
// make the block, duck and dodges deeper. Called after the mixer and the body tracker, before the strike's reach is
// measured, so the reach sees the pose the player sees.
import { MathUtils, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import type { Leap } from "../strikeReach";
import { buildBoneRig } from "./track/boneMap";
import type { BoneRig } from "./track/boneMap";
import { bendJoint } from "./track/math";

/** Metres the hips sink in a full crouch, and radians the chest pitches in a full lean. */
const DROP = 0.26;
const LEAN = 0.3;
/** How fast a held defend's exaggeration comes in and goes (per second): snappy, about 60 ms. */
const SNAP = 26;
/** How far a held jump lifts him (metres). */
const JUMP_LIFT = 0.75;
/** The steepest a kick may point up: the leap carries the foot the rest of the way to a high target. */
const KICK_MAX_UP = 0.55;

const FORWARD = new Vector3(0, 0, -1);
const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const dir = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z).normalize();
type LegKey = "thighL" | "calfL" | "thighR" | "calfR";
/** The jumping pose, in scene directions (the hero faces -z): lead (left) knee driven up, rear leg trailing. */
const TUCK: Readonly<Record<LegKey, Vector3>> = {
  thighL: dir(0.05, -0.4, -0.92), calfL: dir(0, -0.96, 0.28),
  thighR: dir(-0.02, -0.88, 0.48), calfR: dir(0, -0.5, 0.87),
};
/** A knee strike: the right thigh drives up and forward, the shin hangs. */
const KNEE_THIGH = dir(0.05, 0.3, -0.95);
const KNEE_CALF = dir(0, -0.88, 0.47);

/** What the body is doing this frame: leap shares (0..1), a sideways lean, and the strike's leg move and target. */
export interface Act {
  crouch: number;
  air: number;
  lean: number;
  /** Radians the chest tips sideways: positive tips toward the hero's left. */
  roll: number;
  kick: "front_kick" | "knee" | null;
  /** The contact point in world space, for a kick to aim at. */
  target: Vector3 | null;
}

export function newAct(): Act {
  return { crouch: 0, air: 0, lean: 0, roll: 0, kick: null, target: null };
}

export interface LeapPose {
  /** Metres a held jump lifts the whole hero; his group adds it. */
  readonly lift: number;
  /** Folds the held defends into the strike's leap, eased by `dt`, then poses the bones. */
  update(leap: Leap, held: ReadonlySet<string>, kick: Act["kick"], target: Vector3 | null, dt: number): void;
}

/** The exaggerated defends, eased so a press snaps in and a release snaps out without a pop. */
export class Stance {
  block = 0;
  duck = 0;
  left = 0;
  right = 0;
  jump = 0;

  ease(held: ReadonlySet<string>, dt: number): void {
    const k = Math.min(dt, 0.05);
    this.block = MathUtils.damp(this.block, held.has("block") ? 1 : 0, SNAP, k);
    this.duck = MathUtils.damp(this.duck, held.has("duck") ? 1 : 0, SNAP, k);
    this.left = MathUtils.damp(this.left, held.has("dodge_left") ? 1 : 0, SNAP, k);
    this.right = MathUtils.damp(this.right, held.has("dodge_right") ? 1 : 0, SNAP, k);
    this.jump = MathUtils.damp(this.jump, held.has("jump") ? 1 : 0, SNAP, k);
  }

  /** The leap and the defends as one act: the bigger of each wins, so a defend during the landing blends in. */
  act(leap: Leap, out: Act): Act {
    const dodge = Math.max(this.left, this.right);
    out.crouch = Math.max(leap.crouch, 0.4 * this.block, 0.55 * this.duck, 0.45 * dodge);
    out.air = Math.max(leap.air, this.jump);
    out.lean = Math.max(leap.lean, 0.45 * this.block, 0.6 * this.duck, 0.2 * dodge);
    out.roll = 0.35 * (this.left - this.right);
    return out;
  }

  get lift(): number {
    return JUMP_LIFT * this.jump;
  }
}

interface Saved { pre: Quaternion; post: Quaternion; preAt: Vector3; postAt: Vector3; live: boolean }

/**
 * Puts back what the last frame's pose changed. The mixer rewrites a bone only when its clip value moves (three's
 * PropertyMixer skips a value equal to the last one it wrote), so on a held or slow clip a pose laid on top would pile up
 * frame after frame. A bone the mixer has written since is left as the mixer set it.
 */
class Undo {
  private readonly saved = new Map<Object3D, Saved>();

  restore(): void {
    for (const [bone, s] of this.saved) {
      if (!s.live) continue;
      if (bone.quaternion.equals(s.post)) bone.quaternion.copy(s.pre);
      if (bone.position.equals(s.postAt)) bone.position.copy(s.preAt);
      s.live = false;
    }
  }

  /** Call before changing `bone` this frame. */
  touch(bone: Object3D): void {
    let s = this.saved.get(bone);
    if (!s) {
      s = { pre: new Quaternion(), post: new Quaternion(), preAt: new Vector3(), postAt: new Vector3(), live: false };
      this.saved.set(bone, s);
    }
    if (s.live) return;
    s.pre.copy(bone.quaternion);
    s.preAt.copy(bone.position);
    s.live = true;
  }

  /** Call once the frame's pose is final. */
  commit(): void {
    for (const [bone, s] of this.saved) {
      if (!s.live) continue;
      s.post.copy(bone.quaternion);
      s.postAt.copy(bone.position);
    }
  }
}

class Poser implements LeapPose {
  private readonly undo = new Undo();
  private readonly stance = new Stance();
  private readonly act = newAct();
  private readonly feet: [Vector3, Vector3] = [new Vector3(), new Vector3()];
  private readonly feetQ: [Quaternion, Quaternion] = [new Quaternion(), new Quaternion()];
  private readonly v = new Vector3();
  private readonly from = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly hip = new Vector3();
  private readonly knee = new Vector3();
  private readonly want = new Vector3();
  private readonly q = new Quaternion();
  private readonly parentQ = new Quaternion();
  private readonly turn = new Quaternion();
  private readonly scale = new Vector3();

  constructor(private readonly root: Object3D, private readonly rig: BoneRig, private readonly children: Readonly<Record<LegKey, Object3D>>) {}

  get lift(): number {
    return this.stance.lift;
  }

  update(leap: Leap, held: ReadonlySet<string>, kick: Act["kick"], target: Vector3 | null, dt: number): void {
    this.stance.ease(held, dt);
    const act = this.stance.act(leap, this.act);
    act.kick = kick;
    act.target = target;
    this.undo.restore();
    if (act.crouch < 1e-3 && act.air < 1e-3 && act.lean < 1e-3 && Math.abs(act.roll) < 1e-3) return;
    this.pose(act);
    this.undo.commit();
  }

  private pose(act: Act): void {
    const { torso, footBones } = this.rig;
    // The feet as the clip left them: where a crouch keeps them planted.
    footBones[0].getWorldPosition(this.feet[0]); footBones[0].getWorldQuaternion(this.feetQ[0]);
    footBones[1].getWorldPosition(this.feet[1]); footBones[1].getWorldQuaternion(this.feetQ[1]);

    const pelvis = torso.pelvis.bone;
    const parent = pelvis.parent;
    if (parent && act.crouch > 0) {
      pelvis.getWorldPosition(this.v);
      this.v.y -= DROP * act.crouch;
      this.undo.touch(pelvis);
      pelvis.position.copy(parent.worldToLocal(this.v));
      pelvis.updateWorldMatrix(true, true);
    }
    if (act.lean > 0 || act.roll !== 0) {
      // Pitch forward about the scene's x axis (the hero faces -z) and tip sideways about z.
      this.turn.setFromAxisAngle(X_AXIS, -LEAN * act.lean);
      this.q.setFromAxisAngle(Z_AXIS, act.roll);
      this.turn.premultiply(this.q);
      const spine = torso.spine1.bone;
      this.setWorld(spine, this.q.copy(this.turn).multiply(spine.getWorldQuaternion(this.parentQ)), 1);
    }

    // Ramps in over the first quarter of a crouch, so the knees' bend plane never snaps from the clip's.
    const planted = Math.min(1, act.crouch / 0.25);
    const s = this.root.getWorldScale(this.scale).x;
    for (const side of ["L", "R"] as const) {
      const thigh = this.rig.limbs[`thigh${side}`];
      const calf = this.rig.limbs[`calf${side}`];
      const ankle = side === "L" ? this.feet[0] : this.feet[1];
      if (planted > 0) {
        thigh.bone.getWorldPosition(this.hip);
        bendJoint(this.hip, ankle, thigh.length * s, calf.length * s, FORWARD, this.knee);
        this.aim(`thigh${side}`, this.a.subVectors(this.knee, this.hip).normalize(), planted);
        this.aim(`calf${side}`, this.b.subVectors(ankle, this.knee).normalize(), planted);
      }
      if (act.air > 0) {
        const [up, down] = this.legTarget(side, act);
        this.aim(`thigh${side}`, up, act.air);
        this.aim(`calf${side}`, down, act.air);
      }
      // A planted foot stays flat on the floor however the knee bends.
      if (planted > 0) this.setWorld(footBones[side === "L" ? 0 : 1], side === "L" ? this.feetQ[0] : this.feetQ[1], planted * (1 - act.air));
    }
  }

  /** The thigh and shin directions in the air: the tuck, or for the right leg the kick. */
  private legTarget(side: "L" | "R", act: Act): [Vector3, Vector3] {
    if (side === "R" && act.kick === "knee") return [KNEE_THIGH, KNEE_CALF];
    if (side === "R" && act.kick === "front_kick" && act.target) {
      // A straight leg from the hip to the target, never steeper than KICK_MAX_UP.
      this.rig.limbs.thighR.bone.getWorldPosition(this.hip);
      this.want.subVectors(act.target, this.hip).normalize();
      this.want.y = Math.min(this.want.y, KICK_MAX_UP);
      this.want.normalize();
      return [this.want, this.want];
    }
    return [TUCK[`thigh${side}`], TUCK[`calf${side}`]];
  }

  /** Turns `key`'s bone so it points along world `to`, keeping the clip's twist, blended in by `w`. */
  private aim(key: LegKey, to: Vector3, w: number): void {
    const bone = this.rig.limbs[key].bone;
    bone.getWorldPosition(this.v);
    const from = this.children[key].getWorldPosition(this.from).sub(this.v);
    if (from.lengthSq() < 1e-10) return;
    this.turn.setFromUnitVectors(from.normalize(), to);
    this.setWorld(bone, this.q.copy(this.turn).multiply(bone.getWorldQuaternion(this.parentQ)), w);
  }

  /** Sets `bone`'s world rotation to `world`, blended with its current pose by `w`, and updates its children. */
  private setWorld(bone: Object3D, world: Quaternion, w: number): void {
    const parent = bone.parent;
    if (!parent || w <= 1e-3) return;
    this.undo.touch(bone);
    parent.getWorldQuaternion(this.parentQ).invert().multiply(world);
    if (w >= 0.999) bone.quaternion.copy(this.parentQ);
    else bone.quaternion.slerp(this.parentQ, w);
    bone.updateWorldMatrix(false, true);
  }
}

/** Null for a model that is not the UAL mannequin; the leap then moves the body without acting it out. */
export function createLeapPose(root: Object3D): LeapPose | null {
  const rig = buildBoneRig(root);
  if (!rig) return null;
  const child = (name: string): Object3D | undefined => root.getObjectByName(name);
  const calfL = child("calf_l");
  const calfR = child("calf_r");
  if (!calfL || !calfR) return null;
  const [footL, footR] = rig.footBones;
  return new Poser(root, rig, { thighL: calfL, calfL: footL, thighR: calfR, calfR: footR });
}
