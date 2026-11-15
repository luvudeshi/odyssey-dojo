// The downloaded pieces for Charybdis's ?look= alternates. "a": an anglerfish lunging out of the throat with eight
// tentacles clutching the rim. "b": a crown of ten big tentacles hauling themselves over the rim, no fish.
// Both sit on top of the code-built funnel, which still does the water, the crest and every attack's tell.
import { useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { RefObject } from "react";
import { MathUtils } from "three";
import type { Group } from "three";
import type { MonsterProps } from "../../../core/types";
import { ErrorBoundary } from "../../ErrorBoundary";
import { Glb } from "./Glb";
import type { ClipPick } from "./Glb";
import { MOUTH_RX, MOUTH_RY, MOUTH_Z, THROAT_Y } from "./shapes";

type Live = RefObject<MonsterProps>;

const TENTACLE = "/models/charybdis/Tentacle.glb";
const ANGLER = "/models/charybdis/Anglerfish.glb";

interface Arm {
  /** Angle round the rim, degrees from +x, counter-clockwise seen from the camera. */
  readonly angle: number;
  readonly size: number;
  readonly lean: number;
  /** Which attacks it joins in on. */
  readonly joins: readonly string[];
}

const ARMS_A: readonly Arm[] = [
  { angle: 160, size: 2.3, lean: 0.25, joins: ["surge_left", "undertow"] },
  { angle: 125, size: 2.9, lean: 0.17, joins: ["spout", "undertow"] },
  { angle: 85, size: 3.1, lean: 0.12, joins: ["spout", "undertow"] },
  { angle: 52, size: 2.8, lean: 0.17, joins: ["spout", "undertow"] },
  { angle: 18, size: 2.3, lean: 0.25, joins: ["surge_right", "undertow"] },
  { angle: 200, size: 1.9, lean: 0.3, joins: ["surge_left"] },
  { angle: -20, size: 1.9, lean: 0.3, joins: ["surge_right"] },
  { angle: 105, size: 2.3, lean: 0.45, joins: ["spout"] },
];

const ARMS_B: readonly Arm[] = [
  { angle: 165, size: 3.1, lean: 0.3, joins: ["surge_left", "undertow"] },
  { angle: 140, size: 3.7, lean: 0.2, joins: ["surge_left", "spout"] },
  { angle: 112, size: 4.0, lean: 0.15, joins: ["spout", "undertow"] },
  { angle: 90, size: 3.5, lean: 0.45, joins: ["spout"] },
  { angle: 68, size: 4.0, lean: 0.15, joins: ["spout", "undertow"] },
  { angle: 40, size: 3.7, lean: 0.2, joins: ["surge_right", "spout"] },
  { angle: 15, size: 3.1, lean: 0.3, joins: ["surge_right", "undertow"] },
  { angle: 195, size: 2.4, lean: 0.35, joins: ["surge_left"] },
  { angle: -15, size: 2.4, lean: 0.35, joins: ["surge_right"] },
  { angle: 128, size: 2.8, lean: 0.55, joins: ["undertow"] },
];

function Arms({ arms, live, rise }: { arms: readonly Arm[]; live: Live; rise: number }) {
  return (
    <>
      {arms.map((arm, index) => {
        const a = (arm.angle * Math.PI) / 180;
        const x = Math.cos(a) * (MOUTH_RX + 0.15);
        const y = THROAT_Y + Math.sin(a) * (MOUTH_RY + 0.15);
        const pick = (out: ClipPick): ClipPick => {
          const p = live.current;
          if (p.defeated) return { ...out, clip: "|Tentacle_Idle|", scrub: null, loop: true, speed: 0.15 };
          if (p.attackId && arm.joins.includes(p.attackId)) return { ...out, clip: "|Tentacle_Attack|", scrub: p.windup, loop: false, speed: 1 };
          return { ...out, clip: "|Tentacle_Idle|", scrub: null, loop: true, speed: 0.8 + (index % 3) * 0.2 };
        };
        // Up is the tentacle's own axis: tip it out from the rim, then lean it back toward the camera.
        return (
          <group key={index} position={[x, y, MOUTH_Z + rise]} rotation={[arm.lean, 0, a - Math.PI / 2]}>
            <Glb url={TENTACLE} size={arm.size} by="height" pick={pick} phase={index * 0.37} tint="#b9a6c8" />
          </group>
        );
      })}
    </>
  );
}

function Angler({ live }: { live: Live }) {
  const lunge = useRef<Group>(null);
  const pick = (out: ClipPick): ClipPick => {
    const p = live.current;
    if (p.defeated) return { ...out, clip: "Death", scrub: null, loop: false, speed: 1 };
    if (p.attackId) return { ...out, clip: "Attack", scrub: p.windup, loop: false, speed: 1 };
    return { ...out, clip: "Swimming_Normal", scrub: null, loop: true, speed: 0.7 };
  };
  useFrame((_, delta) => {
    const g = lunge.current;
    if (!g) return;
    const p = live.current;
    const forward = p.defeated ? -0.6 : p.attackId === "undertow" ? 1.4 * p.windup : p.attackId === "spout" ? 0.4 * p.windup : 0.15 * Math.sin(performance.now() / 900);
    const rising = p.defeated ? -3.2 : p.attackId === "spout" ? 0.9 * p.windup : 0;
    g.position.z = MathUtils.damp(g.position.z, forward, 6, delta);
    g.position.y = MathUtils.damp(g.position.y, rising, 3, delta);
  });
  return (
    <group ref={lunge}>
      <Glb url={ANGLER} size={4.4} position={[0, 0.9, -0.7]} rotation={[-0.2, 0, 0]} pick={pick} />
    </group>
  );
}

export function LookParts({ look, live }: { look: "a" | "b"; live: Live }) {
  return (
    <ErrorBoundary label="charybdis-look" fallback={null}>
      <Suspense fallback={null}>
        {look === "a" && <Angler live={live} />}
        <Arms arms={look === "a" ? ARMS_A : ARMS_B} live={live} rise={-0.5} />
      </Suspense>
    </ErrorBoundary>
  );
}
