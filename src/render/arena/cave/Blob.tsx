// Soft contact shadows under the fighters. The giant casts a real shadow on high quality; the hero has no shadow
// caster of its own, so a blob under it keeps it on the ground, and the giant gets one too when real shadows are off.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture } from "three";
import type { Mesh } from "three";
import { battle } from "../../battle";
import { MONSTER_Z } from "../../cameraShots";
import { useQualityLevel } from "../../quality";

function blobTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32);
    gradient.addColorStop(0, "rgba(0,0,0,0.75)");
    gradient.addColorStop(0.6, "rgba(0,0,0,0.3)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(canvas);
}

export function Blobs() {
  const high = useQualityLevel() === "high";
  const texture = useMemo(() => blobTexture(), []);
  useEffect(() => () => { texture.dispose(); }, [texture]);
  const hero = useRef<Mesh>(null);
  useFrame(() => { hero.current?.position.set(battle.heroX, 0.03, 1.2 + battle.heroZ); });
  return (
    <>
      <mesh ref={hero} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[1.7, 1.7]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} fog={false} />
      </mesh>
      {!high && (
        <mesh position={[0, 0.03, MONSTER_Z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[4.4, 4.4]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} fog={false} />
        </mesh>
      )}
    </>
  );
}
