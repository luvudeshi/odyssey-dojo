// Thin slanted rain streaks in a box around the fight, falling in the vertex shader: one draw call, no CPU work.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { ShaderMaterial } from "three";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { mulberry } from "../cave/mouthLayout";

const COUNT = 260;

const VERTEX = /* glsl */ `
uniform float uTime;
attribute float aEnd;
attribute float aSpeed;
varying float vAlpha;
void main() {
  vec3 p = position;
  p.y = mod(p.y - uTime * aSpeed, 16.0) - 1.5;
  p.x += (p.y) * 0.18 + aEnd * 0.1;
  p.y += aEnd * 0.9;
  vAlpha = 0.28 * (1.0 - aEnd * 0.7);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}`;

const FRAGMENT = /* glsl */ `
varying float vAlpha;
void main() { gl_FragColor = vec4(0.72, 0.8, 0.9, vAlpha); }`;

export function Rain() {
  const geometry = useMemo(() => {
    const random = mulberry(77);
    const position: number[] = [];
    const end: number[] = [];
    const speed: number[] = [];
    for (let i = 0; i < COUNT; i++) {
      const x = -14 + random() * 28, y = random() * 16, z = -16 + random() * 26, s = 9 + random() * 6;
      position.push(x, y, z, x, y, z);
      end.push(0, 1);
      speed.push(s, s);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(position, 3));
    g.setAttribute("aEnd", new Float32BufferAttribute(end, 1));
    g.setAttribute("aSpeed", new Float32BufferAttribute(speed, 1));
    return g;
  }, []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const rain = useRef<ShaderMaterial>(null);
  useFrame(({ clock }) => {
    const slot = rain.current?.uniforms.uTime;
    if (slot) slot.value = clock.elapsedTime;
  });
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <shaderMaterial ref={rain} vertexShader={VERTEX} fragmentShader={FRAGMENT} uniforms={uniforms} transparent depthWrite={false} />
    </lineSegments>
  );
}
