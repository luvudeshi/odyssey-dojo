// Light shafts: soft additive beams that follow the sun's direction from the mouth into the hall, plus dust motes
// drifting through them. Cheap on purpose (a few transparent quads, no post-processing) so it holds 60 fps.
import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from "three";
import { MOUTH, SUN } from "./mouthLayout";

const LENGTH = 24;
/** Where each beam starts in the mouth: x, y, width. */
const BEAMS: readonly (readonly [number, number, number])[] = [
  [-6.5, 3.2, 2.2], [-4.2, 4.6, 1.5], [-1.8, 2.4, 1.8], [0.4, 5.2, 2.4], [2.6, 3.0, 1.6], [4.8, 4.4, 2.0],
];

function beamTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const image = context.createImageData(32, 128);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 32; x++) {
        const across = Math.sin(((x + 0.5) / 32) * Math.PI) ** 2;
        const along = Math.sin(((y + 0.5) / 128) * Math.PI) ** 0.7;
        image.data.set([255, 255, 255, Math.round(255 * across * along)], (y * 32 + x) * 4);
      }
    }
    context.putImageData(image, 0, 0);
  }
  return new CanvasTexture(canvas);
}

export function LightShafts() {
  const travel = useMemo(() => new Vector3(...SUN.dir).multiplyScalar(-1).normalize(), []);
  const assets = useMemo(() => {
    const texture = beamTexture();
    const side = new Vector3().crossVectors(new Vector3(0, 1, 0), travel).normalize();
    const normal = new Vector3().crossVectors(side, travel).normalize();
    const flat = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(side, travel, normal));
    const upright = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(normal, travel, side));
    const beams = BEAMS.map(([x, y, width]) => ({
      x, y, width,
      material: new MeshBasicMaterial({
        map: texture, color: new Color("#ffb468"), transparent: true, opacity: 0.1, depthWrite: false,
        blending: AdditiveBlending, side: DoubleSide, fog: false,
      }),
    }));
    return { texture, flat, upright, beams };
  }, [travel]);
  useEffect(() => () => {
    assets.texture.dispose();
    assets.beams.forEach(({ material }) => { material.dispose(); });
  }, [assets]);
  useFrame(({ clock }) => {
    assets.beams.forEach(({ material }, index) => {
      material.opacity = 0.085 + 0.03 * Math.sin(clock.elapsedTime * 0.6 + index * 1.9);
    });
  });
  const start = MOUTH.lipZ + 0.5;
  return (
    <>
      {assets.beams.map(({ x, y, width, material }, index) => (
        <group
          key={index}
          position={[x + (travel.x * LENGTH) / 2, y + (travel.y * LENGTH) / 2, start + (travel.z * LENGTH) / 2]}
        >
          <mesh quaternion={assets.flat} material={material} renderOrder={2}>
            <planeGeometry args={[width, LENGTH]} />
          </mesh>
          <mesh quaternion={assets.upright} material={material} renderOrder={2}>
            <planeGeometry args={[width, LENGTH]} />
          </mesh>
        </group>
      ))}
      <Sparkles count={46} scale={[14, 6, 18]} position={[-1, 3.2, -4]} size={2.4} speed={0.18} opacity={0.55} color="#ffd9a0" />
    </>
  );
}
