// The player's body in the scene: the spartan, an animated GLB hero that plays clips for each action. The bronze
// pose-driven figure stands in while the GLB loads (or if it fails) and becomes a faint ghost of the live webcam pose.
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { MathUtils } from "three";
import type { Color, Group, Material, Mesh, Object3D } from "three";
import type { PoseFrame } from "../../core/types";
import { battle, nowSeconds } from "../battle";
import { ErrorBoundary } from "../ErrorBoundary";
import { RiggedModel } from "../models/RiggedModel";
import { HOME_Z, PlayerFigure } from "../PlayerFigure";
import type { HeroCandidate } from "./candidates";
import { candidate as spartan } from "./defs/spartan";
import { chooseHeroPose, decideHeroPose } from "./heroClips";
import { newInput, readInput } from "./heroInput";
import type { MutableInput } from "./heroInput";

const GHOST_OFFSET: readonly [number, number, number] = [-0.9, 0, 0.2];
/** Smaller than the hero so the whole body stays in frame beside it. */
const GHOST_SCALE = 0.7;
const GHOST_OPACITY = 0.25;
/** Same threshold PlayerFigure uses to decide the webcam is live. */
const STALE_SECONDS = 0.5;

const DEBUG = new URLSearchParams(window.location.search).has("debug");

function isMesh(node: Object3D): node is Mesh {
  return (node as { isMesh?: boolean }).isMesh === true;
}

function tinter(tint: HeroCandidate["tint"]): (root: Object3D) => void {
  return (root) => {
    if (!tint) return;
    root.traverse((node) => {
      const hex = tint[node.name];
      if (!hex || !isMesh(node)) return;
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) (m as Material & { color?: Color }).color?.set(hex);
    });
  };
}

/** Mounts only once the GLB has loaded (it sits inside the Suspense), so the bronze figure covers the wait. */
function Ready({ readyRef }: { readyRef: RefObject<boolean> }) {
  useEffect(() => {
    readyRef.current = true;
    return () => { readyRef.current = false; };
  }, [readyRef]);
  return null;
}

function GlbHero({ candidate, ready }: { candidate: HeroCandidate; ready: RefObject<boolean> }) {
  const group = useRef<Group>(null);
  const input = useRef<MutableInput>(newInput());
  const prepare = useMemo(() => {
    const tint = tinter(candidate.tint);
    return (root: Object3D): void => { tint(root); candidate.prepare?.(root); };
  }, [candidate]);
  useEffect(() => { if (DEBUG) Object.assign(window, { __heroGroup: group.current, __battle: battle, __now: nowSeconds }); }, []);
  // PlayerFigure steps the hero about the arena and writes battle.heroX/Z; the model follows it.
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    g.position.set(battle.heroX, 0, HOME_Z + battle.heroZ);
    g.scale.y = MathUtils.damp(g.scale.y, battle.held.has("duck") ? (candidate.rig.duck?.squash ?? 1) : 1, 14, Math.min(delta, 0.05));
  });
  return (
    <group ref={group} position={[0, 0, HOME_Z]}>
      <RiggedModel
        url={candidate.url}
        fit={candidate.fit}
        prepare={prepare}
        anchors={candidate.anchors}
        tweakMaterial={candidate.tweakMaterial}
        decide={(available, out) => {
          const i = readInput(input.current, nowSeconds());
          return decideHeroPose(candidate.rig, chooseHeroPose(candidate.rig, i), i, available, out);
        }}
      />
      <Ready readyRef={ready} />
    </group>
  );
}

function GhostedHero({ candidate, poseRef }: { candidate: HeroCandidate; poseRef: RefObject<PoseFrame | null> }) {
  const ghost = useRef<Group>(null);
  const ready = useRef(false);
  const seen = useRef<{ frame: PoseFrame | null; at: number }>({ frame: null, at: -Infinity });
  const mode = useRef<"solid" | "ghost" | "hidden" | "">("");
  const mats = useRef<Material[]>([]);
  useEffect(() => { if (DEBUG) Object.assign(window, { __poseRef: poseRef }); }, [poseRef]);

  useFrame(() => {
    const g = ghost.current;
    if (!g) return;
    if (mats.current.length === 0) {
      g.traverse((node) => { if (isMesh(node)) mats.current.push(...(Array.isArray(node.material) ? node.material : [node.material])); });
    }
    const now = nowSeconds();
    const frame = poseRef.current;
    if (frame !== seen.current.frame) { seen.current.frame = frame; seen.current.at = now; }
    const live = frame !== null && now - seen.current.at < STALE_SECONDS;
    // Until the model is in, the bronze figure is the hero; after that it only shows as a ghost, and only for webcam play.
    const next = !ready.current ? "solid" : live ? "ghost" : "hidden";
    if (next === mode.current) return;
    mode.current = next;
    g.visible = next !== "hidden";
    if (next === "ghost") g.position.set(...GHOST_OFFSET);
    else g.position.set(0, 0, 0);
    g.scale.setScalar(next === "ghost" ? GHOST_SCALE : 1);
    for (const m of mats.current) {
      if (next === "ghost" && "color" in m) {
        // A flat pale glow reads as a hologram; the bronze metal would just look dark at 25%.
        const lit = m as Material & { color: Color; metalness: number; emissive: Color };
        lit.color.set("#bfe3ff"); lit.metalness = 0; lit.emissive.set("#4a90c8");
      }
      m.transparent = next === "ghost";
      m.opacity = next === "ghost" ? GHOST_OPACITY : 1;
      m.depthWrite = next !== "ghost";
      m.needsUpdate = true;
    }
  });

  return (
    <>
      <group ref={ghost}><PlayerFigure poseRef={poseRef} /></group>
      <ErrorBoundary label={`hero:${candidate.id}`} fallback={null}>
        <Suspense fallback={null}>
          <GlbHero candidate={candidate} ready={ready} />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

// Fetched at import, so the spartan is usually ready the moment a fight starts.
useGLTF.preload(spartan.url);

export function Hero({ poseRef }: { poseRef: RefObject<PoseFrame | null> }) {
  return <GhostedHero candidate={spartan} poseRef={poseRef} />;
}
