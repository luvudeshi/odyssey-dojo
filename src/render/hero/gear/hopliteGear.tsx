// Code-built hoplite gear for the Adventurer rig: Corinthian helmet with a crest, round bronze shield, crimson cape,
// cuirass, tunic skirt, greaves and a spear. Each piece hangs on a bone through BoneMount, so sizes are in metres.
// Bone axes at the hero (model turned half a circle): +y up the body, +z the way the hero faces. Gear on the hands
// is mounted on world axes instead (the hero always faces -z toward the giant), so it keeps its facing while the arm moves.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { DoubleSide, MathUtils, MeshStandardMaterial, PlaneGeometry } from "three";
import type { Group } from "three";
import { battle, nowSeconds } from "../../battle";
import { BoneMount } from "../../models/boneMount";
import { shieldRaised, spearMode } from "./hopliteState";
import type { GearInput } from "./hopliteState";
import type { Timed } from "../heroClips";

const bronze = new MeshStandardMaterial({ color: "#c08a3c", metalness: 0.45, roughness: 0.5, flatShading: true });
const darkBronze = new MeshStandardMaterial({ color: "#8a5e26", metalness: 0.4, roughness: 0.6, flatShading: true });
const crimson = new MeshStandardMaterial({ color: "#b02a35", roughness: 1, flatShading: true, side: DoubleSide });
const linen = new MeshStandardMaterial({ color: "#efe6d2", roughness: 1, flatShading: true, side: DoubleSide });
const wood = new MeshStandardMaterial({ color: "#8a5a30", roughness: 1, flatShading: true });
const iron = new MeshStandardMaterial({ color: "#aeb4bb", metalness: 0.6, roughness: 0.4, flatShading: true });

const CREST = Array.from({ length: 7 }, (_, i) => {
  const t = -0.95 + (i * 1.9) / 6;
  return { z: 0.15 * Math.sin(t), y: 0.15 * Math.cos(t), tilt: t, h: 0.05 + 0.06 * Math.cos(t * 1.3) };
});

export function Helmet() {
  return (
    <BoneMount follow>
      <group position={[0, 0.125, 0.005]}>
        <mesh material={bronze} scale={[1, 1.02, 1.1]}><sphereGeometry args={[0.135, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.68]} /></mesh>
        {[-1, 1].map((s) => <mesh key={s} material={bronze} position={[s * 0.115, -0.085, 0.035]}><boxGeometry args={[0.03, 0.12, 0.13]} /></mesh>)}
        <mesh material={bronze} position={[0, -0.03, 0.14]}><boxGeometry args={[0.035, 0.12, 0.03]} /></mesh>
        <mesh material={darkBronze} position={[0, -0.07, -0.12]} rotation={[0.35, 0, 0]}><boxGeometry args={[0.22, 0.05, 0.1]} /></mesh>
        {CREST.map((c, i) => (
          <mesh key={i} material={crimson} position={[0, c.y, c.z]} rotation={[c.tilt, 0, 0]}><boxGeometry args={[0.035, c.h, 0.06]} /></mesh>
        ))}
      </group>
    </BoneMount>
  );
}

export function Cuirass() {
  return (
    <BoneMount follow>
      <group position={[0, -0.04, 0]}>
        <mesh material={bronze} scale={[1.2, 1, 0.6]}><cylinderGeometry args={[0.17, 0.15, 0.36, 9]} /></mesh>
        <mesh material={darkBronze} position={[0, 0.2, 0]} scale={[1.5, 1, 0.9]}><cylinderGeometry args={[0.15, 0.17, 0.05, 9]} /></mesh>
      </group>
    </BoneMount>
  );
}

/** A linen tunic skirt over the upper thighs with a crimson hem. */
export function Skirt() {
  return (
    <BoneMount follow>
      <group position={[0, -0.15, 0]}>
        <mesh material={linen}><cylinderGeometry args={[0.18, 0.27, 0.3, 10, 1, true]} /></mesh>
        <mesh material={crimson} position={[0, -0.15, 0]}><cylinderGeometry args={[0.27, 0.275, 0.04, 10, 1, true]} /></mesh>
      </group>
    </BoneMount>
  );
}

export function Greave() {
  return (
    <BoneMount follow>
      <mesh material={bronze} position={[0, 0.22, 0]}><cylinderGeometry args={[0.075, 0.062, 0.3, 8, 1, true]} /></mesh>
    </BoneMount>
  );
}

function capeGeometry(): PlaneGeometry {
  const g = new PlaneGeometry(0.4, 0.78, 4, 5);
  const p = g.attributes.position;
  if (!p) return g;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const down = 0.39 - y;
    p.setX(i, x * (1 + down * 0.3));
    p.setZ(i, Math.sin(x * 22) * 0.02 * (down / 0.78) + down * 0.1);
  }
  g.computeVertexNormals();
  return g;
}

