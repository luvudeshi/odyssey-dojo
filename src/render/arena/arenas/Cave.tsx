// Polyphemus's cave: a rock dome, boulders, stalactites, four flickering torches and a mouth open to the sea.
// Built from shapes in code: no textures or models are downloaded.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BackSide, CanvasTexture, ConeGeometry, IcosahedronGeometry, MeshStandardMaterial, SRGBColorSpace } from "three";
import type { Group, PointLight } from "three";
import { CAVE, TORCH_ANGLES, TORCH_RADIUS, caveRocks, caveStalactites, flicker, onFloor } from "../layout";
import type { ArenaDef } from "../registry";

const DARK = "#0b0706";
const ROCK_SHADES = ["#4a3b31", "#3a2e27", "#5a483a"] as const;
const TORCH_LIGHT = 38;

/** Sky over sea, painted once onto a small canvas: the view out of the cave mouth. */
function seaTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const sky = context.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, "#bfe3f2");
    sky.addColorStop(0.5, "#fdf2cf");
    sky.addColorStop(0.56, "#fff8e0");
    sky.addColorStop(0.6, "#3d86a8");
    sky.addColorStop(1, "#103750");
    context.fillStyle = sky;
    context.fillRect(0, 0, 8, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function rockMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 1, flatShading: true });
}

function Torches() {
  const lights = useRef<(PointLight | null)[]>([]);
  const flames = useRef<(Group | null)[]>([]);

  useFrame(({ clock }) => {
    TORCH_ANGLES.forEach((_, index) => {
      const level = flicker(clock.elapsedTime, index);
      const light = lights.current[index];
      if (light) light.intensity = TORCH_LIGHT * level;
      const flame = flames.current[index];
      if (flame) flame.scale.set(0.85 + level * 0.15, 0.55 + level * 0.5, 0.85 + level * 0.15);
    });
  });

  return (
    <>
      {TORCH_ANGLES.map((angle, index) => (
        <group key={angle} position={[...onFloor(angle, TORCH_RADIUS)]}>
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.05, 0.07, 2.2, 6]} />
            <meshStandardMaterial color="#2a1c12" roughness={1} />
          </mesh>
          <mesh position={[0, 2.25, 0]}>
            <cylinderGeometry args={[0.16, 0.08, 0.2, 8]} />
            <meshStandardMaterial color="#3b2a1a" roughness={0.7} metalness={0.4} />
          </mesh>
          <group ref={(group) => { flames.current[index] = group; }} position={[0, 2.35, 0]}>
            <mesh position={[0, 0.28, 0]}>
              <coneGeometry args={[0.17, 0.6, 8]} />
              <meshBasicMaterial color="#ff7a1a" fog={false} />
            </mesh>
            <mesh position={[0, 0.2, 0]}>
              <coneGeometry args={[0.09, 0.38, 8]} />
              <meshBasicMaterial color="#ffe08a" fog={false} />
            </mesh>
          </group>
          <pointLight
            ref={(light) => { lights.current[index] = light; }}
            position={[0, 2.7, 0]}
            color="#ff9a3c"
            intensity={TORCH_LIGHT}
            distance={17}
            decay={1.6}
          />
        </group>
      ))}
    </>
  );
}

function Cave() {
  const rocks = useMemo(() => caveRocks(), []);
  const stalactites = useMemo(() => caveStalactites(), []);
  const assets = useMemo(
    () => ({
      rock: new IcosahedronGeometry(1, 0),
      cone: new ConeGeometry(1, 1, 6),
      shades: [rockMaterial(ROCK_SHADES[0]), rockMaterial(ROCK_SHADES[1]), rockMaterial(ROCK_SHADES[2])] as const,
      sea: seaTexture(),
    }),
    [],
  );
  useEffect(
    () => () => {
      assets.rock.dispose();
      assets.cone.dispose();
      assets.shades.forEach((material) => { material.dispose(); });
      assets.sea.dispose();
    },
    [assets],
  );

  const mouth = onFloor(CAVE.mouthAngle, CAVE.radius - 0.9, 2.5);
  const mouthLight = onFloor(CAVE.mouthAngle, CAVE.radius - 2, 4);
  return (
    <>
      <color attach="background" args={[DARK]} />
      <fog attach="fog" args={[DARK, 9, 30]} />
      <ambientLight intensity={0.32} color="#ffd9b0" />
      {/* A soft warm fill from behind the player so the monster's front is never lost in shadow. */}
      <directionalLight position={[1.5, 5, 6]} intensity={0.75} color="#ffcf9e" />
      {/* Daylight spilling in from the mouth. */}
      <directionalLight position={[...mouthLight]} intensity={1.1} color="#a8d8ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, CAVE.centerZ]}>
        <circleGeometry args={[CAVE.radius, 40]} />
        <meshStandardMaterial color="#4b3b2f" roughness={1} />
      </mesh>
      <mesh position={[0, 0, CAVE.centerZ]} scale={[1, CAVE.squash, 1]}>
        <sphereGeometry args={[CAVE.radius, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2f2520" roughness={1} flatShading side={BackSide} />
      </mesh>

      {/* The mouth: sea and sky, and a pale pool of daylight on the floor in front of it. */}
      <mesh position={[...mouth]} rotation={[0, -CAVE.mouthAngle, 0]} scale={[2.7, 3.3, 1]}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial map={assets.sea} fog={false} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, CAVE.mouthAngle]}
        position={[...onFloor(CAVE.mouthAngle, CAVE.radius - 3.4, 0.02)]}
        scale={[2.2, 3.4, 1]}
      >
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial color="#9fd0ff" transparent opacity={0.13} depthWrite={false} />
      </mesh>

      {rocks.map((rock, index) => (
        <mesh
          key={index}
          geometry={assets.rock}
          material={assets.shades[rock.shade]}
          position={[...rock.position]}
          scale={[...rock.scale]}
          rotation={[...rock.rotation]}
        />
      ))}
      {stalactites.map((spike, index) => (
        <mesh
          key={index}
          geometry={assets.cone}
          material={assets.shades[1]}
          position={[...spike.position]}
          scale={[spike.radius, spike.length, spike.radius]}
          rotation={[Math.PI, 0, 0]}
        />
      ))}
      <Torches />
    </>
  );
}

export const arena: ArenaDef = { enemyId: "polyphemus", Component: Cave };
