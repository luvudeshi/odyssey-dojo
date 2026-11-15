// One downloaded GLB in the strait, for the ?look= alternates: scaled to a size, centred, bottom on y=0, with an
// optional clip driven each frame. Rigged or not. Fit uses the mesh box (the rig-bone fit in RiggedModel fails on
// the flat fish), and skinned meshes are never culled.
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { AnimationMixer, Box3, Color, LoopOnce, LoopRepeat, Vector3 } from "three";
import type { AnimationAction, Material, Mesh, Object3D } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

export interface ClipPick {
  /** Part of a clip's name. Nothing plays when it matches no clip. */
  readonly clip: string;
  /** 0..1 to hold the clip at a point (a windup); null to let it play. */
  readonly scrub: number | null;
  readonly loop: boolean;
  readonly speed: number;
}

export interface GlbProps {
  readonly url: string;
  /** Target size in metres, along the model's height or its longest side. */
  readonly size: number;
  readonly by?: "height" | "longest";
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  /** Tint multiplied into every colour, to pull a bright pack toward the storm light. */
  readonly tint?: string;
  readonly pick?: (out: ClipPick) => ClipPick | null;
  /** Use only this named node of a multi-part file (one rock of a set). */
  readonly node?: string;
  /** Time offset so copies do not move together. */
  readonly phase?: number;
}

function isMesh(node: Object3D): node is Mesh {
  return (node as { isMesh?: boolean }).isMesh === true;
}

function tinted(material: Material, tint: Color): void {
  const colored = material as Material & { color?: Color };
  if (colored.color) colored.color.multiply(tint);
}

export function Glb({ url, size, by = "longest", position = [0, 0, 0], rotation = [0, 0, 0], tint, pick, phase = 0, node }: GlbProps) {
  const gltf = useGLTF(url);
  const rig = useMemo(() => {
    const part = node ? gltf.scene.getObjectByName(node) : undefined;
    const root = clone(part ?? gltf.scene);
    if (part) {
      root.position.set(0, 0, 0);
      root.quaternion.identity();
      root.scale.set(1, 1, 1);
    }
    const multiply = tint ? new Color(tint) : null;
    root.traverse((node) => {
      if (!isMesh(node)) return;
      node.frustumCulled = false;
      node.castShadow = true;
      const own = Array.isArray(node.material) ? node.material.map((m) => m.clone()) : node.material.clone();
      node.material = own;
      if (multiply) for (const m of Array.isArray(own) ? own : [own]) tinted(m, multiply);
    });
    // Measure the file's own scene: a cloned rig reports a box a hundred times too big until it is posed.
    gltf.scene.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(part ?? gltf.scene);
    const dims = box.getSize(new Vector3());
    const base = by === "height" ? dims.y : Math.max(dims.x, dims.y, dims.z);
    const scale = base > 1e-6 ? size / base : 1;
    const centre = box.getCenter(new Vector3());
    const mixer = new AnimationMixer(root);
    const actions = gltf.animations.map((clip) => ({ name: clip.name, action: mixer.clipAction(clip) }));
    return { root, scale, offset: [-centre.x * scale, -box.min.y * scale, -centre.z * scale] as const, mixer, actions };
  }, [gltf, size, by, tint, node]);
  const state = useRef<{ current: AnimationAction | null; name: string | null; out: ClipPick }>({
    current: null,
    name: null,
    out: { clip: "", scrub: null, loop: true, speed: 1 },
  });
  useEffect(
    () => () => {
      state.current.current = null;
      state.current.name = null;
      rig.mixer.stopAllAction();
    },
    [rig],
  );
  useFrame((_, delta) => {
    const s = state.current;
    const decision = pick ? pick(s.out) : null;
    const found = decision ? rig.actions.find((a) => a.name.includes(decision.clip)) : undefined;
    if ((found?.name ?? null) !== s.name) {
      s.current?.fadeOut(0.2);
      if (found && decision) {
        found.action.reset().setLoop(decision.loop ? LoopRepeat : LoopOnce, decision.loop ? Infinity : 1);
        found.action.clampWhenFinished = true;
        found.action.time = decision.loop ? phase % found.action.getClip().duration : 0;
        found.action.fadeIn(0.2).play();
      }
      s.current = found?.action ?? null;
      s.name = found?.name ?? null;
    }
    if (s.current && decision) {
      s.current.timeScale = decision.speed;
      s.current.paused = decision.scrub !== null;
      if (decision.scrub !== null) s.current.time = decision.scrub * s.current.getClip().duration;
    }
    rig.mixer.update(Math.min(delta, 0.05));
  });
  return (
    <group position={[...position]} rotation={[...rotation]}>
      <group position={[...rig.offset]}>
        <primitive object={rig.root} scale={rig.scale} />
      </group>
    </group>
  );
}
