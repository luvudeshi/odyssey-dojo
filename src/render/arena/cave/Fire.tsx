// The giant's fire pit: stylised flame cones, a flickering warm light and embers rising off it. The stones and logs
// are part of the merged homestead geometry.
import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, PointLight } from "three";
import { useQualityLevel } from "../../quality";
import { flicker } from "../layout";
import { FIRE } from "./mouthLayout";

const LIGHT = 70;

export function Fire() {
  const high = useQualityLevel() === "high";
  const light = useRef<PointLight>(null);
  const flame = useRef<Group>(null);
  useFrame(({ clock }) => {
    const level = flicker(clock.elapsedTime, 2);
    if (light.current) light.current.intensity = LIGHT * level;
    if (flame.current) flame.current.scale.set(0.85 + level * 0.2, 0.6 + level * 0.6, 0.85 + level * 0.2);
  });
  return (
    <group position={[FIRE.x, 0, FIRE.z]}>
      <group ref={flame} position={[0, 0.2, 0]}>
        {([[0, 0, 0.45, 0.95, 0], [0.3, 0.12, 0.3, 0.7, -0.35], [-0.28, -0.1, 0.3, 0.65, 0.4], [0.05, -0.3, 0.26, 0.55, 0.15]] as const).map(
          ([x, z, radius, height, lean], index) => (
            <mesh key={index} position={[x, height / 2, z]} rotation={[0, 0, lean]}>
              <coneGeometry args={[radius, height, 6]} />
              <meshBasicMaterial color={index === 0 ? [4, 1.3, 0.2] : [5, 2, 0.4]} toneMapped={false} fog={false} />
            </mesh>
          ),
        )}
        <mesh position={[0, 0.3, 0]}>
          <coneGeometry args={[0.2, 0.6, 5]} />
          <meshBasicMaterial color={[5, 3.6, 1.4]} toneMapped={false} fog={false} />
        </mesh>
      </group>
      <pointLight ref={light} position={[0, 1.3, 0]} color="#ff8a34" intensity={LIGHT} distance={16} decay={1.5} />
      <Sparkles count={high ? 36 : 14} scale={[1.2, 3.4, 1.2]} position={[0, 2, 0]} size={4} speed={0.9} opacity={1} color="#ffa040" />
    </group>
  );
}
