// Finds the driven bones of a Quaternius UAL mannequin by name, once, and records each one's bind pose in the model
// root's own frame so every later frame can turn a landmark direction into a bone rotation.
import { Quaternion, Vector3 } from "three";
import type { Object3D } from "three";

export type LimbKey =
  | "upperarmL" | "lowerarmL" | "upperarmR" | "lowerarmR"
  | "thighL" | "calfL" | "thighR" | "calfR";

export type TorsoKey = "pelvis" | "spine1" | "spine2" | "spine3" | "neck" | "head";

/** Bone name, the child joint it points at, and the landmarks (from, to) that give its direction. */
export const LIMBS: readonly { key: LimbKey; bone: string; child: string; from: number; to: number; bendOf: LimbKey | null }[] = [
  { key: "upperarmL", bone: "upperarm_l", child: "lowerarm_l", from: 11, to: 13, bendOf: null },
  { key: "lowerarmL", bone: "lowerarm_l", child: "hand_l", from: 13, to: 15, bendOf: "upperarmL" },
  { key: "upperarmR", bone: "upperarm_r", child: "lowerarm_r", from: 12, to: 14, bendOf: null },
  { key: "lowerarmR", bone: "lowerarm_r", child: "hand_r", from: 14, to: 16, bendOf: "upperarmR" },
  { key: "thighL", bone: "thigh_l", child: "calf_l", from: 23, to: 25, bendOf: null },
  { key: "calfL", bone: "calf_l", child: "foot_l", from: 25, to: 27, bendOf: "thighL" },
  { key: "thighR", bone: "thigh_r", child: "calf_r", from: 24, to: 26, bendOf: null },
  { key: "calfR", bone: "calf_r", child: "foot_r", from: 26, to: 28, bendOf: "thighR" },
];

const TORSO_BONES: Readonly<Record<TorsoKey, string>> = {
  pelvis: "pelvis", spine1: "spine_01", spine2: "spine_02", spine3: "spine_03", neck: "neck_01", head: "Head",
};

export interface DrivenBone {
  readonly bone: Object3D;
  /** Bind orientation relative to the model root. */
  readonly bind: Quaternion;
  /** Bind direction toward the child joint, relative to the model root (limbs only). */
  readonly rest: Vector3;
  /** Bind position in the root's own frame. */
  readonly position: Vector3;
  /** Bone length in the root's own units (limbs only). */
  readonly length: number;
}

export interface BoneRig {
  readonly limbs: Readonly<Record<LimbKey, DrivenBone>>;
  readonly torso: Readonly<Record<TorsoKey, DrivenBone>>;
  /** Bind position of each foot in the root's own frame. */
  readonly footBind: readonly [Vector3, Vector3];
  readonly footBones: readonly [Object3D, Object3D];
}

/** Null when the model is not this skeleton (the knight and adventurer name their bones differently). */
export function buildBoneRig(root: Object3D): BoneRig | null {
  root.updateWorldMatrix(true, true);
  const rootQ = root.getWorldQuaternion(new Quaternion());
  const rootInverseQ = rootQ.clone().invert();
  const local = (o: Object3D): Vector3 => root.worldToLocal(o.getWorldPosition(new Vector3()));
  const find = (name: string): Object3D | null => root.getObjectByName(name) ?? null;
  const record = (bone: Object3D, child: Object3D | null): DrivenBone => {
    const rest = child ? local(child).sub(local(bone)) : new Vector3(0, 1, 0);
    const length = rest.length();
    return { bone, bind: rootInverseQ.clone().multiply(bone.getWorldQuaternion(new Quaternion())), rest: rest.normalize(), position: local(bone), length };
  };

  const limbs: Partial<Record<LimbKey, DrivenBone>> = {};
  for (const l of LIMBS) {
    const bone = find(l.bone);
    const child = find(l.child);
    if (!bone || !child) return null;
    limbs[l.key] = record(bone, child);
  }
  const torso: Partial<Record<TorsoKey, DrivenBone>> = {};
  for (const [key, name] of Object.entries(TORSO_BONES) as [TorsoKey, string][]) {
    const bone = find(name);
    if (!bone) return null;
    torso[key] = record(bone, null);
  }
  const footL = find("foot_l");
  const footR = find("foot_r");
  const pelvis = torso.pelvis;
  if (!footL || !footR || !pelvis) return null;
  return {
    limbs: limbs as Record<LimbKey, DrivenBone>,
    torso: torso as Record<TorsoKey, DrivenBone>,
    footBind: [local(footL), local(footR)],
    footBones: [footL, footR],
  };
}
