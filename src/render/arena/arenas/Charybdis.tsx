// Charybdis's fight: the strait at storm dusk. You stand on a raft of keel and mast; the whirlpool under the fig tree
// is in front of you, the low rock and its leaning tree on the left, Scylla's cliff far off on the right, wreckage
// floating about. Stylised low-poly: faceted water, flat-shaded timber and rock, a low orange sun under dark cloud.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import { useQualityLevel } from "../../quality";
import { Rain } from "../charybdis/Rain";
import { Sky } from "../charybdis/Sky";
import { Water } from "../charybdis/Water";
import { circlingDebris, driftwood } from "../charybdis/layout";
import { cliffGeometry, driftGeometry, raftGeometry, rockGeometry, treeGeometry } from "../charybdis/shapes";
import { Scenery, SeaAndSky } from "../charybdis/looks";
import type { ArenaDef } from "../registry";

// The anglerfish look ("a") is the owner's pick and the default. ?look=b is the tentacle look, ?look=base the one built in code.
const LOOK = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("look");
const ALT = LOOK === "base" ? null : LOOK === "b" ? "b" : "a";

const DEBRIS = 5;

function Solids() {
  const high = useQualityLevel() === "high";
  const solids = useMemo(
    () => ({ raft: raftGeometry(), rock: rockGeometry(), tree: treeGeometry(), cliff: cliffGeometry() }),
    [],
  );
  const drifts = useMemo(() => driftwood(), []);
  const driftMeshes = useMemo(() => drifts.map((drift, index) => driftGeometry(drift, index)), [drifts]);
  const circling = useRef<(Mesh | null)[]>([]);
  const bobbing = useRef<(Group | null)[]>([]);
  useEffect(
    () => () => {
      Object.values(solids).forEach((geometry) => { geometry.dispose(); });
      driftMeshes.forEach((geometry) => { geometry.dispose(); });
    },
    [solids, driftMeshes],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    bobbing.current.forEach((group, index) => {
      if (!group) return;
      group.position.y = Math.sin(t * 0.9 + index * 1.7) * 0.05;
      group.rotation.z = Math.sin(t * 0.7 + index) * 0.05;
    });
    circling.current.forEach((mesh, index) => {
      if (!mesh) return;
      const d = circlingDebris(index, t);
      mesh.position.set(d.x, -0.3 + Math.sin(t * 1.3 + index) * 0.04, d.z);
      mesh.rotation.y = d.yaw;
      mesh.scale.setScalar(Math.max(d.fade, 0.001));
    });
  });
  return (
    <>
      {/* The raft is the one thing that catches the hero's shadow. */}
      <mesh geometry={solids.raft} position={[0, 0, -0.1]} castShadow={high} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={0.9} />
      </mesh>
      {ALT ? (
        <Scenery look={ALT} />
      ) : (
        <>
          <mesh geometry={solids.rock} receiveShadow={high}>
            <meshStandardMaterial vertexColors flatShading roughness={1} />
          </mesh>
          <mesh geometry={solids.tree}>
            <meshStandardMaterial vertexColors flatShading roughness={0.95} />
          </mesh>
          <mesh geometry={solids.cliff}>
            <meshStandardMaterial vertexColors flatShading roughness={1} fog />
          </mesh>
        </>
      )}
      {driftMeshes.map((geometry, index) => (
        <group key={index} position={drifts[index]?.position ?? [0, 0, 0]} rotation={[0, drifts[index]?.yaw ?? 0, 0]}>
          <group ref={(group) => { bobbing.current[index] = group; }}>
            <mesh geometry={geometry}>
              <meshStandardMaterial vertexColors flatShading roughness={0.9} />
            </mesh>
          </group>
        </group>
      ))}
      {Array.from({ length: DEBRIS }, (_, index) => (
        <mesh key={index} ref={(mesh) => { circling.current[index] = mesh; }} geometry={driftMeshes[index % driftMeshes.length] ?? solids.raft}>
          <meshStandardMaterial vertexColors flatShading roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}

function Strait() {
  const high = useQualityLevel() === "high";
  return (
    <>
      <color attach="background" args={["#2a1d33"]} />
      <fog attach="fog" args={["#6a4560", 38, 150]} />
      <ambientLight intensity={0.35} color="#8f86b8" />
      <hemisphereLight args={["#8a86c0", "#2a2a3a", 0.45]} />
      {/* The low sun, behind the whirlpool: a warm rim on the water's crests and the tree. */}
      <directionalLight position={[-9, 3, -17]} intensity={2.2} color="#ff9a5a" />
      {/* Key from the front left so the hero's back and the monster's face both read. One shadow caster. */}
      <directionalLight
        position={[-6, 9, 9]}
        intensity={1.5}
        color="#ffc79a"
        castShadow={high}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={2}
        shadow-camera-far={30}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
      />
      {/* Cool fill from behind the camera. */}
      <directionalLight position={[3, 4, 14]} intensity={0.55} color="#7fa0ff" />
      {LOOK === "a" ? <SeaAndSky /> : LOOK === "b" ? null : <Sky />}
      {LOOK !== "a" && <Water />}
      <Solids />
      {high && <Rain />}
    </>
  );
}

// Look b backs the strait with the Poly Haven dusk sky already used by the cave mouth; with no flag nothing changes.
export const arena: ArenaDef = {
  enemyId: "charybdis",
  Component: Strait,
  ...(LOOK === "b" ? { sky: { hdri: "/hdri/qwantani_dusk_2_puresky_1k.hdr", yaw: 2.4 } } : {}),
};
