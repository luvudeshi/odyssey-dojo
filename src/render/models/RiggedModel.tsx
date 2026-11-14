// Loads a local GLB, fits it to the floor and plays its clips as `decide` says. Shared by monsters and the hero.
import { createPortal, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { AnimationMixer, Box3, Color, LoopOnce, LoopRepeat, Vector3 } from "three";
import type { AnimationAction, Mesh, Material, Object3D } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { newDecision } from "./clipMap";
import type { ClipDecision } from "./clipMap";

export interface ModelFit {
  /** World height the model is scaled to. */
  readonly targetHeight: number;
  /** Radians around Y, to turn a model that does not face +Z. */
  readonly rotationY?: number;
  /** Extra offset after the feet are placed on the floor and the model is centred. */
  readonly offset?: readonly [number, number, number];
}

export interface RiggedModelProps {
  readonly url: string;
  readonly fit: ModelFit;
  /** Called every frame; must write into `out` and not allocate. */
  readonly decide: (available: ReadonlySet<string>, out: ClipDecision) => ClipDecision;
  /** 0..1; tints emissive red while above 0. */
  readonly hitFlash?: number;
  /** Children parented to the bone of that name (a weak-spot marker, a glowing eye). They inherit the model's scale. */
  readonly anchors?: Readonly<Record<string, ReactNode>>;
}

const FADE = 0.15;
const FLASH = new Color(1, 0.25, 0.1);

type EmissiveMaterial = Material & { emissive: Color };

interface Flashable {
  readonly material: EmissiveMaterial;
  readonly base: Color;
}

/** Filled only under ?debug, so a browser test can read what the mixer is doing. */
export const modelDebug: { clip: string | null; time: number; scrub: number | null; loop: boolean; clips: string[] } = {
  clip: null,
  time: 0,
  scrub: null,
  loop: true,
  clips: [],
};
const DEBUG = new URLSearchParams(window.location.search).has("debug");
if (DEBUG) (window as unknown as { __modelDebug: typeof modelDebug }).__modelDebug = modelDebug;

function isMesh(node: Object3D): node is Mesh {
  return (node as { isMesh?: boolean }).isMesh === true;
}

/** Skinned meshes measure wrongly before posing (some exports are off by 100x), so rigged models use their bone positions. */
function measure(root: Object3D): Box3 {
  const box = new Box3();
  const at = new Vector3();
  let bones = 0;
  root.traverse((node: Object3D) => {
    if (!isBone(node)) return;
    bones++;
    box.expandByPoint(node.getWorldPosition(at));
  });
  return bones > 1 ? box : box.setFromObject(root);
}

function isBone(node: Object3D): boolean {
  return (node as { isBone?: boolean }).isBone === true;
}

function hasEmissive(material: Material): material is EmissiveMaterial {
  return "emissive" in material && (material as EmissiveMaterial).emissive instanceof Color;
}

export function RiggedModel({ url, fit, decide, hitFlash = 0, anchors }: RiggedModelProps) {
  const gltf = useGLTF(url);
  const rig = useMemo(() => {
    const root = clone(gltf.scene);
    const flashables: Flashable[] = [];
    root.traverse((node: Object3D) => {
      if (!isMesh(node)) return;
      const mesh = node;
      mesh.castShadow = true;
      // SkeletonUtils shares materials between clones, so give this instance its own before tinting.
      const own = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      mesh.material = own;
      for (const material of Array.isArray(own) ? own : [own]) {
        if (hasEmissive(material)) flashables.push({ material, base: material.emissive.clone() });
      }
    });
    root.updateWorldMatrix(true, true);
    const box = measure(root);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = size.y > 0 ? fit.targetHeight / size.y : 1;
    const position: [number, number, number] = [
      -center.x * scale + (fit.offset?.[0] ?? 0),
      -box.min.y * scale + (fit.offset?.[1] ?? 0),
      -center.z * scale + (fit.offset?.[2] ?? 0),
    ];
    const mixer = new AnimationMixer(root);
    const actions = new Map<string, AnimationAction>(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
    return { root, flashables, scale, position, mixer, actions, available: new Set(actions.keys()) };
  }, [gltf, fit.targetHeight, fit.offset]);

  const live = useRef<{ current: AnimationAction | null; name: string | null; decision: ClipDecision }>({ current: null, name: null, decision: newDecision() });

  useEffect(
    () => () => {
      live.current.current = null;
      live.current.name = null;
      rig.mixer.stopAllAction();
      for (const { material } of rig.flashables) material.dispose();
    },
    [rig],
  );

  useEffect(() => {
    if (DEBUG) modelDebug.clips = [...rig.available];
  }, [rig]);

  useFrame((_, delta) => {
    const { mixer, actions, available } = rig;
    const state = live.current;
    const decision = state.decision;
    decide(available, decision);
    if (decision.clip !== state.name) {
      const next = decision.clip === null ? null : (actions.get(decision.clip) ?? null);
      state.current?.fadeOut(FADE);
      if (next) {
        next.reset().setLoop(decision.loop ? LoopRepeat : LoopOnce, decision.loop ? Infinity : 1);
        next.clampWhenFinished = true;
        next.fadeIn(FADE).play();
      }
      state.current = next;
      state.name = decision.clip;
    }
    const action = state.current;
    if (action) {
      action.timeScale = decision.timeScale;
      if (decision.scrub !== null) {
        action.paused = true;
        action.time = decision.scrub * action.getClip().duration;
      } else action.paused = false;
    }
    mixer.update(delta);
    for (const { material, base } of rig.flashables) material.emissive.copy(base).lerp(FLASH, hitFlash);
    if (DEBUG) {
      modelDebug.clip = state.name;
      modelDebug.time = action?.time ?? 0;
      modelDebug.scrub = decision.scrub;
      modelDebug.loop = decision.loop;
    }
  });

  const portals = anchors
    ? Object.entries(anchors).map(([name, node]) => {
        const bone = rig.root.getObjectByName(name);
        return bone ? <group key={name}>{createPortal(node, bone)}</group> : null;
      })
    : null;

  return (
    <group rotation={[0, fit.rotationY ?? 0, 0]} position={rig.position}>
      <primitive object={rig.root} scale={rig.scale} />
      {portals}
    </group>
  );
}
