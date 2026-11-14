// Candidate "giant": Quaternius Giant (CC0) dressed as Polyphemus: one big glowing eye, a club in the Club phase,
// a stake in the ruined eye once he is Blinded. Skin and cloth are tinted to sit in the dusk cave.
import { Suspense, useMemo } from "react";
import { Color } from "three";
import type { Material } from "three";
import type { MonsterProps } from "../../core/types";
import { ErrorBoundary } from "../ErrorBoundary";
import { BoneMount } from "./boneMount";
import { Club, Eye } from "./polyphemusProps";
import { decideMonsterClip } from "./clipMap";
import { RiggedModel } from "./RiggedModel";
import { GIANT_CLIPS, GIANT_FIT, GIANT_URL } from "./giantClips";
import { model as classic } from "../monsters/models/Polyphemus";

const SKIN = new Color("#f0d2a8");

/** The pack's atlas is bright and shiny; push it toward warm dusk skin and a flat, matte low-poly look. */
export function dusk(material: Material): void {
  const m = material as Material & { color?: Color; metalness?: number; roughness?: number; flatShading?: boolean };
  m.color?.copy(SKIN);
  if (m.metalness !== undefined) m.metalness = 0;
  if (m.roughness !== undefined) m.roughness = 1;
  m.flatShading = true;
  m.needsUpdate = true;
}

export function GiantPolyphemus(props: MonsterProps) {
  const phase = Math.min(props.phaseIndex, GIANT_CLIPS.length - 1);
  const clips = GIANT_CLIPS[phase] ?? GIANT_CLIPS[0];
  const anchors = useMemo(
    () => ({
      Head: (
        <BoneMount>
          <group position={[0, 0.3, 0.75]}>
            <Eye blinded={phase >= 2} glow={(props.weakSpotId === "eye" ? 2.6 : 1.3) + props.hitFlash * 4} />
          </group>
        </BoneMount>
      ),
      ArmR_end: phase >= 1 ? (
        <BoneMount follow>
          <group rotation={[Math.PI, 0, -0.5]}>
            <Club />
          </group>
        </BoneMount>
      ) : null,
    }),
    [phase, props.weakSpotId, props.hitFlash],
  );
  const Fallback = classic.Component;
  return (
    <ErrorBoundary label="monster-glb:giant" fallback={<Fallback {...props} />}>
      <Suspense fallback={<Fallback {...props} />}>
        <RiggedModel
          url={GIANT_URL}
          fit={GIANT_FIT}
          hitFlash={props.hitFlash}
          tweakMaterial={dusk}
          anchors={anchors}
          decide={(available, out) => (clips ? decideMonsterClip(clips, props, available, out) : out)}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
