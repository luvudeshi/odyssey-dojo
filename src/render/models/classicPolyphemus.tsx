// Candidate "classic": the hand-built Polyphemus restyled for the dusk cave: flat-shaded low-poly, a cloth, a club in the Club phase,
// a stake in the ruined eye once Blinded. The default look (monsters/models/Polyphemus.tsx) is untouched.
import type { MonsterProps } from "../../core/types";
import { Club, Eye } from "./polyphemusProps";

const SKIN = "#9c6f4e";
const CLOTH = "#4a2f22";

function Flat({ color }: { color: string }) {
  return <meshStandardMaterial color={color} flatShading roughness={1} />;
}

export function ClassicPolyphemus({ windup, attackId, weakSpotId, defeated, phaseIndex, hitFlash }: MonsterProps) {
  const rightArm = attackId === "club_left" || attackId === "boulder" ? windup : 0;
  const leftArm = attackId === "club_right" || attackId === "grab" ? windup : 0;
  return (
    <group rotation={[defeated ? -1.2 : 0, 0, 0]}>
      <mesh castShadow position={[0, 2.1, 0]} scale={[1, 1, 0.8]}>
        <capsuleGeometry args={[1.1, 1.5, 2, 7]} />
        <Flat color={SKIN} />
      </mesh>
      <mesh castShadow position={[0, 1.2, 0]}>
        <cylinderGeometry args={[1.15, 1.35, 1.1, 7]} />
        <Flat color={CLOTH} />
      </mesh>
      {([-0.5, 0.5] as const).map((x) => (
        <mesh key={x} castShadow position={[x, 0.45, 0]}>
          <capsuleGeometry args={[0.38, 0.8, 2, 6]} />
          <Flat color={SKIN} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 4.0, 0]}>
        <icosahedronGeometry args={[0.95, 1]} />
        <Flat color={SKIN} />
      </mesh>
      <mesh position={[0, 4.35, 0.75]} rotation={[0.2, 0, 0]} scale={[1.3, 0.25, 0.5]}>
        <boxGeometry args={[1, 1, 1]} />
        <Flat color="#3a2418" />
      </mesh>
      <group position={[0, 4.1, 0.85]} scale={0.9}>
        <Eye blinded={phaseIndex >= 2} glow={(weakSpotId === "eye" ? 2.6 : 1.3) + hitFlash * 4} />
      </group>
      {([[-1, leftArm], [1, rightArm]] as const).map(([side, raise]) => (
        <group key={side} position={[side * 1.4, 3.1, 0]} rotation={[-raise * 2.6, 0, side * 0.2]}>
          <mesh castShadow position={[0, -0.9, 0]}>
            <capsuleGeometry args={[0.32, 1.3, 2, 6]} />
            <Flat color={SKIN} />
          </mesh>
          {side === 1 && phaseIndex >= 1 && (
            <group position={[0, -1.9, 0.2]} rotation={[Math.PI, 0, 0]}>
              <Club />
            </group>
          )}
        </group>
      ))}
    </group>
  );
}
