// The sea outside the cave: a flat plane with a small shader. Deep violet-blue near the shore, fading to the sky's
// own orange haze at the horizon, with a glittering sun path and (on high) slowly shifting faceted ripples.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { ShaderMaterial } from "three";
import { Color, DoubleSide, Vector3 } from "three";
import { useQualityLevel } from "../../quality";
import { MOUTH, SUN } from "./mouthLayout";
import { SKY_GLSL } from "./Sky";

const VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uRipples;
uniform vec3 uSun;
uniform vec3 uNear;
uniform vec3 uGlow;
varying vec3 vWorld;
${SKY_GLSL}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec3 toEye = cameraPosition - vWorld;
  float dist = length(toEye);
  vec3 view = toEye / dist;
  // Faceted ripples: each cell tilts the surface a little, and the tilt drifts over time.
  vec2 cell = floor(vWorld.xz * 0.45 + vec2(uTime * 0.05, 0.0));
  float a = hash(cell) * 6.2831 + uTime * 0.6;
  vec2 tilt = vec2(cos(a), sin(a)) * (0.03 + hash(cell + 3.0) * 0.05) * uRipples * smoothstep(120.0, 15.0, dist);
  vec3 normal = normalize(vec3(tilt.x, 1.0, tilt.y));
  vec3 mirrored = reflect(-view, normal);
  float sunDot = max(dot(mirrored, uSun), 0.0);
  float glitter = pow(sunDot, 90.0) * 2.4 + pow(sunDot, 10.0) * 0.5;
  float fresnel = pow(1.0 - max(view.y, 0.0), 3.0);
  float haze = smoothstep(30.0, 520.0, dist);
  // The sea is a dark mirror: deep violet underfoot, the sunset sky itself toward the horizon.
  vec3 color = mix(uNear, skyColor(mirrored, uSun), clamp(fresnel * 0.8 + haze * 0.6 + 0.08, 0.0, 1.0));
  color += uGlow * glitter;
  gl_FragColor = vec4(color, 1.0);
}`;

export function Sea() {
  const high = useQualityLevel() === "high";
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRipples: { value: 1 },
      uSun: { value: new Vector3(...SUN.visual).normalize() },
      uNear: { value: new Color("#2b2f6a") },
      uGlow: { value: new Color("#ffb066") },
    }),
    [],
  );
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ clock }) => {
    const live = material.current?.uniforms;
    const time = live?.uTime, ripples = live?.uRipples;
    if (time) time.value = clock.elapsedTime;
    if (ripples) ripples.value = high ? 1 : 0;
  });
  return (
    <mesh position={[0, MOUTH.seaY, -520]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
      <planeGeometry args={[1400, 1000]} />
      <shaderMaterial ref={material} vertexShader={VERTEX} fragmentShader={FRAGMENT} uniforms={uniforms} side={DoubleSide} />
    </mesh>
  );
}
