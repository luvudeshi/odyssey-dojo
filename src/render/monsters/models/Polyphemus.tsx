import type { MonsterProps } from "../../../core/types";
import type { MonsterModel } from "../registry";

const SKIN = "#8a6f5a";

function Polyphemus({ windup, attackId, weakSpotId, defeated }: MonsterProps) {
  const rightArm = attackId === "club_left" || attackId === "boulder" ? windup : 0;
  const leftArm = attackId === "club_right" || attackId === "grab" ? windup : 0;
  return (
    <group rotation={[defeated ? -1.2 : 0, 0, 0]}>
      <mesh position={[0, 2, 0]}>
        <capsuleGeometry args={[1.1, 1.6, 8, 16]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} />
      </mesh>
      <mesh position={[0, 4, 0]}>
        <sphereGeometry args={[0.9, 24, 24]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} />
      </mesh>
      <mesh position={[0, 4.1, 0.8]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          color="#fff6d8"
          emissive="#ffb300"
          emissiveIntensity={weakSpotId === "eye" ? 2 : 0.2}
        />
      </mesh>
      {([[-1, leftArm], [1, rightArm]] as const).map(([side, raise]) => (
        <group key={side} position={[side * 1.4, 3.1, 0]} rotation={[-raise * 2.6, 0, side * 0.2]}>
          <mesh position={[0, -0.9, 0]}>
            <capsuleGeometry args={[0.32, 1.4, 6, 12]} />
            <meshStandardMaterial color={SKIN} roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export const model: MonsterModel = { enemyId: "polyphemus", Component: Polyphemus };
