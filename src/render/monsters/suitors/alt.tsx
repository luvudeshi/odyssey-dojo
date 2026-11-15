// Alternate suitors for the owner's look comparison (?look=a or ?look=b). One figure from a downloaded rigged GLB
// (KayKit, Gobkit; both CC0), fitted to a height, with its own weapons shown or hidden by phase and code-built props on the hand.
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type { Material, Object3D } from "three";
import { ErrorBoundary } from "../../ErrorBoundary";
import { decideMonsterClip } from "../../models/clipMap";
import type { MonsterClipConfig } from "../../models/clipMap";
import { BoneMount } from "../../models/boneMount";
import { RiggedModel } from "../../models/RiggedModel";
import { Pose } from "./Figure";
import type { FigureState } from "./Figure";
import { Helm, Hoof, Spear } from "./gear";
import { gearScale } from "./look";
import type { Palette } from "./look";

export interface AltSpec {
  readonly url: string;
  /** Bone-box height over the figure's true height: the fit measures bones, not the mesh. */
  readonly boneRatio: number;
  /** Lift in model units for rigs whose lowest bone sits above the sole. */
  readonly footOffset?: number;
  /** Multiplies the texture: warms or darkens the whole figure. */
  readonly tint: string;
  /** Every node name in the file that is a held weapon or shield; all are hidden except those listed in `shown`. */
  readonly weapons: readonly string[];
  /** Nodes always hidden (a horned hat that does not suit a Greek). */
  readonly hidden: readonly string[];
  /** Bone names after the loader has stripped the dots. */
  readonly head: string;
  readonly hand: string;
  /** Code-built crested helm on the head bone, in mannequin units, lifted by this much; null for none. */
  readonly helmY: number | null;
  /** Size of that helm over the mannequin-scale one. */
  readonly helmSize: number;
  /** Hand props turn: KayKit's hand slot has the weapon along its +y, Gobkit's hand bone is bare. */
  readonly handTurn: readonly [number, number, number];
}

export type Prop = "spear" | "hoof" | null;

export interface AltFigureProps {
  readonly spec: AltSpec;
  readonly height: number;
  readonly clips: MonsterClipConfig;
  readonly state: FigureState;
  readonly shown: readonly string[];
  readonly prop: Prop;
  readonly glow: number;
  readonly palette: Palette;
  readonly x?: number;
  readonly z?: number;
  readonly yaw?: number;
}

const BRONZE = "#b98a3e";

export function AltFigure({ spec, height, clips, state, shown, prop, glow, palette, x = 0, z = 0, yaw = 0 }: AltFigureProps) {
  const fit = useMemo(() => ({ targetHeight: height * spec.boneRatio, rotationY: 0, ...(spec.footOffset === undefined ? {} : { footOffset: spec.footOffset }) }), [height, spec]);
  const tweak = useMemo(
    () => (material: Material): void => {
      const m = material as Material & { color?: { set: (c: string) => void }; metalness?: number; roughness?: number };
      m.color?.set(spec.tint);
      if (m.metalness !== undefined) m.metalness = 0;
      if (m.roughness !== undefined) m.roughness = 0.9;
    },
    [spec.tint],
  );
  const nodes = useRef(new Map<string, Object3D | null>());
  const wanted = useRef<readonly string[]>(shown);
  useEffect(() => { wanted.current = shown; });
  const prepare = useCallback((root: Object3D): void => {
    nodes.current.clear();
    for (const name of [...spec.weapons, ...spec.hidden]) nodes.current.set(name, root.getObjectByName(name) ?? null);
    for (const name of spec.hidden) { const n = nodes.current.get(name); if (n) n.visible = false; }
  }, [spec]);
  // Weapons are switched every frame, after the mixer, so a phase change never reloads the model.
  const afterMixer = useCallback((): void => {
    for (const name of spec.weapons) {
      const node = nodes.current.get(name);
      if (node) node.visible = wanted.current.includes(name);
    }
  }, [spec]);
  const k = gearScale(height);
  const anchors = useMemo((): Record<string, ReactNode> => {
    const out: Record<string, ReactNode> = {};
    if (spec.helmY !== null) {
      out[spec.head] = <BoneMount follow><group scale={k * spec.helmSize} position={[0, spec.helmY * k, 0]}><Helm palette={palette} plume={0.8} metal={BRONZE} /></group></BoneMount>;
    }
    if (prop !== null) {
      out[spec.hand] = (
        <BoneMount follow>
          <group scale={k} rotation={[...spec.handTurn]}>
            {prop === "spear" ? <Spear glow={glow} /> : <Hoof />}
          </group>
        </BoneMount>
      );
    }
    return out;
  }, [spec, k, palette, prop, glow]);
  return (
    <Pose x={x} z={z} yaw={yaw}>
      <ErrorBoundary label="suitor-alt-glb" fallback={null}>
        <Suspense fallback={null}>
          <RiggedModel
            url={spec.url}
            fit={fit}
            hitFlash={state.hitFlash}
            tweakMaterial={tweak}
            prepare={prepare}
            afterMixer={afterMixer}
            anchors={anchors}
            decide={(available, out) => decideMonsterClip(clips, state, available, out)}
          />
        </Suspense>
      </ErrorBoundary>
    </Pose>
  );
}
