// Two bronze braziers either side of the fight: a flickering flame (three cones, no texture) and, on high quality,
// a warm light that picks out the fighters.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { AdditiveBlending } from "three";
import type { Group, PointLight } from "three";
import { nowSeconds } from "../../battle";
import { BRAZIERS, BRAZIER_HEIGHT } from "./yard";

function Flame({ at, phase, light }: { at: readonly [number, number, number]; phase: number; light: boolean }) {
  const group = useRef<Group>(null);
  const glow = useRef<PointLight>(null);
  useFrame(() => {
    const t = nowSeconds() * 7 + phase;
    const flicker = 1 + Math.sin(t) * 0.12 + Math.sin(t * 2.3) * 0.08;
    group.current?.scale.set(1, flicker, 1);
    group.current?.rotation.set(Math.sin(t * 0.6) * 0.05, t * 0.4, 0);
    if (glow.current) glow.current.intensity = 14 * flicker;
  });
  return (
    <group position={[at[0], BRAZIER_HEIGHT + 0.22, at[2]]}>
      <group ref={group}>
        <mesh position={[0, 0.3, 0]}>
          <coneGeometry args={[0.32, 0.8, 5]} />
          <meshBasicMaterial color="#ff8a2a" transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[0.05, 0.22, 0.03]}>
          <coneGeometry args={[0.2, 0.55, 5]} />
          <meshBasicMaterial color="#ffd36a" toneMapped={false} />
        </mesh>
      </group>
      {light && <pointLight ref={glow} position={[0, 0.6, 0.4]} color="#ff9a4a" intensity={14} distance={11} decay={2} />}
    </group>
  );
}

export function Braziers({ light }: { light: boolean }) {
  return (
    <>
      {BRAZIERS.map((at, i) => (
        <Flame key={at[0]} at={at} phase={i * 2} light={light} />
      ))}
    </>
  );
}
