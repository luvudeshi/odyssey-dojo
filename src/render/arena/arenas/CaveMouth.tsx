// Polyphemus's fight: the mouth of his cave at dusk. You stand inside the cave; behind the giant a wide opening shows
// the sunset sky and the sea. Low sun rakes in through the mouth in shafts, a fire burns on the left, and a shepherd's
// pen, clay jars and boulders say who lives here. Stylised low-poly: flat facets, orange light against blue-violet shade.
// The sky is the scene background (an HDRI set by Atmosphere through `sky` below); the rest is built in code.
import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";
import { SUN } from "../cave/mouthLayout";
import { Blobs } from "../cave/Blob";
import { Fire } from "../cave/Fire";
import { Sea } from "../cave/Sea";
import { Sky } from "../cave/Sky";
import { LightShafts } from "../cave/Shafts";
import { floorGeometry, homesteadGeometry, rockGeometry, shellGeometry } from "../cave/solids";
import { useQualityLevel } from "../../quality";
import type { ArenaDef } from "../registry";

const SKY = `${import.meta.env.BASE_URL}hdri/qwantani_dusk_2_puresky_1k.hdr`;
const SUN_DISTANCE = 30;

function CaveMouth() {
  const high = useQualityLevel() === "high";
  const solids = useMemo(
    () => ({ shell: shellGeometry(), floor: floorGeometry(), rocks: rockGeometry(), homestead: homesteadGeometry() }),
    [],
  );
  useEffect(() => () => { Object.values(solids).forEach((geometry) => { geometry.dispose(); }); }, [solids]);
  const sun = SUN.dir.map((v) => v * SUN_DISTANCE) as [number, number, number];
  return (
    <>
      <fog attach="fog" args={["#3a2c5a", 12, 50]} />
      <ambientLight intensity={0.15} color="#9a8cd0" />
      <hemisphereLight args={["#7d72c8", "#4a3038", 0.3]} />
      {/* The low sun: the one shadow caster. Its light only gets in through the mouth. */}
      <directionalLight
        position={sun}
        intensity={1.9}
        color="#ffa45c"
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-camera-near={2}
        shadow-camera-far={70}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      {/* Cool violet fill from behind the camera so the giant's front and the hero's back never go black. */}
      <directionalLight position={[2, 5, 12]} intensity={0.6} color="#8f86ff" />

      <mesh geometry={solids.shell} castShadow={high} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={1} side={DoubleSide} />
      </mesh>
      <mesh geometry={solids.floor} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      <mesh geometry={solids.rocks} castShadow={high} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      <mesh geometry={solids.homestead} castShadow={high} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={0.9} />
      </mesh>

      <Sky />
      <Sea />
      <Fire />
      <Blobs />
      {high && <LightShafts />}
    </>
  );
}

export const arena: ArenaDef = { enemyId: "polyphemus", Component: CaveMouth, sky: { hdri: SKY, yaw: SUN.skyYaw } };
