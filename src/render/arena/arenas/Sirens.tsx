// The Sirens' fight: a flowery meadow on a rocky islet, white with the bones of the men who stopped to listen,
// at late dusk, with the calm sea all round and the black ship rowing past in the distance. A low warm sun
// sits over the sea in a violet-rose sky (like the Cyclops' cave at sunset); as the Sirens grow bolder (the
// phases) the light turns sour and violet.
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

/** How sour the light is in each phase, 0 = warm dusk, 1 = sinister. */
const DIM_BY_PHASE = [0, 0.45, 1] as const;
const HAZE = new Color("#c98f9c");
const SOUR_HAZE = new Color("#6c5888");
const SUN = new Color("#ffb77a");
const SOUR_SUN = new Color("#ff8a72");
const SKY_LIGHT = new Color("#9c88c4");
const SOUR_SKY_LIGHT = new Color("#7462a8");

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
    if (sun.current) sun.current.intensity = 2 - d * 0.5;
    hemi.current?.color.copy(SKY_LIGHT).lerp(SOUR_SKY_LIGHT, d);
  });
  return (
    <>
      <color attach="background" args={["#c98f9c"]} />
      <fog ref={fog} attach="fog" args={["#c98f9c", 30, 150]} />
      <hemisphereLight ref={hemi} args={["#9c88c4", "#3f4a3c", 0.75]} />
      {/* The low sun, a little behind the camera so both fighters are lit warm from the front and the shadows run long. */}
      <directionalLight
        ref={sun}
        position={[9, 6, 10]}
        intensity={2}
        color="#ffb77a"
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
      {/* The sunset glow from behind the Sirens, so their wings glow at the edges. */}
      <directionalLight position={[3, 4, -14]} intensity={1.6} color="#ff9a6a" />
      <Sky dim={dim} />
      <Sea low={!high} />
      <Ship />
      <Meadow high={high} />
    </>
  );
}

export const arena: ArenaDef = { enemyId: "sirens", Component: SirensMeadow };
