// Code-built hoplite gear for the "spartan" hero: Corinthian helmet with a crest, bronze cuirass, crimson chiton and cape,
// greaves, a round shield and a spear. Sizes are metres. The mannequin's rest pose is a T-pose, so most pieces sit in a
// "rest frame" (the model's own axes: +x the hero's left, +y up, +z forward) that follows the bone. The shield and the
// spear are placed in world space from the arm instead, so they face the giant whatever the clip does to the wrist.
import { useFrame } from "@react-three/fiber";
import type { ReactNode } from "react";
import { useRef } from "react";
import { MathUtils, Quaternion, Vector3 } from "three";
import type { Group, Object3D } from "three";
import { battle, nowSeconds } from "../../battle";
import { BoneMount } from "../../models/boneMount";
import { isThrust, strikeWindow } from "../heroClips";
import type { Timed } from "../heroClips";

/** How long the thrust clip is stretched to in the fight, shared with the candidate's rig. */
export const THRUST_TIMING: Timed = { seconds: 0.55, hit: 0.5 };

const BRONZE = "#b98a3e";
const BRONZE_DARK = "#7d5a26";
const CRIMSON = "#a5252f";
const LEATHER = "#4a2f1d";
const WOOD = "#7a5230";

type Quat = readonly [number, number, number, number];

/** Inverse of each bone's world rotation in the rest pose (from the GLB), so a child group lines up with the model axes. */
const REST_INV: Readonly<Record<string, Quat>> = {
  Head: [-0.01626, 0, 0, 0.99987],
  spine_03: [0.0162, 0, 0, 0.99987],
  pelvis: [-0.12584, 0, 0, 0.99205],
  calf_l: [-0.9992, -0.00001, 0.00013, -0.04008],
  calf_r: [-0.9992, -0.00001, 0.00013, -0.04008],
};

function Frame({ bone, children }: { bone: string; children: ReactNode }) {
  const q = REST_INV[bone] ?? [0, 0, 0, 1];
  return (
    <BoneMount follow>
      <group quaternion={[q[0], q[1], q[2], q[3]]}>{children}</group>
    </BoneMount>
  );
}

function Bronze({ color = BRONZE }: { color?: string }) {
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

const origin = new Vector3();
const toHand = new Vector3();
const facing = new Vector3(0, 0, -1);
const face = new Vector3();
const zAxis = new Vector3(0, 0, 1);
const turn = new Quaternion();

/** The bone an anchor is mounted on: group -> BoneMount group -> bone. */
function boneOf(group: Group | null): Object3D | null {
  return group?.parent?.parent ?? null;
}

/** Round bronze shield, placed on the forearm in world space with its face toward the giant. */
export function Shield({ handBone }: { handBone: string }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const g = group.current;
    const bone = boneOf(g);
    const hand = bone?.getObjectByName(handBone);
    if (!g || !bone || !hand) return;
    bone.getWorldPosition(origin);
    hand.getWorldPosition(toHand).sub(origin);
    const len = toHand.length();
    if (len < 1e-4) return;
    toHand.divideScalar(len);
    // face = the "toward the giant" direction with the forearm's own direction taken out
    face.copy(facing).addScaledVector(toHand, -facing.dot(toHand));
    if (face.lengthSq() < 1e-3) face.copy(facing);
    face.normalize();
    g.quaternion.copy(turn.setFromUnitVectors(zAxis, face));
    g.position.copy(toHand).multiplyScalar(len * 0.5).addScaledVector(face, 0.07);
  });
  return (
    <group ref={group}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.05, 14]} />
        <Bronze />
      </mesh>
      <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 0.03, 14]} />
        <Bronze color={BRONZE_DARK} />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <icosahedronGeometry args={[0.06, 0]} />
        <Bronze />
      </mesh>
      <mesh position={[0, 0, -0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.02, 14]} />
        <meshStandardMaterial color={LEATHER} roughness={1} flatShading />
      </mesh>
    </group>
  );
}

const IDLE_PITCH = -0.18;
const BLOCK_PITCH = -0.7;

/** Spear, held at the right hand. Its direction is set in world space: up at rest, forward on a thrust, flat when beaten. */
export function Spear() {
  const group = useRef<Group>(null);
  const pitch = useRef(IDLE_PITCH);
  const roll = useRef(0);
  const lift = useRef(0);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const now = nowSeconds();
    const phase = battle.state?.phase;
    const finisher = phase?.kind === "finisher" ? phase.move : null;
    const thrusting = isThrust(battle.struckMove, finisher) && now - battle.struckAt < strikeWindow(THRUST_TIMING);
    let targetPitch = IDLE_PITCH;
    let targetRoll = 0;
    let targetLift = 0;
    if (phase?.kind === "lost") { targetPitch = 0; targetRoll = Math.PI / 2 - 0.1; }
    else if (phase?.kind === "won") { targetPitch = 0; targetLift = 0.15; }
    else if (thrusting) targetPitch = -Math.PI / 2 + 0.05;
    else if (battle.held.has("block") || battle.held.has("duck")) targetPitch = BLOCK_PITCH;
    const k = thrusting ? 40 : 10;
    const dt = Math.min(delta, 0.05);
    pitch.current = MathUtils.damp(pitch.current, targetPitch, k, dt);
    roll.current = MathUtils.damp(roll.current, targetRoll, 8, dt);
    lift.current = MathUtils.damp(lift.current, targetLift, 8, dt);
    g.rotation.set(pitch.current, 0, roll.current, "YXZ");
    g.position.set(0, lift.current, 0);
  });
  return (
    <group ref={group}>
      {/* grip at the origin: 0.55 m of butt behind the fist, 1.5 m of shaft and a leaf blade ahead of it */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 2.1, 6]} />
        <meshStandardMaterial color={WOOD} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 1.66, 0]} castShadow>
        <coneGeometry args={[0.045, 0.3, 4]} />
        <Bronze />
      </mesh>
      <mesh position={[0, -0.55, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.025, 0.12, 4]} />
        <Bronze color={BRONZE_DARK} />
      </mesh>
    </group>
  );
}

function World({ children }: { children: ReactNode }) {
  return <BoneMount>{children}</BoneMount>;
}

export const SPARTAN_ANCHORS: Readonly<Record<string, ReactNode>> = {
  Head: <Frame bone="Head"><Helmet /></Frame>,
  spine_03: (
    <Frame bone="spine_03">
      <Cuirass />
      <Cape />
    </Frame>
  ),
  pelvis: <Frame bone="pelvis"><Chiton /></Frame>,
  calf_l: <Frame bone="calf_l"><Greave /></Frame>,
  calf_r: <Frame bone="calf_r"><Greave /></Frame>,
  lowerarm_l: <World><Shield handBone="hand_l" /></World>,
  hand_r: <World><Spear /></World>,
};
