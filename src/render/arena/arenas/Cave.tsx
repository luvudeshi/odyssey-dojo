// Polyphemus's cave: a rock dome, boulders, stalactites, four flickering torches and a mouth open to the sea.
// Shapes are built in code; the rock wall and floor use CC0 Poly Haven textures (see CREDITS.md).
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BackSide, CanvasTexture, ConeGeometry, IcosahedronGeometry, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from "three";
import type { Group, PointLight, Texture } from "three";
import { CAVE, TORCH_ANGLES, TORCH_RADIUS, caveRocks, caveStalactites, flicker, onFloor } from "../layout";
import { useQualityLevel } from "../../quality";
import type { ArenaDef } from "../registry";

const DARK = "#0d0705";
const TEX = `${import.meta.env.BASE_URL}textures/`;
const ROCK_SHADES = ["#4a3b31", "#3a2e27", "#5a483a"] as const;
const TORCH_LIGHT = 55;

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

function tile(texture: Texture, x: number, y: number, srgb: boolean): Texture {
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(x, y);
  if (srgb) texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** One rock set (colour, normal, roughness) tiled `x` by `y` times. */
function useRockSet(name: string, x: number, y: number): { map: Texture; normalMap: Texture; roughnessMap: Texture } {
  const set = useTexture({
    map: `${TEX}${name}_diff_1k.jpg`,
    normalMap: `${TEX}${name}_nor_gl_1k.jpg`,
    roughnessMap: `${TEX}${name}_rough_1k.jpg`,
  });
  return {
    map: tile(set.map, x, y, true),
    normalMap: tile(set.normalMap, x, y, false),
    roughnessMap: tile(set.roughnessMap, x, y, false),
  };
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
              <meshBasicMaterial color={[5, 1.6, 0.25]} toneMapped={false} fog={false} />
            </mesh>
            <mesh position={[0, 0.2, 0]}>
              <coneGeometry args={[0.09, 0.38, 8]} />
              <meshBasicMaterial color={[6, 4.2, 1.5]} toneMapped={false} fog={false} />
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
  const high = useQualityLevel() === "high";
  const wall = useRockSet("rock_surface", 7, 2);
  const floor = useRockSet("rocky_trail", 4, 4);
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
      <fog attach="fog" args={["#1a0d07", 7, 24]} />
      <ambientLight intensity={0.28} color="#ffd9b0" />
      {/* A soft warm fill from behind the player so the monster's front is never lost in shadow. */}
      {/* The fight's one shadow-casting light. */}
      <directionalLight
        position={[1.5, 5, 6]}
        intensity={0.75}
        color="#ffcf9e"
        castShadow={high}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={22}
        shadow-bias={-0.0005}
      />
      {/* Daylight spilling in from the mouth. */}
      <directionalLight position={[...mouthLight]} intensity={1.1} color="#a8d8ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, CAVE.centerZ]} receiveShadow>
        <circleGeometry args={[CAVE.radius, 40]} />
        <meshStandardMaterial {...floor} color="#9a8272" />
      </mesh>
      <mesh position={[0, 0, CAVE.centerZ]} scale={[1, CAVE.squash, 1]}>
        <sphereGeometry args={[CAVE.radius, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial {...wall} color="#8a7566" side={BackSide} />
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

/** The old torch-lit cave. Kept as the fallback for the cave mouth (see ArenaFor). */
export const arena: ArenaDef = { enemyId: "polyphemus-classic", Component: Cave };
