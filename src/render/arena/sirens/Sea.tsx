// The calm sea all round the islet: a big sheet of flat triangles that rock very gently, so the sun glitters in
// facets. Teal by the shore, deep blue farther out, pale where it meets the haze.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, Float32BufferAttribute, MeshStandardMaterial, PlaneGeometry } from "three";
import { calmMotion } from "../../battle";
import { SEA_Y } from "./layout";

const SIZE = 700;
const SEGMENTS = 28;

export function Sea({ low }: { low: boolean }) {
  const geometry = useMemo(() => {
    const plane = new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2);
    const position = plane.getAttribute("position");
    const near = new Color("#2fb8b0"), far = new Color("#1d6fb0"), haze = new Color("#cfe6ea");
    const colors = new Float32Array(position.count * 3);
    const c = new Color();
    for (let i = 0; i < position.count; i++) {
      const d = Math.hypot(position.getX(i), position.getZ(i) + 4);
      c.copy(near).lerp(far, Math.min(1, d / 120)).lerp(haze, Math.max(0, (d - 150) / 200));
      c.toArray(colors, i * 3);
    }
    plane.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return plane;
  }, []);
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35, metalness: 0.1 }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  const base = useMemo(() => Float32Array.from(geometry.getAttribute("position").array), [geometry]);
  useFrame((state) => {
    if (low || calmMotion()) return;
    const t = state.clock.elapsedTime;
    const position = geometry.getAttribute("position");
    // Only the near part of the sheet matters; the far facets are too small to see move.
    for (let i = 0; i < position.count; i++) {
      const x = base[i * 3] ?? 0, z = base[i * 3 + 2] ?? 0;
      if (Math.abs(x) > 160 || Math.abs(z) > 160) continue;
      position.setY(i, Math.sin(x * 0.21 + t * 0.7) * 0.07 + Math.sin(z * 0.17 - t * 0.55 + x * 0.05) * 0.07);
    }
    position.needsUpdate = true;
  });
  return <mesh geometry={geometry} material={material} position={[0, SEA_Y, 0]} receiveShadow={!low} />;
}
