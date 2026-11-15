// The last fight: Odysseus's own great hall in Ithaca (Odyssey book 22). A long megaron with painted red columns, a round
// hearth burning behind the suitors, feast tables knocked over, cups and food on the floor, the row of twelve axes and
// the great bow, torches, and a doorway to the moonlit courtyard. Everything is built in code, so there is no file
// to fail; the shell and props are two vertex-coloured meshes. Warm key light from the torches in front, cool rim from the courtyard.
import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";
import { useQualityLevel } from "../../quality";
import { HearthFire, NightSky, Torches } from "../suitors/Fire";
import { hallSolids } from "../suitors/hall";
import { Feast } from "../suitors/Feast";
import { propSolids } from "../suitors/props";
import type { ArenaDef } from "../registry";

function Hall() {
  const high = useQualityLevel() === "high";
  const geo = useMemo(() => ({ hall: hallSolids().build(), props: propSolids().build() }), []);
  useEffect(() => () => { geo.hall.dispose(); geo.props.dispose(); }, [geo]);
  return (
    <>
      <color attach="background" args={["#140b12"]} />
      <fog attach="fog" args={["#1c0f16", 16, 48]} />
      <ambientLight intensity={0.2} color="#b79ad0" />
      <hemisphereLight args={["#a58bd0", "#4a3038", 0.4]} />
      {/* Key: warm light from the torches on the near side, the one shadow caster. */}
      <directionalLight
        position={[-3, 8, 9]}
        intensity={0.95}
        color="#ffd8b4"
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={2}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <directionalLight position={[3, 4, 10]} intensity={0.55} color="#9a8cff" />
      <mesh geometry={geo.hall} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={1} side={DoubleSide} />
      </mesh>
      <mesh geometry={geo.props} castShadow={high} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={0.9} />
      </mesh>
      <Feast />
      <HearthFire />
      <Torches />
      <NightSky />
    </>
  );
}

export const arena: ArenaDef = { enemyId: "suitors", Component: Hall };
