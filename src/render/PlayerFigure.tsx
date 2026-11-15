// The hero: a bronze figure seen from behind, always on screen. A fresh webcam frame drives it directly; with no
// frame for half a second (keyboard play, or the tracker lost the body) a stance computed from the fight takes over,
// blended over ~120 ms either way. It also steps about the arena: leaps with a landed strike, is knocked back on a hit.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { RefObject } from "react";
import { MathUtils, Vector3 } from "three";
import type { Group, Mesh } from "three";
import type { Landmark, PoseFrame } from "../core/types";
import { JOINT, joint } from "../pose/signals";
import { defendSeen } from "../hud/DefendFlash";
import { battle, calmMotion, decay, nowSeconds } from "./battle";
import { LOOKS, dodge, dodgeVariant, stepDodge } from "./effects/dodge/dodgeMotion";
import { HURT_SECONDS, STRIKE_SECONDS, blendPose, chooseAction, makePose, syntheticPose } from "./heroPose";
import type { HeroAction } from "./heroPose";

const J = JOINT;
const BONES: readonly (readonly [number, number])[] = [
  [J.leftShoulder, J.rightShoulder], [J.leftShoulder, J.leftElbow], [J.leftElbow, J.leftWrist],
  [J.rightShoulder, J.rightElbow], [J.rightElbow, J.rightWrist], [J.leftShoulder, J.leftHip],
  [J.rightShoulder, J.rightHip], [J.leftHip, J.rightHip], [J.leftHip, J.leftKnee],
  [J.leftKnee, J.leftAnkle], [J.rightHip, J.rightKnee], [J.rightKnee, J.rightAnkle],
];
const HIP_HEIGHT = 0.95;
const UP = new Vector3(0, 1, 0);
export const HOME_Z = 1.2;
/** No new webcam frame for this long and the stance takes over. */
const STALE_SECONDS = 0.5;
const BLEND_SECONDS = 0.12;
/** How far a dodge throws him sideways (metres). */
const DODGE_X = 0.9;
const SETTLE_SECONDS = 0.8;
const DODGE_LOOK = dodgeVariant(window.location.search);
const BRONZE = <meshStandardMaterial color="#c8963c" metalness={0.8} roughness={0.35} />;

// MediaPipe's y points down and its origin is the hips; lift the figure so its feet touch the floor.
function place(target: Vector3, point: Landmark): Vector3 {
  return target.set(point.x, HIP_HEIGHT - point.y, point.z);
}

type Rig = ReturnType<typeof makeRig>;

function makeRig() {
  return {
    shown: makePose(), from: makePose(), target: makePose(), key: "" as HeroAction | "live" | "", blendT: 1,
    lastFrame: null as PoseFrame | null, lastSeen: -Infinity, a: new Vector3(), b: new Vector3(), c: new Vector3(), dir: new Vector3(),
  };
}

function progressOf(action: HeroAction, now: number): number {
  switch (action) {
    case "punch": case "thrust": return (now - battle.struckAt) / STRIKE_SECONDS;
    case "hurt": return (now - battle.playerHitAt) / HURT_SECONDS;
    case "victory": return (now - battle.wonAt) / SETTLE_SECONDS;
    case "defeat": return (now - battle.lostAt) / SETTLE_SECONDS;
    default: return 0;
  }
}

