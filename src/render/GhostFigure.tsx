// The move ghost: a see-through gold figure that stands to the right of the hero during a prompt and shows the pose
// the move asks for. It brightens as the live webcam pose gets close, fades as the move is learned, and hides outside
// prompts. The blue ghost of the live pose (hero/Hero.tsx) stands on the left; this one never overlaps the hero.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { MeshBasicMaterial, Quaternion, Vector3 } from "three";
import type { Group, Mesh } from "three";
import type { Baseline, PoseFrame } from "../core/types";
import { MOVES } from "../moves/registry";
import { baselineOf } from "../pose/signals";
import { battle, nowSeconds } from "./battle";
import { ghostCloseness, ghostJoints, ghostOpacity, promptedMove } from "./ghost/ghostPose";
import type { GhostJoints, Vec3 } from "./ghost/ghostPose";

const DEBUG = new URLSearchParams(window.location.search).has("debug");
const MATERIAL = new MeshBasicMaterial({ color: "#ffd54a", transparent: true, opacity: 0.5, depthWrite: false, fog: false });
const SCALE = 0.9;
/** The ghost is pinned to the camera, so every shot (the strike push-in, the finisher orbit) frames it the same way:
 * this far ahead of the lens, right of centre, with its feet this far below the middle of the view. */
const DIST = 3.2;
const RIGHT = 1.3;
const FEET_Y = -1.25;
const STALE_SECONDS = 0.5;
/** How fast the resting shoulders are tracked, per frame: slow enough that a held dodge does not become the rest. */
const REST_RATE = 0.01;
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3();
const SIDE = new Vector3();
const LIFT = new Vector3();
const BONES: readonly (readonly [keyof GhostJoints, keyof GhostJoints, number])[] = [
  ["leftShoulder", "rightShoulder", 0.04], ["leftShoulder", "leftElbow", 0.045], ["leftElbow", "leftWrist", 0.04],
  ["rightShoulder", "rightElbow", 0.045], ["rightElbow", "rightWrist", 0.04], ["leftHip", "rightHip", 0.05],
  ["leftHip", "leftKnee", 0.06], ["leftKnee", "leftFoot", 0.05], ["rightHip", "rightKnee", 0.06],
  ["rightKnee", "rightFoot", 0.05], ["leftShoulder", "leftHip", 0.04], ["rightShoulder", "rightHip", 0.04],
];

function between(mesh: Mesh, a: Vec3, b: Vec3, tmp: Vector3, q: Quaternion): void {
  tmp.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const length = Math.max(tmp.length(), 0.001);
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  mesh.scale.y = length;
  mesh.quaternion.copy(q.setFromUnitVectors(UP, tmp.divideScalar(length)));
}

export function GhostFigure({ poseRef }: { poseRef: RefObject<PoseFrame | null> }) {
  const group = useRef<Group>(null);
  const bones = useRef<(Mesh | null)[]>([]);
  const head = useRef<Mesh>(null);
  const fists = useRef<(Mesh | null)[]>([]);
  const shown = useRef("");
  const rest = useRef<Baseline | null>(null);
  const seen = useRef<{ frame: PoseFrame | null; at: number }>({ frame: null, at: -Infinity });

  useEffect(() => { if (DEBUG) Object.assign(window, { __poseRef: poseRef, __ghostMaterial: MATERIAL }); }, [poseRef]);
  const tmp = useMemo(() => new Vector3(), []);
  const quat = useMemo(() => new Quaternion(), []);

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const state = battle.state;
    const id = promptedMove(state?.phase);
    const move = id === null ? undefined : MOVES.get(id);
    g.visible = move !== undefined;
    if (!move || !state) { shown.current = ""; return; }
    FORWARD.set(0, 0, -1).applyQuaternion(camera.quaternion);
    SIDE.set(1, 0, 0).applyQuaternion(camera.quaternion);
    LIFT.set(0, 1, 0).applyQuaternion(camera.quaternion);
    g.position.copy(camera.position).addScaledVector(FORWARD, DIST).addScaledVector(SIDE, RIGHT).addScaledVector(LIFT, FEET_Y);
    g.rotation.y = Math.atan2(-FORWARD.x, -FORWARD.z); // back to the lens whichever way the camera looks
    if (shown.current !== move.id) {
      shown.current = move.id;
      const j = ghostJoints(move.diagram);
      BONES.forEach(([from, to], index) => {
        const mesh = bones.current[index];
        if (mesh) between(mesh, j[from], j[to], tmp, quat);
      });
      head.current?.position.set(...j.head);
      fists.current[0]?.position.set(...j.leftWrist);
      fists.current[1]?.position.set(...j.rightWrist);
    }
    const now = nowSeconds();
    const frame = poseRef.current;
    if (frame !== seen.current.frame) {
      seen.current.frame = frame;
      seen.current.at = now;
      if (frame) {
        const current = baselineOf([frame]);
        const old = rest.current;
        rest.current = old
          ? {
              centerX: old.centerX + (current.centerX - old.centerX) * REST_RATE,
              shoulderY: old.shoulderY + (current.shoulderY - old.shoulderY) * REST_RATE,
              shoulderWidth: old.shoulderWidth + (current.shoulderWidth - old.shoulderWidth) * REST_RATE,
            }
          : current;
      }
    }
    const live = frame !== null && now - seen.current.at < STALE_SECONDS;
    MATERIAL.opacity = ghostOpacity(state.mastery[move.id] ?? 0, live ? ghostCloseness(frame, move.diagram, rest.current) : null);
  });

  return (
    <group ref={group} scale={SCALE} visible={false}>
      {BONES.map(([from, to, radius]) => (
        <mesh key={`${from}-${to}`} ref={(mesh) => { bones.current[BONES.findIndex((b) => b[0] === from && b[1] === to)] = mesh; }} material={MATERIAL}>
          <cylinderGeometry args={[radius, radius, 1, 8]} />
        </mesh>
      ))}
      <mesh ref={head} material={MATERIAL}><sphereGeometry args={[0.13, 16, 12]} /></mesh>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(mesh) => { fists.current[i] = mesh; }} material={MATERIAL}><sphereGeometry args={[0.07, 10, 8]} /></mesh>
      ))}
    </group>
  );
}
