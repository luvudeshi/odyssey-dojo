// The hearth fire, the torches and the night sky behind the courtyard door.
import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { CanvasTexture } from "three";
import type { Group, PointLight } from "three";
import { useQualityLevel } from "../../quality";
import { flicker } from "../layout";
import { COURT_DOOR, HALL, HEARTH, TORCHES } from "./layout";

const FLAME: [number, number, number] = [4, 1.4, 0.25];
const CORE: [number, number, number] = [5, 3.4, 1.2];

export function HearthFire() {
  const high = useQualityLevel() === "high";
  const light = useRef<PointLight>(null);
  const flame = useRef<Group>(null);
  useFrame(({ clock }) => {
    const level = flicker(clock.elapsedTime, 2);
    if (light.current) light.current.intensity = 120 * level;
    flame.current?.scale.set(0.85 + level * 0.2, 0.6 + level * 0.6, 0.85 + level * 0.2);
  });
  return (
    <group position={[HEARTH.x, 0.4, HEARTH.z]}>
      <group ref={flame}>
        {([[0, 0, 0.7, 1.7, 0], [0.45, 0.2, 0.45, 1.2, -0.35], [-0.42, -0.2, 0.45, 1.1, 0.4], [0.1, -0.5, 0.4, 0.9, 0.15]] as const).map(([x, z, r, h, lean], i) => (
          <mesh key={i} position={[x, h / 2, z]} rotation={[0, 0, lean]}>
            <coneGeometry args={[r, h, 6]} />
            <meshBasicMaterial color={FLAME} toneMapped={false} fog={false} />
          </mesh>
        ))}
        <mesh position={[0, 0.5, 0]}>
          <coneGeometry args={[0.3, 1.0, 5]} />
          <meshBasicMaterial color={CORE} toneMapped={false} fog={false} />
        </mesh>
      </group>
      <pointLight ref={light} position={[0, 1.6, 0.4]} color="#ff8a3a" intensity={120} distance={26} decay={1.4} />
      <Sparkles count={high ? 40 : 16} scale={[2.2, 5, 2.2]} position={[0, 3, 0]} size={4} speed={0.9} opacity={1} color="#ffa040" />
    </group>
  );
}

export function Torches() {
  const lights = useRef<(PointLight | null)[]>([]);
  useFrame(({ clock }) => {
    lights.current.forEach((l, i) => { if (l) l.intensity = 26 * flicker(clock.elapsedTime, i + 5); });
  });
  return (
    <>
      {TORCHES.map((t, i) => (
        <group key={i} position={[t.x, t.y, t.z]}>
          <mesh position={[0, 0.3, 0]}>
            <coneGeometry args={[0.13, 0.4, 5]} />
            <meshBasicMaterial color={FLAME} toneMapped={false} fog={false} />
          </mesh>
          {t.lit && <pointLight ref={(l) => { lights.current[i] = l; }} position={[t.x < 0 ? 0.6 : -0.6, 0.4, 0]} color="#ff9a4a" intensity={26} distance={12} decay={1.5} />}
        </group>
      ))}
    </>
  );
}

function nightTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d");
  if (g) {
    const sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, "#0a1030");
    sky.addColorStop(0.7, "#1d2f5c");
    sky.addColorStop(1, "#3a4f7a");
    g.fillStyle = sky;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = "#e9eefc";
    for (let i = 0; i < 90; i++) g.fillRect((i * 97) % 512, (i * 53) % 170, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    g.fillStyle = "#f4f0d8";
    g.beginPath();
    g.arc(360, 70, 22, 0, Math.PI * 2);
    g.fill();
  }
  return new CanvasTexture(c);
}

/** The sky behind the doorway to the courtyard, with a moon. */
export function NightSky() {
  const texture = useMemo(() => nightTexture(), []);
  return (
    <>
      <mesh position={[HALL.minX - 9, 3.5, COURT_DOOR.z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[26, 13]} />
        <meshBasicMaterial map={texture} toneMapped={false} fog={false} />
      </mesh>
      <pointLight position={[HALL.minX + 1.2, 3.2, COURT_DOOR.z]} color="#8fb0ff" intensity={30} distance={11} decay={1.5} />
    </>
  );
}
