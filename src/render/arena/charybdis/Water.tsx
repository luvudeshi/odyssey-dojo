// The strait: choppy faceted water with a dish dug into it where the whirlpool stands. The near patch is a coarse grid
// whose vertices ride the waves (the facets get their own flat shade, so it reads as low-poly); beyond it the same
// shader runs on one flat plane out to the horizon. No lights are involved: the shader fakes the dusk.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { ShaderMaterial } from "three";
import { Color, DoubleSide, Vector3 } from "three";
import { SEA_Y, SUN_DIR, WHIRL } from "./layout";

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uBase;
uniform vec2 uWhirl;
uniform float uAmp;
float swell(vec2 p, float t) {
  return sin(p.x * 0.33 + t * 0.9 + sin(p.y * 0.21 + t * 0.3)) * 0.5
       + sin(p.y * 0.52 - t * 1.25 + p.x * 0.17) * 0.35
       + sin((p.x + p.y) * 0.83 + t * 1.8) * 0.15;
}
float height(vec2 p, float t) {
  vec2 d = p - uWhirl;
  float r = length(d);
  float edge = smoothstep(54.0, 36.0, max(abs(p.x), abs(p.y + 8.0)));
  float chop = 1.0 + 1.6 * exp(-r * r / 90.0);
  float dish = exp(-r * r / 11.0) * 1.05 + exp(-r * r / 70.0) * 0.18;
  // The dish drags the surface round: ripples that spiral in.
  float a = atan(d.y, d.x);
  float spiral = sin(a * 3.0 + r * 0.9 - t * 2.2) * 0.07 * exp(-r * r / 60.0);
  return uBase + (swell(p, t) * uAmp * chop + spiral) * edge - dish;
}`;

const VERTEX = /* glsl */ `
${COMMON}
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.y = height(world.xz, uTime);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FLAT_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAGMENT = /* glsl */ `
${COMMON}
uniform vec3 uSun;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uHaze;
uniform vec3 uGlow;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec3 toEye = cameraPosition - vWorld;
  float dist = length(toEye);
  vec3 view = toEye / dist;
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  // Far from the camera the facets are too small to see, so fade to a calm, slightly noisy normal.
  vec2 d = vWorld.xz - uWhirl;
  float r = length(d);
  float far = smoothstep(40.0, 110.0, dist);
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), far));
  vec3 mirrored = reflect(-view, n);
  float sunDot = max(dot(mirrored, uSun), 0.0);
  float glint = pow(sunDot, 60.0) * 2.2 + pow(sunDot, 8.0) * 0.45;
  float fresnel = pow(1.0 - max(dot(view, n), 0.0), 3.0);
  float h = vWorld.y - uBase;
  float crest = smoothstep(0.1, 0.32, h) * (0.6 + 0.6 * noise(vWorld.xz * 1.7 + uTime * 0.3));
  float lit = 0.35 + 0.65 * max(dot(n, normalize(vec3(-0.4, 0.7, 0.5))), 0.0);
  vec3 color = mix(uDeep, uShallow, clamp(lit * 0.6 + h * 1.6 + 0.15, 0.0, 1.0));
  color = mix(color, uHaze, clamp(fresnel * 0.6, 0.0, 1.0));
  // Spiral foam streaks drawn into the dish, getting darker and busier toward the centre.
  float a = atan(d.y, d.x) / 6.2831853;
  float streak = fract(a * 4.0 + log(r + 1.0) * 2.2 - uTime * 0.12);
  float line = smoothstep(0.0, 0.05, streak) * (1.0 - smoothstep(0.06, 0.2, streak));
  float ring = (1.0 - smoothstep(2.0, 12.0, r)) * (0.4 + 0.6 * noise(vec2(a * 24.0, r * 1.2 - uTime * 0.5)));
  color = mix(color, vec3(0.8, 0.9, 0.9), line * ring * 0.55);
  color *= mix(1.0, 0.45, exp(-r * r / 9.0));
  color = mix(color, vec3(0.78, 0.86, 0.85), crest * 0.5);
  color += uGlow * glint;
  float haze = smoothstep(26.0, 190.0, dist);
  color = mix(color, uHaze, haze);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function Water() {
  const near = useRef<ShaderMaterial>(null);
  const far = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBase: { value: SEA_Y },
      uWhirl: { value: { x: WHIRL.x, y: WHIRL.z } },
      uAmp: { value: 0.13 },
      uSun: { value: new Vector3(...SUN_DIR).normalize() },
      uDeep: { value: new Color("#071c26") },
      uShallow: { value: new Color("#1f5560") },
      uHaze: { value: new Color("#7a5266") },
      uGlow: { value: new Color("#ffa86a") },
    }),
    [],
  );
  useFrame(({ clock }) => {
    const slot = near.current?.uniforms.uTime;
    if (slot) slot.value = clock.elapsedTime;
  });
  return (
    <>
      <mesh position={[0, 0, -8]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <planeGeometry args={[110, 110, 64, 64]} />
        <shaderMaterial ref={near} vertexShader={VERTEX} fragmentShader={FRAGMENT} uniforms={uniforms} side={DoubleSide} />
      </mesh>
      <mesh position={[0, SEA_Y - 0.06, -300]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <planeGeometry args={[2400, 1200]} />
        <shaderMaterial ref={far} vertexShader={FLAT_VERTEX} fragmentShader={FRAGMENT} uniforms={uniforms} side={DoubleSide} />
      </mesh>
    </>
  );
}
