// Charybdis, the whirlpool under the fig tree, as a creature: a turning funnel of water with a dark throat, fangs of
// foam and one great eye, and a wave that rears over the hero. Built entirely in code (no model file to fail), with
// a plain dark cone as the stand-in if the shaders cannot be built.
import type { MonsterProps } from "../../../core/types";
import { ErrorBoundary } from "../../ErrorBoundary";
import { Body } from "../charybdis/Body";
import type { MonsterModel } from "../registry";

function StandIn({ defeated }: Pick<MonsterProps, "defeated">) {
  return (
    <mesh position={[0, defeated ? 0.4 : 1.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <coneGeometry args={[2.2, 4, 12, 1, true]} />
      <meshStandardMaterial color="#1f5560" side={2} flatShading />
    </mesh>
  );
}

function Charybdis(props: MonsterProps) {
  return (
    <ErrorBoundary label="charybdis-body" fallback={<StandIn defeated={props.defeated} />}>
      <Body {...props} />
    </ErrorBoundary>
  );
}

export const model: MonsterModel = { enemyId: "charybdis", Component: Charybdis };
