// The 3D view: arena, monster, weak-spot marker and the player figure. Reads combat state; never changes it.
import { Canvas } from "@react-three/fiber";
import { createElement } from "react";
import type { RefObject } from "react";
import type { CombatState, EnemySpec, MonsterProps, PoseFrame } from "../core/types";
import { ArenaFor } from "./arena/ArenaFor";
import { HitEffects } from "./effects/HitEffects";
import { MONSTER_MODELS } from "./monsters/registry";
import { PlayerFigure } from "./PlayerFigure";

function Placeholder({ windup, defeated }: MonsterProps) {
  return (
    <mesh position={[0, 2, 0]} scale={defeated ? [1, 0.2, 1] : [1 + windup * 0.3, 1 + windup * 0.3, 1]}>
      <boxGeometry args={[2, 4, 2]} />
      <meshStandardMaterial color="#5b4a7a" />
    </mesh>
  );
}

function Arena() {
  return (
    <>
      <color attach="background" args={["#1b1030"]} />
      <fog attach="fog" args={["#1b1030", 10, 26]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#b89a6a" roughness={1} />
      </mesh>
      {[-6, -3, 3, 6].map((x) => (
        <mesh key={x} position={[x, 2.5, -7]}>
          <cylinderGeometry args={[0.4, 0.45, 5, 16]} />
          <meshStandardMaterial color="#e8e0d0" roughness={0.6} />
        </mesh>
      ))}
    </>
  );
}

export function Scene(props: {
  enemy: EnemySpec;
  state: CombatState;
  poseRef: RefObject<PoseFrame | null>;
}) {
  const { enemy, state, poseRef } = props;
  const phase = state.phase;
  const weakSpot = phase.kind === "strike" ? phase.weakSpot : null;
  return (
    <Canvas
      camera={{ position: [0, 2, 4.4], fov: 50 }}
      onCreated={({ camera }) => { camera.lookAt(0, 1.8, -3); }}
    >
      <ArenaFor enemyId={enemy.id} fallback={<Arena />} />
      <group position={[0, 0, -4]}>
        {createElement(MONSTER_MODELS.get(enemy.id) ?? Placeholder, {
          windup: phase.kind === "defend" ? 1 - phase.msLeft / phase.totalMs : 0,
          attackId: phase.kind === "defend" ? phase.attack.id : null,
          weakSpotId: weakSpot?.id ?? null,
          defeated: phase.kind === "won",
          phaseIndex: state.phaseIndex,
          hitFlash: 0,
        })}
        <HitEffects state={state} />
        {weakSpot && (
          <mesh position={[...weakSpot.position]}>
            <torusGeometry args={[0.45, 0.06, 8, 32]} />
            <meshBasicMaterial color="#ffd54a" />
          </mesh>
        )}
      </group>
      <PlayerFigure poseRef={poseRef} />
    </Canvas>
  );
}
