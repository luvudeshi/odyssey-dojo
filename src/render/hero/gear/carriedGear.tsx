// The spartan's shield, spear and stake. The round shield always rides on his back, over the cape, so both hands are
// free to punch and block. In the Hoplite style the spear is slung across the back too. The spear (Hoplite moves) and
// the stake (the stake finisher) appear in the right hand only while their move plays; heldGear says when.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { ReactNode } from "react";
import { MathUtils } from "three";
import type { Group } from "three";
import { battle, nowSeconds } from "../../battle";
import { BoneMount } from "../../models/boneMount";
import { heldGear, spearSlung } from "../gearRule";
import { newInput, readInput } from "../heroInput";
import { BRONZE, BRONZE_DARK, Bronze, LEATHER, WOOD } from "./spartanGear";
import { TIMING } from "./timing";

/** Round bronze shield slung on the upper back, face out, boss to the camera that looks at his back. */
/** Duller than the armour: a big flat disc mirrors the sun and blows out to white when the hero ducks under the camera. */
function Matte({ color = BRONZE }: { color?: string }) {
  return <meshStandardMaterial color={color} metalness={0.25} roughness={0.85} flatShading />;
}

export function BackShield() {
  return (
    <group position={[0, -0.06, -0.19]} rotation={[0.08, 0, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.05, 14]} />
        <Matte />
      </mesh>
      <mesh position={[0, 0, -0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.22, 0.03, 14]} />
        <Matte color={BRONZE_DARK} />
      </mesh>
      <mesh position={[0, 0, -0.06]}>
        <icosahedronGeometry args={[0.055, 0]} />
        <Matte />
      </mesh>
    </group>
  );
}

/** A spear: grip at the origin, 0.55 m of butt behind it and 1.5 m of shaft and a leaf blade ahead (+y). */
function SpearBody() {
  return (
    <>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 2.1, 6]} />
        <meshStandardMaterial color={WOOD} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 1.66, 0]} castShadow>
        <coneGeometry args={[0.045, 0.3, 4]} />
        <Bronze />
      </mesh>
      <mesh position={[0, -0.55, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.025, 0.12, 4]} />
        <Bronze color={BRONZE_DARK} />
      </mesh>
    </>
  );
}

/** The Hoplite's spear on his back: diagonal across the shield, point over his shoulder. Hidden while it is in his hand. */
export function SlungSpear() {
  const group = useRef<Group>(null);
  useFrame(() => {
    if (group.current) group.current.visible = spearSlung(battle.styleId, heldNow());
  });
  return (
    <group ref={group} position={[0.12, -0.55, -0.33]} rotation={[0, 0, -0.42]} scale={0.8}>
      <SpearBody />
    </group>
  );
}

const probe = newInput();

function heldNow() {
  return heldGear(TIMING, readInput(probe, nowSeconds()), battle.styleId);
}

const IDLE_PITCH = -0.18;
const THRUST_PITCH = -Math.PI / 2 + 0.05;
const CHOP_PITCH = -1.05;

/** What the right hand holds: the spear or the stake, scaled in while its move plays and out when it ends. */
export function HandGear() {
  const aim = useRef<Group>(null);
  const spear = useRef<Group>(null);
  const stake = useRef<Group>(null);
  const pitch = useRef(IDLE_PITCH);
  const input = useRef(newInput());
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const i = readInput(input.current, nowSeconds());
    const held = heldGear(TIMING, i, battle.styleId);
    const target = i.struckMove === "overhead_strike" ? CHOP_PITCH : THRUST_PITCH;
    pitch.current = MathUtils.damp(pitch.current, held === "none" ? IDLE_PITCH : target, 40, dt);
    if (aim.current) aim.current.rotation.set(pitch.current, 0, 0);
    for (const [ref, kind] of [[spear, "spear"], [stake, "stake"]] as const) {
      const g = ref.current;
      if (!g) continue;
      const s = MathUtils.damp(g.scale.x, held === kind ? 1 : 0, 30, dt);
      g.scale.setScalar(s);
      g.visible = s > 0.03;
    }
  });
  return (
    <group ref={aim}>
      <group ref={spear} scale={0} visible={false}>
        <SpearBody />
      </group>
      <group ref={stake} scale={0} visible={false}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.03, 1.3, 6]} />
          <meshStandardMaterial color={WOOD} roughness={1} flatShading />
        </mesh>
        <mesh position={[0, 1.15, 0]} castShadow>
          <coneGeometry args={[0.035, 0.3, 5]} />
          <meshStandardMaterial color={LEATHER} roughness={1} flatShading />
        </mesh>
      </group>
    </group>
  );
}

export function World({ children }: { children: ReactNode }) {
  return <BoneMount>{children}</BoneMount>;
}
