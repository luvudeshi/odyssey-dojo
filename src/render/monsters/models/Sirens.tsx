// The Sirens (book 12): two bird-women, a woman's head and chest on a great bird's body with wide wings, as on
// Greek vases. The lead faces the camera; her sister stands behind and a little to the right (clear of the prompt card) and sings with her.
// Built entirely in code (no downloads), so there is nothing to fail to load; if building still throws, a plain
// stand-in keeps the fight going.
import { ErrorBoundary } from "../../ErrorBoundary";
import { SirenFigure } from "../sirens/SirenFigure";
import { SirenStandIn } from "../sirens/SirenStandIn";
import type { MonsterProps } from "../../../core/types";
import type { MonsterModel } from "../registry";

function Sirens(props: MonsterProps) {
  return (
    <ErrorBoundary label="monster:sirens" fallback={<SirenStandIn {...props} />}>
      <SirenFigure {...props} lead />
      <SirenFigure {...props} lead={false} position={[3.5, 0, -6.5]} scale={0.8} yaw={-0.25} offset={1.9} />
    </ErrorBoundary>
  );
}

export const model: MonsterModel = { enemyId: "sirens", Component: Sirens };
