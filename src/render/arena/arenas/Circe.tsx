// Circe's fight: the courtyard of her hall of polished stone on the island of Aeaea, at evening. Her portico with
// the great loom and the table of cups behind her, tall trees round the clearing, her tame lions and wolves, the
// crew as pigs in a pen, and an evening sky beyond. Stylised low-poly, built in code except the marble columns, a handful of draw calls.
// The sky is the scene background (an HDRI set by Atmosphere through `sky`); if it fails, the colour below stays.
import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";
import { useQualityLevel } from "../../quality";
import { Braziers } from "../circe/Braziers";
import { Columns } from "../circe/Columns";
import { floorGeometry, glowGeometry, hallGeometry } from "../circe/hall";
import { grassGeometry, hillGeometry, molyGlowGeometry, treeGeometry, yardGeometry } from "../circe/yard";
import type { ArenaDef } from "../registry";

const SKY = `${import.meta.env.BASE_URL}hdri/qwantani_dusk_2_puresky_1k.hdr`;
/** The hall sits this far back from where its geometry was laid out, so the courtyard is long and the sky shows above the roof. */
const HALL_Z = -6;
const SUN: readonly [number, number, number] = [7.5, 9, -27.6];
/** Turns the sky so its own low sun sits where SUN does (the HDRI's sun is 12 degrees up). */
const SKY_YAW = 1.87;

function CirceHall() {
  const high = useQualityLevel() === "high";
  const solids = useMemo(
    () => ({
      floor: floorGeometry(), hall: hallGeometry(), glow: glowGeometry(), moly: molyGlowGeometry(),
      grass: grassGeometry(), hills: hillGeometry(), trees: treeGeometry(), yard: yardGeometry(),
    }),
    [],
  );
  useEffect(() => () => { Object.values(solids).forEach((geometry) => { geometry.dispose(); }); }, [solids]);
  return (
    <>
      <color attach="background" args={["#3a2a52"]} />
      <fog attach="fog" args={["#6a4a66", 16, 110]} />
      <ambientLight intensity={0.35} color="#b4a6e0" />
      <hemisphereLight args={["#9a8ae0", "#5a4a38", 0.4]} />
      {/* The low evening sun behind the hall: long shadows run toward the camera. */}
      <directionalLight
        position={SUN}
        intensity={2.6}
        color="#ffa05a"
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={5}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
      {/* Warm fill from the camera's side so the sorceress's face and the hero's back stay readable. */}
      <directionalLight position={[3, 4, 12]} intensity={0.6} color="#ffd6b0" />
      <directionalLight position={[-8, 3, 6]} intensity={0.45} color="#9a8cff" />

      <mesh geometry={solids.floor} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={0.85} />
      </mesh>
      <mesh geometry={solids.grass} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      <group position={[0, 0, HALL_Z]}>
        <mesh geometry={solids.hall} castShadow={high} receiveShadow={high}>
          <meshStandardMaterial vertexColors flatShading roughness={0.8} side={DoubleSide} />
        </mesh>
        <Columns />
        <mesh geometry={solids.glow}>
          <meshBasicMaterial vertexColors toneMapped={false} />
        </mesh>
      </group>
      <mesh geometry={solids.yard} castShadow={high} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={0.9} />
      </mesh>
      <mesh geometry={solids.trees} castShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      <mesh geometry={solids.hills}>
        <meshStandardMaterial vertexColors flatShading roughness={1} fog />
      </mesh>
      <mesh geometry={solids.moly}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      <Braziers light={high} />
    </>
  );
}

export const arena: ArenaDef = { enemyId: "circe", Component: CirceHall, sky: { hdri: SKY, yaw: SKY_YAW } };
