// The 3D view: arena, monster, weak-spot marker and the player figure. Reads combat state; never changes it.
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping } from "three";
import { Suspense, createElement, useEffect } from "react";
import type { RefObject } from "react";
import type { CombatState, EnemySpec, MonsterProps, PoseFrame } from "../core/types";
import { ArenaFor } from "./arena/ArenaFor";
import { ARENA_SKIES } from "./arena/registry";
import { Atmosphere } from "./Atmosphere";
import { battle, nowSeconds, resetBattle, syncBattle } from "./battle";
import { CameraRig } from "./CameraRig";
import { Effects } from "./Effects";
import { ErrorBoundary } from "./ErrorBoundary";
import { HitEffects } from "./effects/HitEffects";
import { hitPulse } from "./effects/pulse";
import { MonsterRig } from "./MonsterRig";
import { MONSTER_MODELS } from "./monsters/registry";
import { Hero } from "./hero/Hero";
import { GhostFigure } from "./GhostFigure";
import { QualityContext, useQualityToggle } from "./quality";

const DEBUG = new URLSearchParams(window.location.search).has("debug");

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

export function Scene(props: { enemy: EnemySpec; state: CombatState; poseRef: RefObject<PoseFrame | null>; paused?: boolean }) {
  const { enemy, state, poseRef, paused = false } = props;
  const phase = state.phase;
  const weakSpot = phase.kind === "strike" ? phase.weakSpot : null;
  const quality = useQualityToggle();
  useEffect(() => {
    resetBattle();
    return () => { resetBattle(); };
  }, [enemy.id]);
  useEffect(() => { syncBattle(battle, state, nowSeconds()); }, [state]);
  return (
    <ErrorBoundary label="canvas" fallback={<p style={{ color: "#fff", padding: "1rem" }}>The 3D view failed to start. Reload the page.</p>}>
      <Canvas
        shadows={quality === "high" ? "percentage" : false}
        frameloop={paused ? "never" : "always"}
        dpr={[1, 1.5]}
        gl={{ toneMapping: ACESFilmicToneMapping }}
        camera={{ position: [1.5, 2.2, 5.2], fov: 52 }}
        onCreated={({ camera }) => {
          camera.lookAt(0.9, 1.7, -1.6);
        }}
      >
        <QualityContext.Provider value={quality}>
          <ErrorBoundary key={enemy.id} label="arena" fallback={<Arena />}>
            <Suspense fallback={<Arena />}>
              <ArenaFor enemyId={enemy.id} fallback={<Arena />} />
            </Suspense>
          </ErrorBoundary>
          <Atmosphere sky={ARENA_SKIES.get(enemy.id)} />
          <MonsterRig>
            {createElement(MONSTER_MODELS.get(enemy.id) ?? Placeholder, {
              windup: phase.kind === "defend" ? 1 - phase.msLeft / phase.totalMs : 0,
              attackId: phase.kind === "defend" ? phase.attack.id : null,
              weakSpotId: weakSpot?.id ?? null,
              defeated: phase.kind === "won",
              phaseIndex: state.phaseIndex,
              hitFlash: hitPulse(),
            })}
            <HitEffects state={state} />
            {weakSpot && (
              <mesh position={[...weakSpot.position]}>
                <torusGeometry args={[0.45, 0.06, 8, 32]} />
                <meshBasicMaterial color="#ffd54a" />
              </mesh>
            )}
          </MonsterRig>
          <CameraRig />
          <Hero poseRef={poseRef} />
          <GhostFigure poseRef={poseRef} />
          <Effects />
        </QualityContext.Provider>
      </Canvas>
      {DEBUG && (
        <div style={{ position: "absolute", left: "1rem", bottom: "1rem", font: "12px ui-monospace, monospace" }}>
          q: quality {quality}
        </div>
      )}
    </ErrorBoundary>
  );
}
