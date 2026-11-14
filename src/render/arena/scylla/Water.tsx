// The strait's water: a low-poly sea that heaves (still on low quality), foam at the cliff's foot, and Charybdis, a
// churning whirlpool with a rock and fig tree far off to the left.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { ConeGeometry, DoubleSide, IcosahedronGeometry, PlaneGeometry } from "three";
import type { BufferGeometry, Group, Mesh } from "three";
import { useQualityLevel } from "../../quality";
import { MOUTH, SEA_Y, WHIRL } from "./layout";
import { jitterVertices, place, tint } from "./solid";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const WIDTH = 140, DEPTH = 90, CX = 0, CZ = -25;

function wave(x: number, z: number, t: number): number {
  return Math.sin(x * 0.35 + t * 0.9) * 0.14 + Math.sin(z * 0.5 - t * 0.7 + x * 0.1) * 0.12 + Math.sin((x + z) * 0.9 + t * 1.6) * 0.05;
}

function Sea() {
  const high = useQualityLevel() === "high";
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(WIDTH, DEPTH, 56, 36);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  useFrame(({ clock }) => {
    if (!high) return;
    const p = geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) p.setY(i, wave(p.getX(i), p.getZ(i), clock.elapsedTime));
    p.needsUpdate = true;
  });
  return (
    <mesh geometry={geometry} position={[CX, SEA_Y, CZ]} frustumCulled={false} receiveShadow={high}>
      <meshStandardMaterial color="#27495a" roughness={0.45} metalness={0.15} flatShading />
    </mesh>
  );
}

/** White surf along the cliff's foot, breathing in and out. */
function Foam() {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (m) m.scale.z = 1 + Math.sin(clock.elapsedTime * 0.8) * 0.25;
  });
  return (
    <mesh ref={ref} position={[12, SEA_Y + 0.08, MOUTH.z + 1.4]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[50, 2.4]} />
      <meshBasicMaterial color="#e8f0f0" transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}

const RINGS: readonly [number, number, number][] = [[1.6, 2.1, 2.4], [2.7, 3.2, -1.7], [3.8, 4.4, 1.2], [5.1, 5.6, -0.9], [6.4, 6.8, 0.6]];

function Whirlpool() {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    group.current?.children.forEach((child, i) => {
      const speed = RINGS[i]?.[2];
      if (speed !== undefined) child.rotation.z = clock.elapsedTime * speed * 0.35;
    });
  });
  return (
    <group position={[WHIRL.x, SEA_Y + 0.05, WHIRL.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <group ref={group}>
        {RINGS.map(([inner, outer]) => (
          <mesh key={inner} position={[0, 0, 0.02 * inner]}>
            <ringGeometry args={[inner, outer, 28, 1, 0, 4.1]} />
            <meshBasicMaterial color="#d6e4e6" transparent opacity={0.5} side={DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0, 0.01]}>
        <circleGeometry args={[2.2, 20]} />
        <meshBasicMaterial color="#0b161b" />
      </mesh>
      <mesh position={[0, 0, -0.01]}>
        <circleGeometry args={[7.4, 28]} />
        <meshBasicMaterial color="#173038" />
      </mesh>
    </group>
  );
}

/** A low rock with a fig tree, where Charybdis lives, far off past the whirlpool. */
function FigRock() {
  const rock = useMemo<BufferGeometry>(
    () => mergeGeometries([
      tint(place(jitterVertices(new IcosahedronGeometry(1, 1), 0.25, 3), [0, 1.2, 0], [0, 1, 0], [6, 3.2, 5]), "#5b5f66", 0.15),
      tint(place(new ConeGeometry(2.6, 3.4, 6), [0.5, 5.2, 0]), "#496a43", 0.15, 4),
      tint(place(new ConeGeometry(1.7, 2.6, 6), [-1.6, 4.4, 0.8]), "#587a4c", 0.15, 5),
    ], false),
    [],
  );
  return <mesh geometry={rock} position={[WHIRL.x - 15, SEA_Y, WHIRL.z - 10]}><meshStandardMaterial vertexColors flatShading roughness={1} /></mesh>;
}

export function Water() {
  return (
    <>
      <Sea />
      <Foam />
      <Whirlpool />
      <FigRock />
    </>
  );
}
