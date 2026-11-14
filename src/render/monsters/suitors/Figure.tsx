// One suitor: the rigged mannequin in a palette, dressed through bone anchors, turning and falling by code.
// If the GLB fails to load, a code-built stand-in with the same pose takes its place so the fight never blanks.
import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { MathUtils } from "three";
import type { Group, Material } from "three";
import type { MonsterProps } from "../../../core/types";
import { ErrorBoundary } from "../../ErrorBoundary";
import { decideMonsterClip } from "../../models/clipMap";
import type { MonsterClipConfig } from "../../models/clipMap";
import { RiggedModel } from "../../models/RiggedModel";
import { fitFor, SUITOR_URL } from "./look";
import type { Palette } from "./look";

export type FigureState = Pick<MonsterProps, "windup" | "attackId" | "defeated" | "phaseIndex" | "hitFlash">;

export interface FigureProps {
  readonly meshHeight: number;
  readonly palette: Palette;
  readonly clips: MonsterClipConfig;
  readonly state: FigureState;
  readonly anchors: Readonly<Record<string, ReactNode>>;
  readonly x?: number;
  readonly z?: number;
  /** Turn about Y, radians. */
  readonly yaw?: number;
  readonly fallen: boolean;
  /** Skip the joint spheres (8k of the mannequin's 13.7k triangles): for the small men in the back. */
  readonly lite?: boolean;
  /** Helm and gear for the stand-in, drawn in metres. */
  readonly standInGear?: ReactNode;
}

const FALL = -Math.PI / 2 + 0.06;

/** Places the figure and eases it into a turn or onto its back. The mannequin's back is 0.2 units behind its origin, so lift it. */
function Pose({ x, z, yaw, fallen, meshHeight, children }: { x: number; z: number; yaw: number; fallen: boolean; meshHeight: number; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 0.05);
    g.rotation.x = MathUtils.damp(g.rotation.x, fallen ? FALL : 0, fallen ? 5 : 8, dt);
    g.rotation.y = MathUtils.damp(g.rotation.y, yaw, 6, dt);
    g.position.y = MathUtils.damp(g.position.y, fallen ? 0.16 * (meshHeight / 1.83) : 0, 6, dt);
  });
  return <group ref={ref} position={[x, 0, z]}>{children}</group>;
}

/** Code-built stand-in: legs, tunic, chest, arms that rise with the windup, head and the same helm. */
function StandIn({ meshHeight, palette, state, gear }: { meshHeight: number; palette: Palette; state: FigureState; gear: ReactNode }) {
  const h = meshHeight;
  const arm = state.attackId !== null ? state.windup : 0;
  const flash = state.hitFlash;
  const cloth = <meshStandardMaterial color={palette.cloth} flatShading roughness={0.9} emissive="#ff3a10" emissiveIntensity={flash} />;
  return (
    <group>
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[s * 0.1 * h, 0.25 * h, 0]}>
          <cylinderGeometry args={[0.05 * h, 0.04 * h, 0.5 * h, 6]} />
          <meshStandardMaterial color={palette.body} flatShading />
        </mesh>
      ))}
      <mesh position={[0, 0.5 * h, 0]}>
        <cylinderGeometry args={[0.11 * h, 0.16 * h, 0.22 * h, 7]} />
        {cloth}
      </mesh>
      <mesh position={[0, 0.7 * h, 0]}>
        <capsuleGeometry args={[0.13 * h, 0.16 * h, 4, 8]} />
        {cloth}
      </mesh>
      {([-1, 1] as const).map((s) => (
        <group key={s} position={[s * 0.17 * h, 0.8 * h, 0]} rotation={[s < 0 ? -arm * 2.8 : 0, 0, s * 0.15]}>
          <mesh position={[0, -0.14 * h, 0]}>
            <capsuleGeometry args={[0.035 * h, 0.22 * h, 3, 6]} />
            <meshStandardMaterial color={palette.body} flatShading />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.9 * h, 0]}>
        <sphereGeometry args={[0.07 * h, 8, 6]} />
        <meshStandardMaterial color={palette.body} flatShading />
      </mesh>
      <group position={[0, 0.89 * h, 0]} scale={h / 1.83}>{gear}</group>
    </group>
  );
}

export function Figure({ meshHeight, palette, clips, state, anchors, x = 0, z = 0, yaw = 0, fallen, lite = false, standInGear }: FigureProps) {
  const tweak = useMemo(
    () => (material: Material): void => {
      const m = material as Material & { color?: { set: (c: string) => void }; metalness?: number; roughness?: number; flatShading?: boolean };
      m.color?.set(material.name === "M_Joints" ? palette.joints : palette.body);
      if (m.metalness !== undefined) m.metalness = 0;
      if (m.roughness !== undefined) m.roughness = 0.9;
      m.flatShading = true;
      if (lite && material.name === "M_Joints") material.visible = false;
      material.needsUpdate = true;
    },
    [palette.body, palette.joints, lite],
  );
  const fit = useMemo(() => fitFor(meshHeight), [meshHeight]);
  const stand = <StandIn meshHeight={meshHeight} palette={palette} state={state} gear={standInGear} />;
  return (
    <Pose x={x} z={z} yaw={yaw} fallen={fallen} meshHeight={meshHeight}>
      <ErrorBoundary label="suitor-glb" fallback={stand}>
        <Suspense fallback={stand}>
          <RiggedModel
            url={SUITOR_URL}
            fit={fit}
            hitFlash={state.hitFlash}
            tweakMaterial={tweak}
            anchors={anchors}
            decide={(available, out) => decideMonsterClip(clips, state, available, out)}
          />
        </Suspense>
      </ErrorBoundary>
    </Pose>
  );
}
