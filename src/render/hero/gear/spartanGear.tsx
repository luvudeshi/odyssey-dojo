// Code-built hoplite gear for the "spartan" hero: Corinthian helmet with a crest, bronze cuirass, crimson chiton and cape,
// greaves. Sizes are metres. The mannequin's rest pose is a T-pose, so each piece sits in a "rest frame" (the model's own
// axes: +x the hero's left, +y up, +z forward) that follows the bone. The shield, spear and stake are in carriedGear.tsx.
import type { ReactNode } from "react";
import { BoneMount } from "../../models/boneMount";

export const BRONZE = "#b98a3e";
export const BRONZE_DARK = "#7d5a26";
const CRIMSON = "#a5252f";
export const LEATHER = "#4a2f1d";
export const WOOD = "#7a5230";

type Quat = readonly [number, number, number, number];

/** Inverse of each bone's world rotation in the rest pose (from the GLB), so a child group lines up with the model axes. */
const REST_INV: Readonly<Record<string, Quat>> = {
  Head: [-0.01626, 0, 0, 0.99987],
  spine_03: [0.0162, 0, 0, 0.99987],
  pelvis: [-0.12584, 0, 0, 0.99205],
  calf_l: [-0.9992, -0.00001, 0.00013, -0.04008],
  calf_r: [-0.9992, -0.00001, 0.00013, -0.04008],
};

export function Frame({ bone, children }: { bone: string; children: ReactNode }) {
  const q = REST_INV[bone] ?? [0, 0, 0, 1];
  return (
    <BoneMount follow>
      <group quaternion={[q[0], q[1], q[2], q[3]]}>{children}</group>
    </BoneMount>
  );
}

export function Bronze({ color = BRONZE }: { color?: string }) {
  return <meshStandardMaterial color={color} metalness={0.55} roughness={0.5} flatShading />;
}

function Cloth({ color }: { color: string }) {
  return <meshStandardMaterial color={color} roughness={1} flatShading side={2} />;
}

export function Helmet() {
  return (
    <group position={[0, 0.135, 0.01]}>
      <mesh scale={[1, 1.02, 1.08]} castShadow>
        <icosahedronGeometry args={[0.135, 1]} />
        <Bronze />
      </mesh>
      {/* cheek guards and nose guard: the face is a dark T-shaped opening */}
      <mesh position={[0.085, -0.07, 0.07]} scale={[0.5, 1.6, 1.2]}>
        <boxGeometry args={[0.05, 0.1, 0.08]} />
        <Bronze color={BRONZE_DARK} />
      </mesh>
      <mesh position={[-0.085, -0.07, 0.07]} scale={[0.5, 1.6, 1.2]}>
        <boxGeometry args={[0.05, 0.1, 0.08]} />
        <Bronze color={BRONZE_DARK} />
      </mesh>
      <mesh position={[0, -0.02, 0.135]}>
        <boxGeometry args={[0.03, 0.12, 0.03]} />
        <Bronze />
      </mesh>
      {/* horsehair crest, front to back */}
      <mesh position={[0, 0.15, 0.0]} castShadow>
        <boxGeometry args={[0.035, 0.1, 0.26]} />
        <Cloth color={CRIMSON} />
      </mesh>
      <mesh position={[0, 0.115, -0.17]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.035, 0.1, 0.14]} />
        <Cloth color={CRIMSON} />
      </mesh>
    </group>
  );
}

export function Cuirass() {
  return (
    <group position={[0, -0.1, 0]}>
      <mesh scale={[1, 1, 0.68]} castShadow>
        <cylinderGeometry args={[0.2, 0.15, 0.46, 8]} />
        <Bronze />
      </mesh>
      {/* shoulder straps and a belt */}
      <mesh position={[0.11, 0.25, 0]}>
        <boxGeometry args={[0.1, 0.05, 0.17]} />
        <Bronze color={BRONZE_DARK} />
      </mesh>
      <mesh position={[-0.11, 0.25, 0]}>
        <boxGeometry args={[0.1, 0.05, 0.17]} />
        <Bronze color={BRONZE_DARK} />
      </mesh>
      <mesh position={[0, -0.22, 0]} scale={[1, 1, 0.72]}>
        <cylinderGeometry args={[0.16, 0.16, 0.05, 8]} />
        <meshStandardMaterial color={LEATHER} roughness={1} flatShading />
      </mesh>
    </group>
  );
}

export function Chiton() {
  return (
    <mesh position={[0, -0.17, 0]} scale={[1, 1, 0.82]} castShadow>
      <cylinderGeometry args={[0.17, 0.27, 0.32, 8, 1, true]} />
      <Cloth color={CRIMSON} />
    </mesh>
  );
}

export function Cape() {
  return (
    <group position={[0, 0.12, -0.14]} rotation={[-0.08, 0, 0]}>
      <mesh position={[0, -0.36, 0]} castShadow>
        <boxGeometry args={[0.4, 0.78, 0.02]} />
        <Cloth color={CRIMSON} />
      </mesh>
      <mesh position={[0, 0.02, 0.0]}>
        <boxGeometry args={[0.44, 0.06, 0.05]} />
        <Bronze color={BRONZE_DARK} />
      </mesh>
    </group>
  );
}

export function Greave() {
  return (
    <mesh position={[0, -0.21, 0.015]} castShadow>
      <cylinderGeometry args={[0.058, 0.042, 0.34, 6]} />
      <Bronze />
    </mesh>
  );
}

