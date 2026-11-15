// Storm dusk, painted by a shader on a big inside-out sphere: a low orange sun under a lid of bruised cloud, the
// horizon glowing pink behind the whirlpool and the zenith near black. Built in code, so there is no file to fail.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { ShaderMaterial } from "three";
import { BackSide, Vector3 } from "three";
import { SUN_DIR } from "./layout";

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uSun;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 zenith = vec3(0.045, 0.05, 0.1);
  vec3 mid = vec3(0.23, 0.14, 0.25);
  vec3 horizon = vec3(0.95, 0.45, 0.33);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, up));
  col = mix(col, zenith, smoothstep(0.14, 0.75, up));
  float sunDot = max(dot(d, normalize(uSun)), 0.0);
  col += vec3(1.0, 0.55, 0.25) * pow(sunDot, 14.0) * 0.9 + vec3(1.0, 0.8, 0.5) * pow(sunDot, 220.0) * 2.5;
  // A deck of cloud, torn and lit from underneath by the sun, drifting slowly.
  vec2 uv = d.xz / (d.y + 0.35) * 1.6 + vec2(uTime * 0.012, 0.0);
  float cloud = smoothstep(0.38, 0.8, fbm(uv * 1.1)) * smoothstep(0.0, 0.1, up);
  vec3 under = mix(vec3(0.16, 0.1, 0.2), vec3(0.95, 0.42, 0.3), pow(sunDot, 2.0) * smoothstep(0.5, 0.0, up) + 0.0);
  col = mix(col, under * (0.5 + 0.7 * fbm(uv * 3.0)), cloud * 0.85);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function Sky() {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uSun: { value: new Vector3(...SUN_DIR) } }), []);
  const sky = useRef<ShaderMaterial>(null);
  useFrame(({ clock }) => {
    const slot = sky.current?.uniforms.uTime;
    if (slot) slot.value = clock.elapsedTime;
  });
  return (
    <mesh renderOrder={-10} frustumCulled={false} scale={[600, 600, 600]}>
      <sphereGeometry args={[1, 32, 20]} />
      <shaderMaterial ref={sky} vertexShader={VERTEX} fragmentShader={FRAGMENT} uniforms={uniforms} side={BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}
