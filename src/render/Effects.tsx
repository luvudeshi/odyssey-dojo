// Post-processing: ambient occlusion, bloom (so torches and the eye glow), a vignette and film tone mapping.
// The composer switches the renderer's own tone mapping off, so ACES is applied here as the last effect.
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { BloomEffect } from "postprocessing";
import { useRef } from "react";
import { hitPulse } from "./effects/pulse";
import { useQualityLevel } from "./quality";

const BLOOM_BASE = 0.9;
const BLOOM_SURGE = 1.4;

export function Effects() {
  const high = useQualityLevel() === "high";
  const bloom = useRef<BloomEffect>(null);
  useFrame(() => {
    if (bloom.current) bloom.current.intensity = BLOOM_BASE + BLOOM_SURGE * hitPulse();
  });
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {high ? <N8AO quality="medium" aoRadius={0.9} intensity={2.2} distanceFalloff={1} /> : <></>}
      <Bloom
        ref={bloom}
        mipmapBlur
        luminanceThreshold={1.0}
        luminanceSmoothing={0.2}
        intensity={BLOOM_BASE}
        resolutionScale={high ? 1 : 0.5}
      />
      <Vignette offset={0.2} darkness={0.9} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
