// Shared pieces for the six divine power effects: soft glow and ring textures, coloured particle pools, screen-facing
// ribbons, a fresnel shell, and where the hero and the monster's weak spot are. Everything is allocated once; the
// per-frame functions only write into typed arrays and existing objects.
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, ShaderMaterial } from "three";
import type { Points, Sprite } from "three";
import { battle } from "../../battle";
import { MONSTER_Z } from "../../cameraShots";
import { MONSTER_CHEST } from "../events";
import { HOME_Z } from "../../PlayerFigure";

let glow: CanvasTexture | null = null;
let ring: CanvasTexture | null = null;

function paint(draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (g) draw(g);
  return new CanvasTexture(canvas);
}

/** A white dot that fades smoothly to nothing at its edge. */
export function glowTexture(): CanvasTexture {
  glow ??= paint((g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.2, "rgba(255,255,255,0.6)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.14)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
  return glow;
}

/** A soft ring whose crest sits at 0.8 of the plane's half size. */
export function ringTexture(): CanvasTexture {
  ring ??= paint((g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,0)");
    grad.addColorStop(0.74, "rgba(255,255,255,0.55)");
    grad.addColorStop(0.8, "rgba(255,255,255,1)");
    grad.addColorStop(0.87, "rgba(255,255,255,0.5)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
  return ring;
}

/** Shows a glow sprite at a point; `a` above 1 brightens it past white for the bloom. */
export function setGlow(s: Sprite | null, x: number, y: number, z: number, size: number, a: number, r: number, g: number, b: number): void {
  if (!s) return;
  const on = a > 0.004 && size > 0.001;
  s.visible = on;
  if (!on) return;
  s.position.set(x, y, z);
  s.scale.set(size, size, 1);
  s.material.opacity = Math.min(1, a);
  const k = Math.max(1, a);
  s.material.color.setRGB(r * k, g * k, b * k);
}

// ---- where things are -------------------------------------------------------------------------------------------

export interface Anchors {
  /** The hero's root. */
  hx: number; hy: number; hz: number;
  /** The weak spot (or the chest) the power is aimed at, nudged toward the camera so it is not inside the monster. */
  tx: number; ty: number; tz: number;
}

export function makeAnchors(): Anchors {
  return { hx: 0, hy: 0, hz: HOME_Z, tx: 0, ty: 2.6, tz: MONSTER_Z };
}

export function readAnchors(out: Anchors): Anchors {
  const spot = battle.powerSpot ?? MONSTER_CHEST;
  out.hx = battle.heroX; out.hy = 0; out.hz = HOME_Z + battle.heroZ;
  out.tx = spot[0] + battle.rigX; out.ty = spot[1] + battle.rigY; out.tz = MONSTER_Z + spot[2] + battle.rigZ + 0.25;
  return out;
}

// ---- particles --------------------------------------------------------------------------------------------------

export interface Particles {
  readonly size: number;
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly velocities: Float32Array;
  readonly base: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly gravity: number;
  readonly drag: number;
  cursor: number;
}

const PARKED_Y = -50;

/** `gravity` pulls down (negative rises, for embers); `drag` is the fraction of speed lost per second. */
export function createParticles(size: number, gravity: number, drag: number): Particles {
  const positions = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) positions[i * 3 + 1] = PARKED_Y;
  return {
    size, positions, colors: new Float32Array(size * 3), velocities: new Float32Array(size * 3), base: new Float32Array(size * 3),
    life: new Float32Array(size), maxLife: new Float32Array(size), gravity, drag, cursor: 0,
  };
}

export interface BurstShape {
  x: number; y: number; z: number;
  count: number; speed: number;
  r: number; g: number; b: number;
  life: number;
  /** Mixes every spark's direction toward (bx, by, bz) by `bias` (0 = a sphere, 1 = all along it). */
  bx?: number; by?: number; bz?: number; bias?: number;
}

export function emitBurst(p: Particles, o: BurstShape, random: () => number = Math.random): void {
  const bias = o.bias ?? 0;
  for (let n = 0; n < o.count; n++) {
    const i = p.cursor;
    p.cursor = (p.cursor + 1) % p.size;
    const turn = random() * Math.PI * 2;
    const lift = random() * 2 - 1;
    const flat = Math.sqrt(1 - lift * lift);
    const pace = o.speed * (0.3 + random() * 0.7);
    const dx = Math.cos(turn) * flat * (1 - bias) + (o.bx ?? 0) * bias;
    const dy = lift * (1 - bias) + (o.by ?? 0) * bias;
    const dz = Math.sin(turn) * flat * (1 - bias) + (o.bz ?? 0) * bias;
    p.positions[i * 3] = o.x; p.positions[i * 3 + 1] = o.y; p.positions[i * 3 + 2] = o.z;
    p.velocities[i * 3] = dx * pace; p.velocities[i * 3 + 1] = dy * pace; p.velocities[i * 3 + 2] = dz * pace;
    p.base[i * 3] = o.r; p.base[i * 3 + 1] = o.g; p.base[i * 3 + 2] = o.b;
    const life = o.life * (0.55 + random() * 0.45);
    p.life[i] = life; p.maxLife[i] = life;
  }
}

/** Moves every live particle on `dt` seconds and returns how many are alive. */
export function stepParticles(p: Particles, dt: number): number {
  let alive = 0;
  const keep = Math.exp(-p.drag * dt);
  for (let i = 0; i < p.size; i++) {
    const left = (p.life[i] ?? 0) - dt;
    const x = i * 3;
    if (left <= 0) {
      if ((p.life[i] ?? 0) > 0) {
        p.life[i] = 0; p.positions[x + 1] = PARKED_Y; p.colors.fill(0, x, x + 3);
      }
      continue;
    }
    alive++;
    p.life[i] = left;
    p.velocities[x + 1] = (p.velocities[x + 1] ?? 0) * keep - p.gravity * dt;
    p.velocities[x] = (p.velocities[x] ?? 0) * keep;
    p.velocities[x + 2] = (p.velocities[x + 2] ?? 0) * keep;
    for (let a = 0; a < 3; a++) p.positions[x + a] = (p.positions[x + a] ?? 0) + (p.velocities[x + a] ?? 0) * dt;
    const whole = p.maxLife[i] ?? 0;
    const f = whole > 0 ? (left / whole) ** 0.8 : 0;
    for (let a = 0; a < 3; a++) p.colors[x + a] = (p.base[x + a] ?? 0) * f;
  }
  return alive;
}

/** Uploads a particle pool to its Points object, also on the frame the last one dies so none freeze on screen. */
export function syncPoints(points: Points | null, alive: number, live: { sparking: boolean }): void {
  if (alive > 0 || live.sparking) {
    const attributes = points?.geometry.attributes;
    if (attributes?.position) attributes.position.needsUpdate = true;
    if (attributes?.color) attributes.color.needsUpdate = true;
  }
  live.sparking = alive > 0;
}

// ---- ribbons ----------------------------------------------------------------------------------------------------

export interface Ribbon {
  readonly geometry: BufferGeometry;
  /** x, y, z of each point along the line; the caller fills the first `n`. */
  readonly pts: Float32Array;
  readonly max: number;
  readonly colors: Float32Array;
  readonly verts: Float32Array;
}

/** What a ribbon looks like. Callers keep one per ribbon and change its fields from frame to frame. */
export interface RibbonStyle {
  width0: number; width1: number;
  alpha0: number; alpha1: number;
  r: number; g: number; b: number;
}

export function makeStyle(width: number, r: number, g: number, b: number): RibbonStyle {
  return { width0: width, width1: width, alpha0: 1, alpha1: 1, r, g, b };
}

/** A strip of `max` points, three vertices across (edge, centre, edge) so its edges fade to nothing. */
export function createRibbon(max: number): Ribbon {
  const verts = new Float32Array(max * 9);
  const colors = new Float32Array(max * 12);
  const index = new Uint16Array((max - 1) * 12);
  for (let i = 0; i < max - 1; i++) {
    const a = i * 3;
    const b = a + 3;
    index.set([a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1], i * 12);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(verts, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 4));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.setDrawRange(0, 0);
  return { geometry, pts: new Float32Array(max * 3), max, colors, verts };
}

/** Builds the strip along the first `n` points, turned to face the camera at (cx, cy, cz). n < 2 hides it. */
export function fillRibbon(r: Ribbon, n: number, s: RibbonStyle, cx: number, cy: number, cz: number): void {
  const count = Math.min(n, r.max);
  r.geometry.setDrawRange(0, count < 2 ? 0 : (count - 1) * 12);
  if (count < 2) return;
  const p = r.pts;
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1) * 3;
    const b = Math.min(count - 1, i + 1) * 3;
    const px = p[i * 3] ?? 0; const py = p[i * 3 + 1] ?? 0; const pz = p[i * 3 + 2] ?? 0;
    const tx = (p[b] ?? 0) - (p[a] ?? 0); const ty = (p[b + 1] ?? 0) - (p[a + 1] ?? 0); const tz = (p[b + 2] ?? 0) - (p[a + 2] ?? 0);
    const vx = cx - px; const vy = cy - py; const vz = cz - pz;
    let sx = ty * vz - tz * vy; let sy = tz * vx - tx * vz; let sz = tx * vy - ty * vx;
    const len = Math.hypot(sx, sy, sz);
    if (len < 1e-6) { sx = 1; sy = 0; sz = 0; } else { sx /= len; sy /= len; sz /= len; }
    const f = i / (count - 1);
    const w = (s.width0 + (s.width1 - s.width0) * f) * 0.5;
    const al = s.alpha0 + (s.alpha1 - s.alpha0) * f;
    const v = i * 9;
    for (let side = -1; side <= 1; side++) {
      const o = v + (side + 1) * 3;
      r.verts[o] = px + sx * w * side; r.verts[o + 1] = py + sy * w * side; r.verts[o + 2] = pz + sz * w * side;
      const c = i * 12 + (side + 1) * 4;
      r.colors[c] = s.r; r.colors[c + 1] = s.g; r.colors[c + 2] = s.b;
      r.colors[c + 3] = side === 0 ? al : 0;
    }
  }
  r.geometry.attributes.position.needsUpdate = true;
  r.geometry.attributes.color.needsUpdate = true;
}

// ---- a fresnel shell --------------------------------------------------------------------------------------------

/** Additive glow that is brightest at a sphere's rim: used for domes and shock shells. uAlpha drives it. */
export function createRimMaterial(r: number, g: number, b: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: [r, g, b] }, uAlpha: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec3 vN; varying vec3 vV;
      void main() { float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4); gl_FragColor = vec4(uColor * (0.5 + 1.6 * rim), uAlpha * (0.1 + rim)); }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  });
}

export function setRimAlpha(m: ShaderMaterial, alpha: number): void {
  const u = m.uniforms.uAlpha;
  if (u) u.value = alpha;
}

export const GLOW_PROPS = { transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false } as const;
