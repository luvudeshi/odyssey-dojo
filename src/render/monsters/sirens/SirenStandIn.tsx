// Plain stand-in used only if the real Siren fails to build: a violet bird body, a woman's torso and head, two
// slab wings that spread with the windup. It keeps the fight readable instead of showing a blank screen.
import type { MonsterProps } from "../../../core/types";

export function SirenStandIn({ windup, defeated }: MonsterProps) {
  const open = defeated ? -0.3 : 0.4 + windup * 0.7;
  return (
    <group position={[0, defeated ? -0.5 : 0, 0]}>
      <mesh position={[0, 1.7, 0]} scale={[1, 1.15, 1.25]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#5a3aa0" flatShading />
      </mesh>
      <mesh position={[0, 2.8, 0.05]} castShadow>
        <cylinderGeometry args={[0.4, 0.55, 0.9, 8]} />
        <meshStandardMaterial color="#f7f0de" flatShading />
      </mesh>
      <mesh position={[0, 3.7, 0.05]} castShadow>
        <icosahedronGeometry args={[0.32, 1]} />
        <meshStandardMaterial color="#ecb48c" flatShading />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.4, 3.0, -0.2]} rotation={[0, 0, side * open]}>
          <mesh position={[side * 1.4, -0.6, 0]} castShadow>
            <boxGeometry args={[2.8, 1.6, 0.1]} />
            <meshStandardMaterial color="#9a64d8" flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}
