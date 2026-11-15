// What a GLB hero is made of: file, fit, tint and which clip plays for each action. The one hero is ./defs/spartan.tsx.
import type { ReactNode } from "react";
import type { Material, Object3D } from "three";
import type { ModelFit } from "../models/fitModel";
import type { HeroRig } from "./heroClips";

export interface HeroCandidate {
  readonly id: string;
  readonly url: string;
  readonly fit: ModelFit;
  readonly rig: HeroRig;
  /** Multiplies a mesh's colour (by mesh name) toward bronze, white and crimson. */
  readonly tint?: Readonly<Record<string, string>>;
  /** Gear parented to the bone of that name (a helmet, a shield). Wrap in BoneMount to size it in metres. */
  readonly anchors?: Readonly<Record<string, ReactNode>>;
  /** Runs once on the cloned model, after the tint: hide a mesh, swap a part. */
  readonly prepare?: (root: Object3D) => void;
  /** Runs once on each material: recolour or flat-shade a pack that does not match the look. */
  readonly tweakMaterial?: (material: Material) => void;
}
