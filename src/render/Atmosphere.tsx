// Light and air that belong to the whole fight, whatever the arena: the cave HDRI for reflections,
// a cool rim light that outlines the monster, and drifting embers.
import { Environment, Lightformer, Sparkles } from "@react-three/drei";
import { Suspense } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { useQualityLevel } from "./quality";

const HDRI = `${import.meta.env.BASE_URL}hdri/small_cave_1k.hdr`;

function FallbackEnvironment() {
  return (
    <Environment resolution={64} environmentIntensity={2}>
      <Lightformer form="rect" color="#ffa860" intensity={10} position={[0, 2, -8]} scale={[12, 5, 1]} />
      <Lightformer form="rect" color="#9a8cd0" intensity={4} position={[0, 6, 4]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 12, 1]} />
      <Lightformer form="rect" color="#8f86ff" intensity={3} position={[-6, 2, 4]} rotation={[0, Math.PI / 2, 0]} scale={[8, 4, 1]} />
    </Environment>
  );
}

export function Atmosphere({ sky }: { sky?: { readonly hdri: string; readonly yaw: number } | undefined }) {
  const high = useQualityLevel() === "high";
  return (
    <>
      {/* A missing HDRI falls back to a small hand-built environment, so metal still has something to reflect. */}
      <ErrorBoundary label="hdri" fallback={<FallbackEnvironment />}>
        <Suspense fallback={null}>
          <Environment
            files={sky?.hdri ?? HDRI}
            environmentRotation={[0, sky?.yaw ?? 0, 0]}
            environmentIntensity={sky ? 0.3 : 0.6}
          />
        </Suspense>
      </ErrorBoundary>
      <directionalLight position={[-4, 5, -10]} intensity={1.6} color="#6f9dff" />
      <Sparkles
        count={high ? 70 : 30}
        scale={[16, 6, 14]}
        position={[0, 3, -3]}
        size={3}
        speed={0.25}
        opacity={0.8}
        color="#ffae5a"
      />
    </>
  );
}
