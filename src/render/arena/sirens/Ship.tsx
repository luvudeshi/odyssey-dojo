// The black ship, far off, rowing past the island: the crew's ears are stopped with wax and Odysseus is tied to the
// mast. It crawls across the horizon for the length of the fight and bobs on the swell.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BoxGeometry, ConeGeometry, CylinderGeometry, MeshBasicMaterial } from "three";
import type { BufferGeometry, Group } from "three";
import { aimed, merge, part } from "../../monsters/sirens/geo";
import { SEA_Y, SHIP } from "./layout";

function hullGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [
    part(new BoxGeometry(9, 1.1, 2.6), "#17141c", [0, 0.5, 0], [0, 0, 0], [1, 1, 1]),
    // Curved stem and stern posts.
    aimed(new ConeGeometry(0.7, 3, 4, 1), "#17141c", [4.9, 1.4, 0], [0.7, 1, 0], [1, 1, 0.8]),
    aimed(new ConeGeometry(0.7, 3.4, 4, 1), "#17141c", [-4.9, 1.6, 0], [-0.7, 1, 0], [1, 1, 0.8]),
    part(new BoxGeometry(9.4, 0.18, 2.8), "#6a4a30", [0, 1.1, 0]),
    part(new CylinderGeometry(0.11, 0.14, 8, 5, 1), "#3b2a1c", [0, 5, 0]),
    part(new BoxGeometry(0.08, 0.08, 5.6), "#3b2a1c", [0, 7.6, 0]),
    part(new BoxGeometry(0.06, 4.4, 5.2), "#e8d8b8", [0, 5.3, 0]),
    part(new BoxGeometry(0.07, 1.5, 1.8), "#8a2a2a", [0.05, 5.6, 0]),
    // Odysseus, tied to the mast: a small pale figure.
    part(new CylinderGeometry(0.2, 0.2, 0.9, 5, 1), "#e8d8b8", [0.2, 1.8, 0]),
  ];
  for (let i = 0; i < 7; i++) parts.push(part(new BoxGeometry(0.1, 0.1, 2.4), "#3b2a1c", [-3.3 + i * 1.1, 0.7, 1.9], [0, 0, 0.15]), part(new BoxGeometry(0.1, 0.1, 2.4), "#3b2a1c", [-3.3 + i * 1.1, 0.7, -1.9], [0, 0, -0.15]));
  return merge(parts);
}

export function Ship() {
  const geometry = useMemo(() => hullGeometry(), []);
  const material = useMemo(() => new MeshBasicMaterial({ vertexColors: true }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  const group = useRef<Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const span = SHIP.endX - SHIP.startX;
    const x = SHIP.startX + ((t * SHIP.speed + 22) % span);
    group.current?.position.set(x, SEA_Y + 0.15 + Math.sin(t * 0.8) * 0.12, SHIP.z);
    group.current?.rotation.set(Math.sin(t * 0.6) * 0.02, 0, Math.sin(t * 0.8) * 0.03);
  });
  // The hull faces +x (rowing across the view), and is scaled so it reads at this distance.
  return (
    <group ref={group} scale={1.6}>
      <mesh geometry={geometry} material={material} />
    </group>
  );
}
