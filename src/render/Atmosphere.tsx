// Light and air that belong to the whole fight, whatever the arena: the cave HDRI for reflections,
// a cool rim light that outlines the monster, and drifting embers.
import { Environment, Sparkles } from "@react-three/drei";
import { Suspense } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { useQualityLevel } from "./quality";

const HDRI = `${import.meta.env.BASE_URL}hdri/small_cave_1k.hdr`;

export function Atmosphere({ sky }: { sky?: { readonly hdri: string; readonly yaw: number } | undefined }) {
  const high = useQualityLevel() === "high";
  return (
    <>
      {/* A missing HDRI only loses reflections. */}
      <ErrorBoundary label="hdri" fallback={null}>
        <Suspense fallback={null}>
          <Environment
            files={sky?.hdri ?? HDRI}
            background={sky !== undefined}
            backgroundIntensity={0.42}
            backgroundRotation={[0, sky?.yaw ?? 0, 0]}
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