/** Crimson cape from the shoulders, hanging down the back with a slow sway. */
export function Cape() {
  const geometry = useMemo(() => capeGeometry(), []);
  const sway = useRef<Group>(null);
  useFrame(() => {
    const g = sway.current;
    if (!g) return;
    const t = nowSeconds();
    g.rotation.x = 0.05 + 0.04 * Math.sin(t * 1.7) + (battle.held.has("duck") ? 0.15 : 0);
  });
  return (
    <BoneMount follow>
      <group position={[0, 0.17, -0.26]}>
        <group ref={sway} position={[0, 0, 0]}>
          <mesh geometry={geometry} material={crimson} position={[0, -0.39, 0]} rotation={[0, Math.PI, 0]} />
        </group>
        <mesh material={darkBronze} position={[0, 0, 0.02]}><boxGeometry args={[0.36, 0.03, 0.05]} /></mesh>
      </group>
    </BoneMount>
  );
}

/**
 * Round bronze aspis on the left wrist. The baked guard pose holds the hand out in front, and on that wrist y points at
 * the giant, x up and z outward, so the disc faces forward by default; Block lifts it to cover the chest.
 */
export function Shield() {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const up = shieldRaised(battle.held);
    const k = Math.min(delta, 0.05);
    g.position.x = MathUtils.damp(g.position.x, up ? 0.2 : 0.04, 16, k);
    g.position.z = MathUtils.damp(g.position.z, up ? -0.12 : -0.06, 16, k);
  });
  return (
    <BoneMount follow>
      <group ref={group} position={[0.04, 0.1, -0.06]}>
        <mesh material={wood}><cylinderGeometry args={[0.34, 0.34, 0.04, 14]} /></mesh>
        <mesh material={bronze} position={[0, 0.026, 0]}><cylinderGeometry args={[0.335, 0.33, 0.016, 14]} /></mesh>
        <mesh material={darkBronze} position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.33, 0.022, 5, 14]} /></mesh>
        <mesh material={darkBronze} position={[0, 0.032, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.22, 0.012, 4, 14]} /></mesh>
        <mesh material={bronze} position={[0, 0.04, 0]} scale={[1, 0.45, 1]}><sphereGeometry args={[0.085, 8, 6]} /></mesh>
      </group>
    </BoneMount>
  );
}

const UP = Math.PI / 2;

/** Spear in the right hand: upright while carried, level and pointing at the giant on a thrust, hidden while a fist is thrown. */
export function Spear({ punch, thrust }: { punch: Timed; thrust: Timed }) {
  const group = useRef<Group>(null);
  const grip = useRef<Group>(null);
  const reach = useRef(0);
  const shown = useRef(1);
  const input = useRef<{ -readonly [K in keyof GearInput]: GearInput[K] }>({ held: new Set(), struckMove: "", sinceStrike: Infinity, finisherMove: null, lost: false });
  useFrame((_, delta) => {
    const g = group.current;
    const h = grip.current;
    if (!g || !h) return;
    const i = input.current;
    i.held = battle.held;
    i.struckMove = battle.struckMove;
    i.sinceStrike = nowSeconds() - battle.struckAt;
    i.finisherMove = battle.state?.phase.kind === "finisher" ? battle.state.phase.move : null;
    i.lost = battle.state?.phase.kind === "lost";
    const mode = spearMode(i, punch, thrust);
    const k = Math.min(delta, 0.05);
    reach.current = MathUtils.damp(reach.current, mode === "thrust" ? 1 : 0, 22, k);
    shown.current = MathUtils.damp(shown.current, mode === "away" ? 0 : 1, 30, k);
    g.visible = shown.current > 0.2;
    // carried: the shaft stands in the fist, tip leaning a touch toward the giant; thrust: level, aimed at his body
    h.rotation.x = MathUtils.lerp(-0.06, -UP + 0.12, reach.current);
    h.position.z = -0.3 * reach.current;
  });
  return (
    <BoneMount>
      <group ref={group}>
        <group ref={grip}>
          <mesh material={wood} position={[0, 0.2, 0]}><cylinderGeometry args={[0.017, 0.02, 2.2, 6]} /></mesh>
          <mesh material={iron} position={[0, 1.38, 0]}><coneGeometry args={[0.04, 0.3, 6]} /></mesh>
          <mesh material={bronze} position={[0, -0.96, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.022, 0.12, 6]} /></mesh>
          <mesh material={darkBronze} position={[0, 1.2, 0]}><cylinderGeometry args={[0.03, 0.03, 0.04, 6]} /></mesh>
        </group>
      </group>
    </BoneMount>
  );
}
