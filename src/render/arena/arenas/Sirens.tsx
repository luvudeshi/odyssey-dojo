// The Sirens' fight: a flowery meadow on a rocky islet, white with the bones of the men who stopped to listen,
// in the heat of noon, with the calm sea all round and the black ship rowing past in the distance. The Sirens
// start the fight in a golden haze; as they grow bolder (the phases) the light turns sour and violet.
// Built entirely in code, so there is nothing to fail to load. The sky is a dome in the scene (no HDRI).
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Color, DirectionalLight, Fog, HemisphereLight } from "three";
import { battle } from "../../battle";
import { useQualityLevel } from "../../quality";
import { Meadow } from "../sirens/Meadow";
import { Sea } from "../sirens/Sea";
import { Ship } from "../sirens/Ship";
import { Sky } from "../sirens/Sky";
import type { ArenaDef } from "../registry";

/** How sour the light is in each phase, 0 = hot gold noon, 1 = sinister. */
const DIM_BY_PHASE = [0, 0.45, 1] as const;
const HAZE = new Color("#f2e3c6");
const SOUR_HAZE = new Color("#8f7aa0");
const SUN = new Color("#fff0cf");
const SOUR_SUN = new Color("#ffb08a");
const SKY_LIGHT = new Color("#bfe0ff");
const SOUR_SKY_LIGHT = new Color("#8a78b8");

function SirensMeadow() {
  const high = useQualityLevel() === "high";
  const dim = useRef(0);
  const fog = useRef<Fog>(null);
  const sun = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  useFrame((_, delta) => {
    const target = DIM_BY_PHASE[Math.min(battle.state?.phaseIndex ?? 0, DIM_BY_PHASE.length - 1)] ?? 0;
    dim.current += (target - dim.current) * (1 - Math.exp(-delta * 1.2));
    const d = dim.current;
    fog.current?.color.copy(HAZE).lerp(SOUR_HAZE, d);
    sun.current?.color.copy(SUN).lerp(SOUR_SUN, d);
    if (sun.current) sun.current.intensity = 2.1 - d * 0.5;
    hemi.current?.color.copy(SKY_LIGHT).lerp(SOUR_SKY_LIGHT, d);
  });
  return (
    <>
      <color attach="background" args={["#cfe6f5"]} />
      <fog ref={fog} attach="fog" args={["#f2e3c6", 30, 150]} />
      <hemisphereLight ref={hemi} args={["#bfe0ff", "#9a9a5a", 0.7]} />
      {/* The noon sun, high and a little behind the camera so both fighters are lit from the front. */}
      <directionalLight
        ref={sun}
        position={[6, 14, 9]}
        intensity={2.1}
        color="#fff0cf"
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={2}
        shadow-camera-far={50}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
      {/* Warm rim from behind the Sirens, so their wings glow at the edges. */}
      <directionalLight position={[-3, 6, -14]} intensity={1.2} color="#ffd9a0" />
      <Sky dim={dim} />
      <Sea low={!high} />
      <Ship />
      <Meadow high={high} />
    </>
  );
}

export const arena: ArenaDef = { enemyId: "sirens", Component: SirensMeadow };
