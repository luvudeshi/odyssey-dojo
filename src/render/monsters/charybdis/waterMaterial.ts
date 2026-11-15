// The shader that makes every part of Charybdis read as moving water. One fragment program, three modes:
// 0 the funnel (spiral foam streaks that turn, black in the throat), 1 sheets of water (walls, crest, spout: foam on
// top) and 2 a flat ring of foam on the sea round her foot. Faces are flat-shaded from screen derivatives.
import { Color, DoubleSide, ShaderMaterial } from "three";
import { PHASES } from "./look";
import { THROAT_Y } from "./shapes";

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uMode;
uniform float uWobble;
uniform float uCenterY;
varying vec3 vLocal;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  if (uMode < 0.5) {
    vec2 d = vec2(p.x, p.y - uCenterY);
    float a = atan(d.y, d.x);
    float t = clamp((p.z + 3.4) / 4.3, 0.0, 1.0);
    float k = 1.0 + uWobble * 0.08 * sin(a * 3.0 + t * 9.0 - uTime * 2.6) * (0.3 + t);
    p.xy = vec2(d.x * k, d.y * k + uCenterY);
  } else if (uMode < 1.5) {
    p.z += uWobble * 0.07 * sin(p.x * 3.0 + p.y * 2.0 + uTime * 3.0);
    p.y += uWobble * 0.05 * sin(p.x * 4.0 - uTime * 2.0);
  }
  vLocal = p;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uMode;
uniform float uFlash;
uniform float uSpin;
uniform float uFoam;
uniform float uDefeat;
uniform float uCenterY;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uFoamColor;
uniform vec3 uGlow;
varying vec3 vLocal;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(n, view) < 0.0) n = -n;
  float diff = max(dot(n, normalize(vec3(-0.5, 0.55, 0.7))), 0.0);
  float rim = pow(1.0 - max(dot(n, view), 0.0), 2.5);
  vec3 col;
  float alpha = 1.0;
  if (uMode < 0.5) {
    vec2 d = vec2(vLocal.x, vLocal.y - uCenterY);
    float a = atan(d.y, d.x) / 6.2831853;
    float t = clamp((vLocal.z + 3.4) / 4.3, 0.0, 1.0);
    float s = a * 5.0 + t * 4.0 - uTime * uSpin * 0.35;
    float band = fract(s);
    float streak = smoothstep(0.0, 0.07, band) * (1.0 - smoothstep(0.1, 0.34, band));
    float grain = noise(vec2(a * 34.0 + uTime * 0.5, t * 16.0));
    float foam = clamp(streak * (0.45 + 0.7 * grain) * (0.3 + t) * uFoam + smoothstep(0.86, 1.0, t) * 0.55 * grain, 0.0, 1.0);
    col = mix(uDeep, uMid, smoothstep(0.0, 0.85, t));
    col = col * (0.5 + 0.85 * diff) + rim * uMid * 0.55;
    col = mix(col, uFoamColor, foam * 0.85);
    col *= mix(0.05, 1.0, smoothstep(0.02, 0.5, t));
    col += uGlow * (1.0 - smoothstep(0.0, 0.4, t)) * 0.45;
  } else if (uMode < 1.5) {
    float h = clamp(vLocal.y / 2.4, 0.0, 1.2);
    float streak = noise(vec2(vLocal.x * 3.0, vLocal.y * 1.5 - uTime * 1.6));
    float foam = smoothstep(0.76, 1.0, h + (streak - 0.5) * 0.3) * uFoam;
    foam = max(foam, step(0.8, streak) * 0.55 * h * uFoam);
    col = mix(uDeep, uMid, smoothstep(0.0, 0.9, h));
    col = col * (0.55 + 0.9 * diff) + rim * uMid * 0.6;
    col = mix(col, uFoamColor, clamp(foam, 0.0, 1.0));
  } else {
    vec2 d = vLocal.xy;
    float r = length(d);
    float a = atan(d.y, d.x) / 6.2831853;
    float s = fract(a * 6.0 + r * 0.9 - uTime * uSpin * 0.25);
    float line = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.1, 0.4, s));
    float grain = 0.35 + 0.8 * noise(vec2(a * 44.0, r * 5.0 - uTime));
    col = uFoamColor;
    alpha = clamp(line * grain, 0.0, 1.0) * smoothstep(1.6, 2.2, r) * (1.0 - smoothstep(3.2, 4.4, r)) * 0.8;
  }
  col = mix(col, vec3(dot(col, vec3(0.33))), uDefeat * 0.5) * (1.0 - 0.3 * uDefeat);
  col += vec3(0.85, 0.95, 1.0) * uFlash * 0.5;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export type WaterMode = 0 | 1 | 2;

export function makeWaterMaterial(mode: WaterMode): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: DoubleSide,
    transparent: mode === 2,
    depthWrite: mode !== 2,
    uniforms: {
      uTime: { value: 0 },
      uMode: { value: mode },
      uWobble: { value: 1 },
      uFlash: { value: 0 },
      uSpin: { value: 1 },
      uFoam: { value: 1 },
      uDefeat: { value: 0 },
      uCenterY: { value: THROAT_Y },
      uDeep: { value: new Color(PHASES[0].deep) },
      uMid: { value: new Color(PHASES[0].mid) },
      uFoamColor: { value: new Color(PHASES[0].foam) },
      uGlow: { value: new Color(PHASES[0].glow) },
    },
  });
}

export interface WaterState {
  readonly time: number;
  readonly flash: number;
  readonly spin: number;
  readonly defeat: number;
  /** Phase as a number: 0, 1 or 2, eased between whole values. */
  readonly phase: number;
}

const from = new Color();
const to = new Color();
const mix = (out: Color, key: "deep" | "mid" | "foam" | "glow", phase: number): Color => {
  const i = Math.min(PHASES.length - 1, Math.max(0, Math.floor(phase)));
  const j = Math.min(PHASES.length - 1, i + 1);
  from.set(PHASES[i]?.[key] ?? "#000000");
  to.set(PHASES[j]?.[key] ?? "#000000");
  return out.copy(from).lerp(to, phase - i);
};

export function updateWater(material: ShaderMaterial, state: WaterState): void {
  const u = material.uniforms as Record<string, { value: unknown } | undefined>;
  const set = (key: string, value: unknown): void => {
    const slot = u[key];
    if (slot) slot.value = value;
  };
  set("uTime", state.time);
  set("uFlash", state.flash);
  set("uSpin", state.spin);
  set("uDefeat", state.defeat);
  const lo = Math.min(PHASES.length - 1, Math.floor(state.phase));
  const hi = Math.min(PHASES.length - 1, lo + 1);
  const foamLo = PHASES[lo]?.foamAmount ?? 1, foamHi = PHASES[hi]?.foamAmount ?? 1;
  set("uFoam", foamLo + (foamHi - foamLo) * (state.phase - lo));
  for (const [key, uniform] of [["deep", "uDeep"], ["mid", "uMid"], ["foam", "uFoamColor"], ["glow", "uGlow"]] as const) {
    const slot = u[uniform];
    if (slot?.value instanceof Color) mix(slot.value, key, state.phase);
  }
}
