// A storm-bruised dusk sky built in code: a gradient dome with a low sun glowing over Charybdis's side of the strait.
// Nothing to load, so it cannot fail.
import { useMemo } from "react";
import { BackSide, Color, Float32BufferAttribute, SphereGeometry } from "three";

const SUN_DIR: readonly [number, number, number] = [-0.62, 0.14, -0.77];

function skyGeometry(): SphereGeometry {
  const g = new SphereGeometry(160, 28, 14);
  const p = g.getAttribute("position");
  const colors = new Float32Array(p.count * 3);
  const horizon = new Color("#d6a085"), mid = new Color("#7d7a9e"), top = new Color("#283250"), glow = new Color("#ffcf8a");
  const c = new Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 160;
    const t = Math.max(0, y);
    c.copy(horizon).lerp(mid, Math.min(1, t * 3.2)).lerp(top, Math.min(1, Math.max(0, t * 1.6 - 0.3)));
    const dot = (p.getX(i) * SUN_DIR[0] + p.getY(i) * SUN_DIR[1] + p.getZ(i) * SUN_DIR[2]) / 160;
    c.lerp(glow, Math.max(0, dot - 0.7) * 2.6);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return g;
}

export function Sky() {
  const geometry = useMemo(() => skyGeometry(), []);
  return (
    <>
      <mesh geometry={geometry} frustumCulled={false}>
        <meshBasicMaterial vertexColors side={BackSide} fog={false} depthWrite={false} />
      </mesh>
      <mesh position={SUN_DIR.map((v) => v * 140) as [number, number, number]}>
        <sphereGeometry args={[7, 16, 12]} />
        <meshBasicMaterial color="#ffe2b0" toneMapped={false} fog={false} />
      </mesh>
    </>
  );
}
