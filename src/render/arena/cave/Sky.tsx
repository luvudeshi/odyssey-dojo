// (Colours here are linear: the composer encodes to sRGB at the end, so they look darker than they read.)
// The dusk sky as a graded dome, not the raw HDRI: the HDRI's sun is thousands of times brighter than its sky, so
// any exposure that keeps the sun from clipping also drowns the colour. Here the gradient (orange at the horizon,
// rose, then violet overhead), a few long cloud bars lit from below and the sun are all set by hand. The sea
// samples the same `skyColor` for its reflection, so the horizon line is seamless.
import { useMemo } from "react";
import { BackSide, Vector3 } from "three";
import { SUN } from "./mouthLayout";

export const SKY_GLSL = /* glsl */ `
float skyHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float skyNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x), mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 skyColor(vec3 d, vec3 sun) {
  float h = max(d.y, 0.0);
  vec3 horizon = vec3(0.9, 0.17, 0.01);
  vec3 rose = vec3(0.45, 0.03, 0.13);
  vec3 top = vec3(0.03, 0.012, 0.17);
  vec3 c = mix(horizon, rose, smoothstep(0.0, 0.2, h));
  c = mix(c, top, smoothstep(0.12, 0.8, h));
  float s = max(dot(d, sun), 0.0);
  // Long cloud bars: stretched noise along the horizon, bright on the sunward side, dark violet on the far side.
  float az = atan(d.x, -d.z);
  float bars = smoothstep(0.52, 0.72, skyNoise(vec2(az * 5.0, h * 26.0)) * skyNoise(vec2(az * 2.0 + 4.0, h * 7.0)) * 1.9)
    * smoothstep(0.02, 0.1, h) * (1.0 - smoothstep(0.3, 0.5, h));
  vec3 cloud = mix(vec3(0.07, 0.01, 0.07), vec3(1.0, 0.21, 0.05), pow(s, 0.7));
  c = mix(c, cloud, bars * 0.75);
  c += vec3(1.0, 0.21, 0.03) * pow(s, 14.0) * 0.6 + vec3(1.0, 0.48, 0.13) * pow(s, 120.0) * 1.2;
  c += vec3(1.0, 0.8, 0.45) * smoothstep(0.9994, 0.9998, s) * 1.6;
  return c;
}`;

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position.z = gl_Position.w * 0.9999;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uSun;
varying vec3 vDir;
${SKY_GLSL}
void main() { gl_FragColor = vec4(skyColor(normalize(vDir), uSun), 1.0); }`;

export function Sky() {
  const uniforms = useMemo(() => ({ uSun: { value: new Vector3(...SUN.visual).normalize() } }), []);
  // The vertex shader pins the dome to the camera, so it must never be culled.
  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[100, 32, 16]} />
      <shaderMaterial vertexShader={VERTEX} fragmentShader={FRAGMENT} uniforms={uniforms} side={BackSide} depthWrite={false} depthTest={false} fog={false} />
    </mesh>
  );
}
