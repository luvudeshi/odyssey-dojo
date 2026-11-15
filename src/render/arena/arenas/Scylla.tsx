// Scylla's fight: the black ship in the strait under the sheer cliff, with her cave halfway up the face. The hero stands
// on the deck; across the water Charybdis churns far off to the left, under a bruised dusk sky. All of it is built in
// code (no downloads), so there is nothing to fail to load. Warm key light from the front left, a cool rim from behind.
import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";
import { hollowGeometry, rimGeometry, wallGeometry } from "../scylla/cliff";
import { shipGeometry } from "../scylla/ship";
import { Sky } from "../scylla/Sky";
import { Water } from "../scylla/Water";
import { useQualityLevel } from "../../quality";
import type { ArenaDef } from "../registry";

function Strait() {
  const high = useQualityLevel() === "high";
  const solids = useMemo(
    () => ({ wall: wallGeometry(), rim: rimGeometry(), hollow: hollowGeometry(), ship: shipGeometry() }),
    [],
  );
  useEffect(() => () => { Object.values(solids).forEach((g) => { g.dispose(); }); }, [solids]);
  return (
    <>
      <color attach="background" args={["#8f8a9c"]} />
      <fog attach="fog" args={["#9a8f9e", 16, 85]} />
      <hemisphereLight args={["#9fb0d8", "#2a3c44", 0.75]} />
      <ambientLight intensity={0.25} color="#b8a8c8" />
      <directionalLight
        position={[-9, 11, 13]}
        intensity={2.6}
        color="#ffd7a6"
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={2}
        shadow-camera-far={50}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <Sky />
      <mesh geometry={solids.wall}>
        <meshStandardMaterial vertexColors flatShading roughness={1} side={DoubleSide} />
      </mesh>
      <mesh geometry={solids.rim} castShadow={high} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      <mesh geometry={solids.hollow}>
        <meshBasicMaterial vertexColors side={DoubleSide} fog={false} />
      </mesh>
      <mesh geometry={solids.ship} castShadow={high} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={0.85} />
      </mesh>
      <Water />
    </>
  );
}

export const arena: ArenaDef = { enemyId: "scylla", Component: Strait };
