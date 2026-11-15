// The sky over the Sirens' sea, built in code (so there is no file to fail): a gradient dome from a hot, hazy
// horizon to deep blue, flat-shaded clouds and blue islands on the horizon. `dim` (0..1) darkens and sours it as
// the fight turns sinister.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BackSide, BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, MeshBasicMaterial, SphereGeometry } from "three";
import type { Mesh } from "three";
import { merge, mulberry, part } from "../../monsters/sirens/geo";

const HORIZON = new Color("#fbe9c4");
const MID = new Color("#9fd2f0");
const ZENITH = new Color("#3d86d8");

function domeGeometry(): BufferGeometry {
  const dome = new SphereGeometry(400, 24, 16);
  const position = dome.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const c = new Color();
  for (let i = 0; i < position.count; i++) {
    const up = Math.max(0, position.getY(i) / 400);
    if (up < 0.22) c.copy(HORIZON).lerp(MID, up / 0.22);
    else c.copy(MID).lerp(ZENITH, Math.min(1, (up - 0.22) / 0.6));
    c.toArray(colors, i * 3);
  }
  dome.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return dome;
}

function cloudGeometry(): BufferGeometry {
  const random = mulberry(9);
  const parts: BufferGeometry[] = [];
  for (let c = 0; c < 9; c++) {
    const angle = -2.4 + (c / 8) * 1.6 + random() * 0.2;
    const distance = 220 + random() * 80;
    const cx = Math.sin(angle) * distance + 20, cz = -Math.cos(angle) * distance;
    const cy = 40 + random() * 60;
    for (let b = 0; b < 5; b++) {
      const size = 14 + random() * 14;
      parts.push(part(new IcosahedronGeometry(1, 1), b % 2 === 0 ? "#ffffff" : "#eef3fb", [cx + (b - 2) * size * 0.9, cy + random() * 4, cz + (random() - 0.5) * 8], [0, 0, 0], [size, size * 0.42, size * 0.8]));
    }
  }
  return merge(parts);
}

/** Blue-grey islands on the horizon, mostly hidden by haze. */
function isleGeometry(): BufferGeometry {
  const random = mulberry(4);
  const parts: BufferGeometry[] = [];
  for (const [x, z, s] of [[-120, -190, 46], [-40, -230, 70], [70, -210, 54], [150, -170, 38], [215, -120, 44]] as const) {
    parts.push(part(new IcosahedronGeometry(1, 1), "#8fb3c9", [x, 0, z], [0, random() * 3, 0], [s * 1.6, s * (0.18 + random() * 0.12), s * 0.8]));
  }
  return merge(parts);
}

export function Sky({ dim }: { dim: { current: number } }) {
  const geometries = useMemo(() => ({ dome: domeGeometry(), clouds: cloudGeometry(), isles: isleGeometry() }), []);
  const materials = useMemo(
    () => ({
      dome: new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }),
      clouds: new MeshBasicMaterial({ vertexColors: true, fog: false }),
      isles: new MeshBasicMaterial({ vertexColors: true, fog: true }),
    }),
    [],
  );
  useEffect(() => () => {
    Object.values(geometries).forEach((g) => { g.dispose(); });
    Object.values(materials).forEach((m) => { m.dispose(); });
  }, [geometries, materials]);
  const clouds = useRef<Mesh>(null);
  const sour = useMemo(() => new Color("#9a7aa6"), []);
  useFrame((_, delta) => {
    const d = dim.current;
    materials.dome.color.setRGB(1, 1, 1).lerp(sour, d * 0.75);
    materials.clouds.color.setRGB(1, 1, 1).lerp(sour, d * 0.8);
    if (clouds.current) clouds.current.position.x += delta * 0.35;
    if (clouds.current && clouds.current.position.x > 120) clouds.current.position.x = -120;
  });
  return (
    <>
      <mesh geometry={geometries.dome} material={materials.dome} renderOrder={-10} />
      <mesh ref={clouds} geometry={geometries.clouds} material={materials.clouds} />
      <mesh geometry={geometries.isles} material={materials.isles} />
    </>
  );
}
