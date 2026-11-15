// Circe of Aeaea, book 10: a sorceress about 3.2 m tall, built in code so every windup is hers alone.
// She has no GLB to fail to load; if building her ever throws, a plain robed stand-in takes her place and the fight goes on.
import type { MonsterProps } from "../../../core/types";
import { ErrorBoundary } from "../../ErrorBoundary";
import { CirceFigure } from "../circe/Figure";
import type { MonsterModel } from "../registry";

export function CirceStandIn({ defeated, windup }: MonsterProps) {
  return (
    <group position={[0, defeated ? -0.9 : 0, 0]} scale={[1 + windup * 0.15, 1, 1 + windup * 0.15]}>
      <mesh position={[0, 1.1, 0]}>
        <coneGeometry args={[0.7, 2.2, 8]} />
        <meshStandardMaterial color="#1f9a82" flatShading />
      </mesh>
      <mesh position={[0, 2.5, 0]}>
        <icosahedronGeometry args={[0.28, 1]} />
        <meshStandardMaterial color="#e8b98f" flatShading />
      </mesh>
    </group>
  );
}

function Circe(props: MonsterProps) {
  return (
    <ErrorBoundary label="monster:circe" fallback={<CirceStandIn {...props} />}>
      <CirceFigure {...props} />
    </ErrorBoundary>
  );
}

export const model: MonsterModel = { enemyId: "circe", Component: Circe };
