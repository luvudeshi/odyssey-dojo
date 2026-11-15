// The islet itself: meadow, boulders, heaps of bones, the wreck, and drifts of flowers and grass, plus soft
// contact shadows under the fighters. Everything here is one merged mesh or one instanced mesh.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, InstancedMesh, Object3D } from "three";
import type { Mesh } from "three";
import { battle } from "../../battle";
import { MONSTER_Z } from "../../cameraShots";
import { FLOWER_COLORS, bones, flowers, rocks, tufts } from "./layout";
import { boneGeometry, flowerGeometry, rockGeometry, terrainGeometry, tuftGeometry, wreckGeometry } from "./solids";

function blobTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32);
    gradient.addColorStop(0, "rgba(0,0,0,0.7)");
    gradient.addColorStop(0.6, "rgba(0,0,0,0.28)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(canvas);
}

/** Fills an InstancedMesh from a list of placements; runs once. */
function useInstances(count: number, place: (index: number, dummy: Object3D, color: Color) => void, colored: boolean): React.RefObject<InstancedMesh | null> {
  const ref = useRef<InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const color = new Color();
    for (let i = 0; i < count; i++) {
      place(i, dummy, color);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (colored) mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, place, colored]);
  return ref;
}

export function Meadow({ high }: { high: boolean }) {
  const solids = useMemo(
    () => ({ ground: terrainGeometry(), rocks: rockGeometry(rocks()), bones: boneGeometry(bones()), wreck: wreckGeometry(), flower: flowerGeometry(), tuft: tuftGeometry() }),
    [],
  );
  const blooms = useMemo(() => flowers(), []);
  const grass = useMemo(() => tufts(), []);
  const texture = useMemo(() => blobTexture(), []);
  useEffect(() => () => { Object.values(solids).forEach((g) => { g.dispose(); }); texture.dispose(); }, [solids, texture]);

  const placeFlower = useMemo(() => (i: number, dummy: Object3D, color: Color): void => {
    const b = blooms[i];
    if (!b) return;
    dummy.position.set(...b.position);
    dummy.rotation.set(0, i, 0);
    dummy.scale.setScalar(b.size);
    color.set(FLOWER_COLORS[b.color] ?? "#ffffff");
  }, [blooms]);
  const placeTuft = useMemo(() => (i: number, dummy: Object3D): void => {
    const t = grass[i];
    if (!t) return;
    dummy.position.set(...t.position);
    dummy.rotation.set(0, t.yaw, 0);
    dummy.scale.setScalar(t.size);
  }, [grass]);
  const flowerMesh = useInstances(blooms.length, placeFlower, true);
  const tuftMesh = useInstances(grass.length, placeTuft, false);

  const hero = useRef<Mesh>(null);
  useFrame(() => { hero.current?.position.set(battle.heroX, 0.03, 1.2 + battle.heroZ); });

  return (
    <>
      <mesh geometry={solids.ground} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      <mesh geometry={solids.rocks} castShadow={high} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      <mesh geometry={solids.bones} castShadow={high} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={0.9} />
      </mesh>
      <mesh geometry={solids.wreck} castShadow={high} receiveShadow={high}>
        <meshStandardMaterial vertexColors flatShading roughness={0.95} side={2} />
      </mesh>
      <instancedMesh ref={flowerMesh} args={[solids.flower, undefined, blooms.length]} frustumCulled={false}>
        <meshStandardMaterial vertexColors flatShading roughness={0.7} emissive="#6a3a18" emissiveIntensity={0.55} />
      </instancedMesh>
      <instancedMesh ref={tuftMesh} args={[solids.tuft, undefined, grass.length]} frustumCulled={false}>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </instancedMesh>
      {/* Contact shadows: the hero has no shadow caster of its own, and the Sirens only cast real ones on high quality. */}
      <mesh ref={hero} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[1.7, 1.7]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} fog={false} />
      </mesh>
      {!high && (
        <mesh position={[0, 0.04, MONSTER_Z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[5, 5]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} fog={false} />
        </mesh>
      )}
    </>
  );
}
