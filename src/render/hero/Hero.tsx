// The player's body in the scene: the spartan, an animated GLB hero that plays clips for each action. The bronze
// pose-driven figure stands in while the GLB loads (or if it fails) and becomes a faint ghost of the live webcam pose.
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { MathUtils, Vector3 } from "three";
import type { Color, Group, Material, Mesh, Object3D } from "three";
import { anchorsFor } from "../../characters/anchors";
import { loadCharacter } from "../../characters/characters";
import type { PoseFrame } from "../../core/types";
import { battle, calmMotion, nowSeconds } from "../battle";
import { ErrorBoundary } from "../ErrorBoundary";
import { RiggedModel } from "../models/RiggedModel";
import { HOME_Z, PlayerFigure } from "../PlayerFigure";
import type { HeroCandidate } from "./candidates";
import { candidate as spartan } from "./defs/spartan";
import { chooseHeroPose, decideHeroPose } from "./heroClips";
import { newInput, readInput } from "./heroInput";
import type { MutableInput } from "./heroInput";
import { KICKS, contactPoint, leapAt, newLeap } from "../strikeReach";
import { createLeapPose } from "./leapPose";
import type { Act, LeapPose } from "./leapPose";
import { newPowerPose, powerPoseAt, WEBCAM_SHARE } from "./powerPose";
import { createReach } from "./reach";
import type { HeroReach } from "./reach";
import { trackShare } from "./track/blend";
import { createBodyTracker } from "./track/BodyTracker";
import { dodge, pivotShift } from "../effects/dodge/dodgeMotion";
import type { BodyTracker } from "./track/BodyTracker";

const GHOST_OFFSET: readonly [number, number, number] = [-0.9, 0, 0.2];
/** Smaller than the hero so the whole body stays in frame beside it. */
const GHOST_SCALE = 0.7;
const GHOST_OPACITY = 0.25;
/** The bronze ghost beside the hero is redundant once the hero's own skeleton follows the body. Set true to bring it back. */
export const SHOW_GHOST_WHILE_TRACKED = Boolean(0);
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

function GlbHero({ candidate, ready, poseRef, trackableRef }: { candidate: HeroCandidate; ready: RefObject<boolean>; poseRef: RefObject<PoseFrame | null>; trackableRef: RefObject<boolean> }) {
  const group = useRef<Group>(null);
  // One tracker per cloned model (React may build the clone twice); the one that runs is found by its root.
  const trackers = useRef(new WeakMap<Object3D, BodyTracker>());
  const tracker = useRef<BodyTracker | null>(null);
  const reaches = useRef(new WeakMap<Object3D, HeroReach>());
  const posers = useRef(new WeakMap<Object3D, LeapPose>());
  const poser = useRef<LeapPose | null>(null);
  const leap = useRef(newLeap());
  const target = useRef({ at: [0, 0, 0] as [number, number, number], v: new Vector3() });
  const home = useRef<[number, number, number]>([0, 0, 0]);
  const input = useRef<MutableInput>(newInput());
  const turn = useRef({ x: 0, y: 0 });
  const kept = useRef(new Set<string>());
  const power = useRef(newPowerPose());
  const prepare = useMemo(() => {
    const tint = tinter(candidate.tint);
    return (root: Object3D): void => {
      tint(root);
      candidate.prepare?.(root);
      const t = createBodyTracker(root);
      if (t) trackers.current.set(root, t);
      reaches.current.set(root, createReach(root));
      const p = createLeapPose(root);
      if (p) posers.current.set(root, p);
    };
  }, [candidate]);
  useEffect(() => { if (DEBUG) Object.assign(window, { __heroGroup: group.current, __battle: battle, __now: nowSeconds, __bodyTrack: () => tracker.current?.debug }); }, []);
  // PlayerFigure steps the hero about the arena and writes battle.heroX/Z; the model follows it, plus a strike's reach.
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const h = home.current;
    h[0] = battle.heroX + (tracker.current?.stepX ?? 0); h[1] = 0; h[2] = HOME_Z + battle.heroZ;
    // The dodge look leans the whole body about his low middle (dodgeMotion).
    const on = dodge.active;
    const shift = pivotShift(on ? dodge.tiltZ : 0, turn.current);
    g.rotation.z = on ? dodge.tiltZ : 0;
    g.position.set(h[0] + battle.reachX + shift.x, battle.reachY + (poser.current?.lift ?? 0) + shift.y, h[2] + battle.reachZ);
    // A tracked duck lowers the pelvis itself; squashing the whole model on top would double it.
    g.scale.y = MathUtils.damp(g.scale.y, battle.held.has("duck") && !tracker.current?.active ? (candidate.rig.duck?.squash ?? 1) : 1, 14, Math.min(delta, 0.05));
  });
  return (
    <group ref={group} position={[0, 0, HOME_Z]}>
      <RiggedModel
        url={candidate.url}
        fit={candidate.fit}
        prepare={prepare}
        anchors={candidate.anchors}
        tweakMaterial={candidate.tweakMaterial}
        afterMixer={(root, delta) => {
          const t = trackers.current.get(root) ?? null;
          tracker.current = t;
          const now = nowSeconds();
          if (t) {
            trackableRef.current = true;
            t.update(poseRef.current, now, delta, trackShare(readInput(input.current, now), candidate.rig.hurt.seconds));
          }
          // Act the jump out with his legs, then measure the striking limb in that pose and move him along the leap.
          const l = leapAt(battle.hitSpot ? now - battle.reachAt : -1, leap.current);
          const p = posers.current.get(root) ?? null;
          poser.current = p;
          if (p) {
            const move = battle.struckMove;
            // A kick is thrown only in the leap; a later held jump tucks both legs.
            const kick: Act["kick"] = l.air > 0 && KICKS.has(move) ? (move === "knee" ? "knee" : "front_kick") : null;
            const t = target.current;
            // With the dodge look the dodge's own crouch and turn come from dodgeMotion, so the stance leaves the held dodges out.
            let held: ReadonlySet<string> = battle.held;
            if (dodge.active) {
              kept.current.clear();
              for (const m of battle.held) if (m !== "dodge_left" && m !== "dodge_right") kept.current.add(m);
              held = kept.current;
            }
            p.update(l, held, kick, battle.hitSpot ? t.v.fromArray(contactPoint(battle.hitSpot, t.at)) : null, delta, dodge.active ? dodge.crouch : 0,
              // Reduced motion skips the pose; on webcam play he only adds a share, so it does not fight the tracked arms.
              !calmMotion() && powerPoseAt(battle.powerGod, now - battle.powerAt, tracker.current?.active ? WEBCAM_SHARE : 1, power.current) ? power.current : null);
          }
          if (group.current) reaches.current.get(root)?.update(group.current, home.current, now, l);
        }}
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
  const trackableRef = useRef(false);
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
    const next = !ready.current ? "solid" : live ? (trackableRef.current && !SHOW_GHOST_WHILE_TRACKED ? "hidden" : "ghost") : "hidden";
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
          <GlbHero candidate={candidate} ready={ready} poseRef={poseRef} trackableRef={trackableRef} />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

// Fetched at import, so the spartan is usually ready the moment a fight starts.
useGLTF.preload(spartan.url);

export function Hero({ poseRef }: { poseRef: RefObject<PoseFrame | null> }) {
  // The chosen character's gear on the spartan's body. Read once per fight: the choice is made on a menu screen.
  const candidate = useMemo(() => ({ ...spartan, anchors: anchorsFor(loadCharacter()) }), []);
  return <GhostedHero candidate={candidate} poseRef={poseRef} />;
}
