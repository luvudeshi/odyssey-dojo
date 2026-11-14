// The player's body in the scene. Without ?hero=<id> it is the bronze pose-driven figure, unchanged. With it, an
// animated GLB hero plays clips for each action and the bronze figure becomes a faint ghost of the live webcam pose.
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
import { HERO_CANDIDATES } from "./candidates";
import type { HeroCandidate } from "./candidates";
import { chooseHeroPose, decideHeroPose } from "./heroClips";
import type { HeroInput } from "./heroClips";

const GHOST_OFFSET: readonly [number, number, number] = [-0.9, 0, 0.2];
/** Smaller than the hero so the whole body stays in frame beside it. */
const GHOST_SCALE = 0.7;
const GHOST_OPACITY = 0.25;
/** Same threshold PlayerFigure uses to decide the webcam is live. */
const STALE_SECONDS = 0.5;

const DEBUG = new URLSearchParams(window.location.search).has("debug");

type MutableInput = { -readonly [K in keyof HeroInput]: HeroInput[K] };

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

function readInput(out: MutableInput, now: number): HeroInput {
  const phase = battle.state?.phase;
  out.held = battle.held;
  out.struckMove = battle.struckMove;
  out.sinceStrike = now - battle.struckAt;
  out.sinceHurt = now - battle.playerHitAt;
  out.won = phase?.kind === "won";
  out.lost = phase?.kind === "lost";
  out.finisherMove = phase?.kind === "finisher" ? phase.move : null;
  return out;
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
  const input = useRef<MutableInput>({ held: new Set(), struckMove: "", sinceStrike: Infinity, sinceHurt: Infinity, won: false, lost: false, finisherMove: null });
  const prepare = useMemo(() => tinter(candidate.tint), [candidate.tint]);
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

export function Hero({ poseRef }: { poseRef: RefObject<PoseFrame | null> }) {
  const id = new URLSearchParams(window.location.search).get("hero");
  const candidate = id ? HERO_CANDIDATES.get(id) : undefined;
  if (!candidate) return <PlayerFigure poseRef={poseRef} />;
  return <GhostedHero candidate={candidate} poseRef={poseRef} />;
}