export function PlayerFigure({ poseRef }: { poseRef: RefObject<PoseFrame | null> }) {
  const bones = useRef<(Mesh | null)[]>([]);
  const torso = useRef<Mesh>(null);
  const head = useRef<Mesh>(null);
  const fists = useRef<(Mesh | null)[]>([]);
  const figure = useRef<Group>(null);
  const rigRef = useRef<Rig | null>(null);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = nowSeconds();
    const rig = (rigRef.current ??= makeRig());
    const { a, b, c, dir } = rig;
    const frame = poseRef.current;
    if (frame !== rig.lastFrame) {
      rig.lastFrame = frame;
      rig.lastSeen = now;
    }
    const live = frame !== null && now - rig.lastSeen < STALE_SECONDS;
    const phase = battle.state?.phase;
    const action = chooseAction({
      held: battle.held, struckMove: battle.struckMove, sinceStrike: now - battle.struckAt,
      sinceHurt: now - battle.playerHitAt, won: phase?.kind === "won", lost: phase?.kind === "lost",
      finisherMove: phase?.kind === "finisher" ? phase.move : null,
    });
    const key = live ? "live" : action;
    const target = live ? frame.world : syntheticPose(action, now, progressOf(action, now), rig.target);
    if (key !== rig.key) {
      // The first frame snaps to the pose; after that a change of source blends from what is on screen.
      const first = rig.key === "";
      blendPose(rig.from, first ? target : rig.shown, first ? target : rig.shown, 0);
      rig.key = key;
      rig.blendT = first ? 1 : 0;
    }
    rig.blendT += dt;
    blendPose(rig.shown, rig.from, target, MathUtils.smoothstep(rig.blendT / BLEND_SECONDS, 0, 1));
    const pose = rig.shown;

    BONES.forEach(([from, to], index) => {
      const mesh = bones.current[index];
      if (!mesh) return;
      place(a, joint(pose, from));
      place(b, joint(pose, to));
      dir.subVectors(b, a);
      mesh.position.addVectors(a, b).multiplyScalar(0.5);
      mesh.scale.set(1, Math.max(dir.length(), 0.001), 1);
      mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    });
    if (torso.current) {
      // A box from the hips' midpoint up to the shoulders' midpoint.
      place(a, joint(pose, J.leftShoulder)).add(place(b, joint(pose, J.rightShoulder))).multiplyScalar(0.5);
      place(b, joint(pose, J.leftHip)).add(place(c, joint(pose, J.rightHip))).multiplyScalar(0.5);
      dir.subVectors(a, b);
      torso.current.position.addVectors(a, b).multiplyScalar(0.5);
      torso.current.scale.set(0.36, Math.max(dir.length(), 0.001), 0.2);
      torso.current.quaternion.setFromUnitVectors(UP, dir.normalize());
    }
    if (head.current) place(head.current.position, joint(pose, J.nose)).y += 0.03;
    fists.current.forEach((fist, index) => {
      if (fist) place(fist.position, joint(pose, index === 0 ? J.leftWrist : J.rightWrist));
    });

    // Steps about the arena, damped back to the mark. A strike adds no step: the leap carries him, and a mark that
    // drifted while he flew would make him slide after landing.
    const targetZ = 0.6 * decay(now, battle.playerHitAt, 0.4) + (action === "defeat" ? 0.4 : 0) - (action === "victory" ? 0.3 : 0);
    // The webcam lean already shows a dodge; only the stance needs help sliding.
    const targetX = live ? 0 : action === "dodgeLeft" ? -DODGE_X : action === "dodgeRight" ? DODGE_X : 0;
    // Dodges snap aside and back; the other steps ease. ?dodge=1..4 carry him on a spring instead (effects/dodge).
    const look = DODGE_LOOK > 0 && !calmMotion() ? LOOKS[DODGE_LOOK] : null;
    stepDodge(dodge, look, {
      now, dt, held: battle.held, seen: defendSeen(phase ?? { kind: "intro", msLeft: 0 }), defendedAt: battle.defendedAt,
      defendedMove: battle.defendedMove, live,
    });
    battle.heroX = look ? dodge.x : MathUtils.damp(battle.heroX, targetX, 18, dt);
    battle.heroZ = MathUtils.damp(battle.heroZ, targetZ, 9, dt);
    // A counted strike's leap to the monster is measured on the GLB hero (hero/reach.ts); this figure rides along.
    figure.current?.position.set(battle.heroX + battle.reachX, battle.reachY, HOME_Z + battle.heroZ + battle.reachZ);
  });

  return (
    <group ref={figure} position={[0, 0, HOME_Z]}>
      {BONES.map((_, index) => (
        <mesh key={index} ref={(mesh) => { bones.current[index] = mesh; }}>
          <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
          {BRONZE}
        </mesh>
      ))}
      <mesh ref={torso}>
        <boxGeometry args={[1, 1, 1]} />
        {BRONZE}
      </mesh>
      <mesh ref={head}>
        <sphereGeometry args={[0.15, 16, 16]} />
        {BRONZE}
      </mesh>
      {[0, 1].map((index) => (
        <mesh key={index} ref={(mesh) => { fists.current[index] = mesh; }}>
          <sphereGeometry args={[0.075, 12, 12]} />
          {BRONZE}
        </mesh>
      ))}
    </group>
  );
}
