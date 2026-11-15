// Circe of Aeaea, book 10: a sorceress about 3.2 m tall, built in code so every windup is hers alone.
// She has no GLB to fail to load; if building her ever throws, a plain robed stand-in takes her place and the fight goes on.
import type { MonsterProps } from "../../../core/types";
import { ErrorBoundary } from "../../ErrorBoundary";
import { CirceFigure } from "../circe/Figure";
import { Suspense } from "react";
import { decideMonsterClip } from "../../models/clipMap";
import type { MonsterClipConfig } from "../../models/clipMap";
import { RiggedModel } from "../../models/RiggedModel";
import type { Material } from "three";
import { Color } from "three";
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

// ?look=a (Quaternius Witch, CC-BY 3.0, purple) and ?look=b (the same witch in a sea-green robe, with a textured ground) are rigged
// alternates for the owner to compare; without the flag the code-built figure above is used.
const LOOK = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("look");
const CLIPS: MonsterClipConfig = {
  idle: "CharacterArmature|Idle_Neutral",
  windup: {
    default: "CharacterArmature|Interact",
    byAttackId: {
      wand_left: "CharacterArmature|Punch_Right",
      wand_right: "CharacterArmature|Punch_Left",
      cup: "CharacterArmature|Wave",
      spell: "CharacterArmature|Interact",
    },
  },
  hit: "CharacterArmature|HitRecieve",
  death: "CharacterArmature|Death",
};
const FIT = { targetHeight: 3.0 } as const;
const SEA = new Color("#1f9a82");

/** Look b: the same witch with her purple robe turned sea green, the colour of the code-built Circe. */
function robeGreen(material: Material): void {
  const named = material as Material & { color?: Color };
  if (named.color && material.name === "Purple") named.color.copy(SEA);
}

function GlbCirce({ file, props, tweakMaterial }: { file: string; props: MonsterProps; tweakMaterial?: (material: Material) => void }) {
  return (
    <ErrorBoundary label={`monster-glb:${file}`} fallback={<CirceStandIn {...props} />}>
      <Suspense fallback={<CirceStandIn {...props} />}>
        <RiggedModel
          url={`${import.meta.env.BASE_URL}models/circe/${file}`}
          fit={FIT}
          hitFlash={props.hitFlash}
          decide={(available, out) => decideMonsterClip(CLIPS, props, available, out)}
          {...(tweakMaterial ? { tweakMaterial } : {})}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

function Circe(props: MonsterProps) {
  if (LOOK === "a") return <GlbCirce file="witch.glb" props={props} />;
  if (LOOK === "b") return <GlbCirce file="witch.glb" props={props} tweakMaterial={robeGreen} />;
  return (
    <ErrorBoundary label="monster:circe" fallback={<CirceStandIn {...props} />}>
      <CirceFigure {...props} />
    </ErrorBoundary>
  );
}

export const model: MonsterModel = { enemyId: "circe", Component: Circe };
