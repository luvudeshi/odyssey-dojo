// Poseidon, the trident sweep: a curved wall of water rises behind the hero, rolls across the floor with a foaming,
// curling crest and breaks on the monster in a burst of spray. The wave sheet is a small shader (a bent plane with
// a noisy foam line), two of them staggered for depth, with a wet glow on the floor under them.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, DoubleSide, ShaderMaterial } from "three";
import type { Group, Mesh, MeshBasicMaterial, Points, Sprite } from "three";
import { battle, calmMotion, nowSeconds } from "../../battle";
import { GLOW_PROPS, createParticles, emitBurst, glowTexture, makeAnchors, readAnchors, ringTexture, setGlow, stepParticles, syncPoints } from "./powerKit";
import { POWER_SPAN, easeOut, makeClock, readClock, smooth } from "./powerTiming";

const HEIGHT = 2.0;
const WIDTH = 3.8;

const VERTEX = `
uniform float uH; uniform float uW; uniform float uCurl; uniform float uTime;
varying vec2 vUv;
void main() {
  vUv = uv;
  float u = uv.x - 0.5;
  float y = uv.y;
  float edge = 1.0 - pow(abs(u * 2.0), 3.0) * 0.55;
  float h = uH * edge * (0.92 + 0.08 * sin(u * 13.0 + uTime * 7.0));
  vec3 p;
  p.x = u * uW;
  p.y = y * h;
  // The crest leans forward (toward the monster, -z), and the wave's ends trail back so the sheet is a crescent.
  p.z = -uCurl * pow(y, 2.3) * h * 0.5 + pow(abs(u * 2.0), 2.0) * 1.1 + 0.1 * sin(u * 9.0 + uTime * 6.0 + y * 3.0) * y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAGMENT = `
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform float uAlpha; uniform float uTime;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float y = vUv.y; float u = vUv.x;
  float n = noise(vec2(u * 15.0 + uTime * 1.6, y * 6.0 - uTime * 3.2));
  vec3 body = mix(uDeep, uShallow, smoothstep(0.0, 0.95, y)) * (0.7 + 0.7 * n);
  float line = smoothstep(0.74 + 0.1 * n, 0.97, y);
  float bits = smoothstep(0.6, 0.9, n) * smoothstep(0.45, 1.0, y);
  vec3 c = body + uFoam * (line * 1.7 + bits * 0.9);
  float side = smoothstep(0.0, 0.2, u) * smoothstep(1.0, 0.8, u);
  float bottom = smoothstep(0.0, 0.16, y);
  float a = uAlpha * side * bottom * (0.4 + 0.6 * y);
  gl_FragColor = vec4(c, a);
}`;

function waveMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uH: { value: 0 }, uW: { value: WIDTH }, uCurl: { value: 1 }, uTime: { value: 0 }, uAlpha: { value: 0 },
      uDeep: { value: [0.02, 0.35, 0.5] }, uShallow: { value: [0.1, 0.95, 0.85] }, uFoam: { value: [1.4, 1.7, 1.7] },
    },
    vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  });
}

interface Uniforms { uH: { value: number }; uCurl: { value: number }; uTime: { value: number }; uAlpha: { value: number }; uW: { value: number } }

export function PoseidonStrike() {
  const group = useRef<Group>(null);
  const front = useRef<Mesh>(null);
  const back = useRef<Mesh>(null);
  const wash = useRef<Mesh>(null);
  const washMat = useRef<MeshBasicMaterial>(null);
  const splash = useRef<Sprite>(null);
  const ring = useRef<Mesh>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const points = useRef<Points>(null);
  const k = useMemo(() => ({
    clock: makeClock(), a: makeAnchors(), pool: createParticles(150, 7, 0.8), frontMat: waveMaterial(), backMat: waveMaterial(),
  }), []);
  const live = useRef({ seenHit: -Infinity, sparking: false });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const c = readClock(k.clock, battle.powerGod, battle.powerAt, nowSeconds());
    const on = c.god === "poseidon" && c.phase !== "idle" && !calmMotion();
    const g = group.current;
    if (g && g.visible !== on) g.visible = on;
    const s = live.current;
    syncPoints(points.current, stepParticles(k.pool, dt), s);
    if (!on) return;
    const a = readAnchors(k.a);
    const hit = POWER_SPAN.poseidon.hit;
    const travel = c.strike ** 1.5;
    // It rises at the hero's back and is already out ahead of him by the end of the wind-up, so it never fills the view.
    const startZ = a.hz + 0.2 - 1.2 * easeOut(c.wind);
    const endZ = a.tz + 0.2;
    const broke = c.after;
    const rise = easeOut(c.wind);
    const z = startZ + (endZ - startZ) * travel - 0.7 * easeOut(broke);
    const x = a.hx + (a.tx - a.hx) * travel;
    const height = HEIGHT * rise * (1 + 0.15 * c.strike) * (1 - easeOut(Math.min(1, broke * 1.6)) * 0.95);
    const alpha = 0.6 * smooth(c.wind * 2) * (1 - broke) ** 1.3;
    const crest = z + 0.2;
    const dress = (mesh: Mesh | null, mat: ShaderMaterial, lag: number, scale: number, fade: number): void => {
      if (!mesh) return;
      const u = mat.uniforms as unknown as Uniforms;
      u.uH.value = height * scale; u.uTime.value = c.t; u.uAlpha.value = alpha * fade;
      u.uCurl.value = 1 + 1.4 * smooth(broke * 2) + 0.4 * c.strike;
      u.uW.value = WIDTH * (1 + 0.25 * travel + 0.5 * broke);
      mesh.position.set(x, 0, z + lag * (1 - 0.6 * broke));
      mesh.visible = alpha > 0.01 && height > 0.02;
    };
    dress(front.current, k.frontMat, 0, 1, 1);
    dress(back.current, k.backMat, 0.7, 0.7, 0.6);

    // The wet glow on the floor behind the front of the wave.
    const w = wash.current; const wm = washMat.current;
    if (w && wm) {
      const len = Math.abs(startZ + 0.8 - z) + 1.6;
      w.visible = c.phase !== "windup" && alpha > 0.01;
      w.position.set(x, 0.03, (z + startZ + 0.8) / 2);
      w.scale.set(WIDTH * 0.95, len, 1);
      wm.opacity = 0.5 * alpha;
    }

    // Spray off the crest on the way, then the break on the monster.
    if (c.phase === "strike") {
      emitBurst(k.pool, { x: x + (Math.random() - 0.5) * WIDTH * 0.7, y: height * 0.95, z: crest - 0.4, count: 3, speed: 1.8, r: 1.1, g: 1.5, b: 1.5, life: 0.6, bz: -1, by: 0.5, bias: 0.5 });
    }
    if (c.t >= hit && s.seenHit !== battle.powerAt) {
      s.seenHit = battle.powerAt;
      emitBurst(k.pool, { x: a.tx, y: a.ty * 0.5, z: a.tz, count: 110, speed: 6, r: 1.2, g: 1.7, b: 1.7, life: 1.0, by: 1, bz: 0.5, bias: 0.45 });
    }
    const since = c.t - hit;
    const tt = Math.max(0, since);
    setGlow(splash.current, a.tx, a.ty * 0.7, a.tz, 2 + 6 * easeOut(tt / 0.4), since >= 0 ? 1.6 * (1 - Math.min(1, tt / 0.5)) ** 1.5 : 0, 0.5, 1, 0.95);
    const rg = ring.current; const rm = ringMat.current;
    if (rg && rm) {
      rg.visible = since >= 0 && tt < 0.8;
      const r = 0.5 + 3.4 * easeOut(tt / 0.7);
      rg.position.set(a.tx, 0.05, a.tz);
      rg.scale.set(r / 0.8, r / 0.8, 1);
      rm.opacity = 1.2 * (1 - Math.min(1, tt / 0.8));
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={wash} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={washMat} map={glowTexture()} color="#2fd9c8" {...GLOW_PROPS} />
      </mesh>
      <mesh ref={back} material={k.backMat} frustumCulled={false} visible={false}><planeGeometry args={[1, 1, 28, 18]} /></mesh>
      <mesh ref={front} material={k.frontMat} frustumCulled={false} visible={false}><planeGeometry args={[1, 1, 28, 18]} /></mesh>
      <sprite ref={splash} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial ref={ringMat} map={ringTexture()} color="#9ff5ec" {...GLOW_PROPS} />
      </mesh>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[k.pool.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[k.pool.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.2} map={glowTexture()} sizeAttenuation vertexColors {...GLOW_PROPS} />
      </points>
    </group>
  );
}
