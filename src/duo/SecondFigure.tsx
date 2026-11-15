// Two players on one camera: player two's own figure, standing beside the hero and moved by player two's body.
// It is the same spartan the hero is, in other colours, and is drawn only while two people are playing.
// Mounted inside the fight's 3D scene, next to <Hero>:  <SecondFigure />
import { useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useRef, useState } from "react";
import type { Color, Material, Mesh, Object3D } from "three";
import type { PoseFrame } from "../core/types";
import { nowSeconds } from "../render/battle";
import { ErrorBoundary } from "../render/ErrorBoundary";
import { candidate as spartan } from "../render/hero/defs/spartan";
import { chooseHeroPose, decideHeroPose } from "../render/hero/heroClips";
import { newInput, readInput } from "../render/hero/heroInput";
import type { MutableInput } from "../render/hero/heroInput";
import { trackShare } from "../render/hero/track/blend";
import { createBodyTracker } from "../render/hero/track/BodyTracker";
import type { BodyTracker } from "../render/hero/track/BodyTracker";
import { RiggedModel } from "../render/models/RiggedModel";
import { HOME_Z } from "../render/PlayerFigure";
import { friendDrawn, friendStage } from "../net/friendStage";
import { duoCamera } from "./duoCamera";
import type { DuoCamera } from "./duoCamera";
import { secondDrawn } from "./secondDrawn";

/** Metres to the hero's right (player two stands on the right of the picture), and half a step nearer the monster, so the HUD at the bottom does not cover it. */
export const SECOND_PLACE: readonly [number, number, number] = [1.25, 0, HOME_Z - 0.2];
/** How far round the colour wheel player two's colours are turned from the hero's, so the two are told apart. */
const HUE_TURN = 0.55;
const NO_MOVES: ReadonlySet<string> = new Set();

function isMesh(node: Object3D): node is Mesh {
  return (node as { isMesh?: boolean }).isMesh === true;
}

/** `camera` moves the figure with player two's body; `friend` plays the hero's own clips for an online friend instead. */
function Spartan({ camera, friend }: { camera: DuoCamera | null; friend: boolean }) {
  const trackers = useRef(new WeakMap<Object3D, BodyTracker>());
  const input = useRef<MutableInput>(newInput());
  const frame = useRef<PoseFrame | null>(null);
  const prepare = useCallback((root: Object3D): void => {
    root.traverse((node) => {
      if (!isMesh(node)) return;
      const hex = spartan.tint?.[node.name];
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        const color = (material as Material & { color?: Color }).color;
        if (hex) color?.set(hex);
        color?.offsetHSL(HUE_TURN, 0, 0);
      }
    });
    spartan.prepare?.(root);
    const tracker = createBodyTracker(root);
    if (tracker) trackers.current.set(root, tracker);
  }, []);
  /** What the clips are told: hurt, won and lost come from the fight; the strikes and defends are player two's own body. */
  const read = (now: number): MutableInput => {
    const out = readInput(input.current, now) as MutableInput;
    out.held = friend ? friendStage.held : NO_MOVES;
    out.struckMove = friend ? friendStage.struckMove : "";
    out.sinceStrike = friend ? now - friendStage.struckAt : Infinity;
    return out;
  };
  return (
    <RiggedModel
      url={spartan.url}
      fit={spartan.fit}
      prepare={prepare}
      anchors={spartan.anchors}
      tweakMaterial={spartan.tweakMaterial}
      afterMixer={(root, delta) => {
        const now = nowSeconds();
        if (friend) friendDrawn.at = performance.now();
        else secondDrawn.at = performance.now();
        frame.current = camera?.second(now * 1000) ?? frame.current;
        trackers.current.get(root)?.update(frame.current, now, delta, trackShare(read(now), spartan.rig.hurt.seconds));
      }}
      decide={(available, out) => {
        const i = read(nowSeconds());
        return decideHeroPose(spartan.rig, chooseHeroPose(spartan.rig, i), i, available, out);
      }}
    />
  );
}

export function SecondFigure({ camera = duoCamera }: { camera?: DuoCamera }) {
  const [here, setHere] = useState(false);
  useFrame(() => {
    const two = camera.players(performance.now()) === 2;
    if (two !== here) setHere(two);
  });
  if (!here) return null;
  return (
    <group position={[...SECOND_PLACE]}>
      <ErrorBoundary label="second-figure" fallback={null}>
        <Suspense fallback={null}>
          <Spartan camera={camera} friend={false} />
        </Suspense>
      </ErrorBoundary>
    </group>
  );
}

/** The friend of an online room, on the same spot: shown while friendStage says they are in the fight. */
export function FriendFigure() {
  const [here, setHere] = useState(false);
  useFrame(() => { if (friendStage.here !== here) setHere(friendStage.here); });
  if (!here) return null;
  return (
    <group position={[...SECOND_PLACE]}>
      <ErrorBoundary label="friend-figure" fallback={null}>
        <Suspense fallback={null}>
          <Spartan camera={null} friend />
        </Suspense>
      </ErrorBoundary>
    </group>
  );
}
