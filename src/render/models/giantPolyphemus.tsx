// Candidate "giant": Quaternius Giant (CC0) dressed as Polyphemus: one big glowing eye, a club in the Club phase,
// a stake in the ruined eye once he is Blinded. Skin and cloth are tinted to sit in the dusk cave.
import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color } from "three";
import type { Group, Material, Object3D } from "three";
import type { MonsterProps } from "../../core/types";
import { ErrorBoundary } from "../ErrorBoundary";
import { BoneMount } from "./boneMount";
import { Club, Eye } from "./polyphemusProps";
import { decideMonsterClip } from "./clipMap";
import { RiggedModel } from "./RiggedModel";
import { giantLean } from "./giantWindup";
import type { Lean } from "./giantWindup";
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

const DEBUG = new URLSearchParams(window.location.search).has("debug");
/** Under ?debug the model root is on window.__giantRoot, so a browser test can measure bones in metres. */
function exposeRoot(root: Object3D): void {
  if (DEBUG) Reflect.set(window, "__giantRoot", root);
}

function exposeEye(group: Object3D | null): void {
  if (DEBUG) Reflect.set(window, "__giantEye", group);
}

export function GiantPolyphemus(props: MonsterProps) {
  const phase = Math.min(props.phaseIndex, GIANT_CLIPS.length - 1);
  const clips = GIANT_CLIPS[phase] ?? GIANT_CLIPS[0];
  const anchors = useMemo(
    () => ({
      Head: (
        <BoneMount>
          <group position={[0, 0.3, 0.75]} ref={exposeEye}>
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
  const body = useRef<Group>(null);
  const lean = useRef<Lean>({ roll: 0, yaw: 0, pitch: 0, x: 0, z: 0 });
  useFrame(() => {
    const g = body.current;
    if (!g) return;
    const l = giantLean(props.attackId, props.windup, lean.current);
    g.rotation.set(l.pitch, l.yaw, l.roll);
    g.position.set(l.x, 0, l.z);
  });
  const Fallback = classic.Component;
  return (
    <ErrorBoundary label="monster-glb:giant" fallback={<Fallback {...props} />}>
      <Suspense fallback={<Fallback {...props} />}>
        <group ref={body}>
        <RiggedModel
          url={GIANT_URL}
          fit={GIANT_FIT}
          hitFlash={props.hitFlash}
          tweakMaterial={dusk}
          prepare={exposeRoot}
          anchors={anchors}
          decide={(available, out) => (clips ? decideMonsterClip(clips, props, available, out) : out)}
        />
        </group>
      </Suspense>
    </ErrorBoundary>
  );
}
