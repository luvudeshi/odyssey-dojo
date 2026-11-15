// Hermes, the swift dash: the hero turns into a streak. A line of fading afterimages zig-zags out to the weak spot
// behind a bright ribbon and horizontal speed lines, lands three quick hits there (a flash and a slash each), and
// dashes back. A gust ring opens on the floor at the start and at the hit.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, Object3D } from "three";
import type { Group, InstancedMesh, Mesh, MeshBasicMaterial, Points, Sprite } from "three";
import { battle, calmMotion, nowSeconds } from "../../battle";
import { GLOW_PROPS, createParticles, createRibbon, emitBurst, fillRibbon, glowTexture, makeAnchors, makeStyle, readAnchors, ringTexture, setGlow, stepParticles, syncPoints } from "./powerKit";
import { POWER_SPAN, WINDUP_S, clamp01, easeOut, makeClock, readClock, smooth } from "./powerTiming";

const IMAGES = 10;
const LINES = 16;
const TRAIL = 18;
const SLASHES = 3;
/** Seconds the hero spends on the way out, holding on the monster, and coming back. */
const OUT = POWER_SPAN.hermes.hit - WINDUP_S;
const HOLD = 0.2;
const BACK = 0.3;
const PATH = new Float32Array(15);
const dummy = new Object3D();
const tint = new Color();

/** Fills PATH with the zig-zag from the hero to the weak spot. */
function buildPath(hx: number, hz: number, tx: number, ty: number, tz: number): void {
  const dz = tz - hz;
  PATH.set([hx, 1.0, hz,
    hx + 1.7, 1.25, hz + dz * 0.25,
    hx - 1.5, 1.7, hz + dz * 0.5,
    tx + 1.1, ty - 0.2, hz + dz * 0.78,
    tx, ty, tz]);
}

function pathAt(p: number, out: Float32Array, o: number): void {
  const f = clamp01(p) * 4;
  const i = Math.min(3, Math.floor(f));
  const r = f - i;
  for (let a = 0; a < 3; a++) out[o + a] = (PATH[i * 3 + a] ?? 0) + ((PATH[i * 3 + 3 + a] ?? 0) - (PATH[i * 3 + a] ?? 0)) * r;
}

/** How far along the path the hero's streak is at `t`: 0 home, 1 on the monster. */
function headAt(t: number): number {
  const out = (t - WINDUP_S) / OUT;
  if (out < 1) return smooth(clamp01(out)) ** 0.85;
  const back = (t - POWER_SPAN.hermes.hit - HOLD) / BACK;
  return back <= 0 ? 1 : 1 - smooth(clamp01(back));
}

export function HermesStrike() {
  const group = useRef<Group>(null);
  const images = useRef<InstancedMesh>(null);
  const lines = useRef<InstancedMesh>(null);
  const flash = useRef<Sprite>(null);
  const launch = useRef<Sprite>(null);
  const gust = useRef<Mesh>(null);
  const gustMat = useRef<MeshBasicMaterial>(null);
  const gust2 = useRef<Mesh>(null);
  const gust2Mat = useRef<MeshBasicMaterial>(null);
  const slashes = useRef<(Mesh | null)[]>([]);
  const points = useRef<Points>(null);
  const k = useMemo(() => ({
    clock: makeClock(), a: makeAnchors(), pool: createParticles(120, 5, 1.4), trail: createRibbon(TRAIL), core: createRibbon(TRAIL),
    trailStyle: makeStyle(0.55, 0.3, 1.1, 0.7), coreStyle: makeStyle(0.14, 1.6, 2, 1.8),
    seeds: Float32Array.from({ length: LINES * 3 }, () => Math.random()),
  }), []);
  const live = useRef({ seenHit: -Infinity, seenGo: -Infinity, sparking: false, echo: 0 });

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.05);
    const c = readClock(k.clock, battle.powerGod, battle.powerAt, nowSeconds());
    const on = c.god === "hermes" && c.phase !== "idle" && !calmMotion();
    const g = group.current;
    if (g && g.visible !== on) g.visible = on;
    const s = live.current;
    syncPoints(points.current, stepParticles(k.pool, dt), s);
    if (!on) return;
    const a = readAnchors(k.a);
    buildPath(a.hx, a.hz, a.tx, a.ty, a.tz);
    const span = POWER_SPAN.hermes;
    const head = headAt(c.t);
    const moving = c.t > WINDUP_S && (c.t < span.hit + 0.02 || c.t > span.hit + HOLD) ? 1 : 0;

    // Afterimages: stretched, glowing bodies spaced back along the path from the head.
    const im = images.current;
    if (im) {
      const back = c.t > span.hit + HOLD;
      for (let i = 0; i < IMAGES; i++) {
        const lagP = i * 0.07;
        const p = back ? head + lagP : head - lagP;
        const alive = (back ? p <= 1 : p >= 0) && c.t > WINDUP_S ? 1 : 0;
        const fade = alive * (1 - i / IMAGES) ** 1.3 * clamp01((span.total - c.t) / 0.2) * (back || c.t < span.hit + 0.05 ? 1 : Math.max(0, 1 - (c.t - span.hit) / 0.1));
        pathAt(clamp01(p), k.trail.pts, 0);
        dummy.position.set(k.trail.pts[0] ?? 0, (k.trail.pts[1] ?? 0) - 0.3, k.trail.pts[2] ?? 0);
        dummy.rotation.set(0, 0, (i % 2 === 0 ? 1 : -1) * 0.18);
        dummy.scale.set(1.3, 2.4 + 0.8 * moving, 1).multiplyScalar(0.001 + fade);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        im.setColorAt(i, tint.setRGB(0.4 * fade, 1.0 * fade, 0.7 * fade));
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }

    // The bright ribbon behind the head.
    const tail = c.t > span.hit + HOLD ? Math.min(1, head + 0.5) : Math.max(0, head - 0.5);
    const showTrail = c.t > WINDUP_S + 0.02 && c.t < span.hit + HOLD + BACK + 0.05 && moving === 1;
    if (showTrail) {
      for (let i = 0; i < TRAIL; i++) pathAt(tail + (head - tail) * (i / (TRAIL - 1)), k.trail.pts, i * 3);
      k.core.pts.set(k.trail.pts);
      k.trailStyle.alpha1 = 0.9; k.trailStyle.alpha0 = 0;
      k.coreStyle.alpha1 = 1; k.coreStyle.alpha0 = 0;
      k.trailStyle.width0 = 0.05; k.trailStyle.width1 = 0.65;
      k.coreStyle.width0 = 0.02; k.coreStyle.width1 = 0.16;
      fillRibbon(k.trail, TRAIL, k.trailStyle, camera.position.x, camera.position.y, camera.position.z);
      fillRibbon(k.core, TRAIL, k.coreStyle, camera.position.x, camera.position.y, camera.position.z);
    } else {
      k.trail.geometry.setDrawRange(0, 0);
      k.core.geometry.setDrawRange(0, 0);
    }

    // Speed lines: long glowing dashes streaming sideways past the camera while he runs.
    const ln = lines.current;
    if (ln) {
      const env = moving * clamp01((span.total - c.t) / 0.2);
      for (let i = 0; i < LINES; i++) {
        const r0 = k.seeds[i * 3] ?? 0; const r1 = k.seeds[i * 3 + 1] ?? 0; const r2 = k.seeds[i * 3 + 2] ?? 0;
        const slide = ((c.t * (4 + 3 * r2) + r0 * 3) % 1);
        const dir = r1 > 0.5 ? 1 : -1;
        dummy.position.set(a.hx + dir * (-3 + slide * 6), 0.3 + r1 * 3.4, a.hz + (a.tz - a.hz) * (0.15 + 0.7 * r0));
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set((1.2 + 1.8 * r2) * env + 0.001, 0.05 * env + 0.001, 1);
        dummy.updateMatrix();
        ln.setMatrixAt(i, dummy.matrix);
      }
      ln.instanceMatrix.needsUpdate = true;
    }

    // The launch, then three hits on the weak spot.
    setGlow(launch.current, a.hx, 1.0, a.hz, 1.5 + 2.5 * easeOut((c.t - WINDUP_S) / 0.2), c.t > WINDUP_S - 0.05 && c.t < WINDUP_S + 0.25 ? 1.8 * (1 - clamp01((c.t - WINDUP_S) / 0.25)) : 0, 0.6, 1.2, 0.9);
    let pulse = 0; let hits = 0;
    for (let h = 0; h <= span.echoes.length; h++) {
      const at = span.hit + (h === 0 ? 0 : span.echoes[h - 1] ?? 0);
      const since = c.t - at;
      if (since >= 0) { hits = h + 1; pulse = Math.max(pulse, 1 - clamp01(since / 0.16)); }
      const sl = slashes.current[h];
      if (sl) {
        sl.visible = since >= 0 && since < 0.2;
        sl.position.set(a.tx + (h - 1) * 0.25, a.ty + (h === 1 ? -0.2 : 0.15), a.tz + 0.15);
        sl.rotation.z = (h * 2.1) + 0.6;
        const grow = easeOut(since / 0.08);
        sl.scale.set(0.01 + 2.6 * grow, 0.015 + 0.09 * (1 - clamp01(since / 0.2)), 1);
      }
    }
    if (hits > s.echo) {
      emitBurst(k.pool, { x: a.tx, y: a.ty, z: a.tz, count: 30, speed: 5.5, r: 0.9, g: 1.8, b: 1.3, life: 0.6 });
      s.echo = hits;
    }
    if (c.t < span.hit - 0.05) s.echo = 0;
    setGlow(flash.current, a.tx, a.ty, a.tz, 2.4 + 2.2 * pulse, 2 * pulse, 0.7, 1.2, 1);

    // Gust rings on the floor: at his feet as he leaves, and under the monster on the hit.
    const g1 = gust.current; const g1m = gustMat.current;
    const t1 = (c.t - WINDUP_S) / 0.4;
    if (g1 && g1m) {
      g1.visible = t1 > 0 && t1 < 1;
      g1.position.set(a.hx, 0.05, a.hz);
      g1.scale.setScalar((0.5 + 3 * easeOut(t1)) / 0.8);
      g1m.opacity = 1 - clamp01(t1);
    }
    const g2 = gust2.current; const g2m = gust2Mat.current;
    const t2 = (c.t - span.hit) / 0.5;
    if (g2 && g2m) {
      g2.visible = t2 > 0 && t2 < 1;
      g2.position.set(a.tx, 0.05, a.tz);
      g2.scale.setScalar((0.5 + 3 * easeOut(t2)) / 0.8);
      g2m.opacity = 1.2 * (1 - clamp01(t2));
    }
  });

  return (
    <group ref={group} visible={false}>
      <instancedMesh ref={images} args={[undefined, undefined, IMAGES]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={glowTexture()} color="#ffffff" {...GLOW_PROPS} opacity={0.75} />
      </instancedMesh>
      <instancedMesh ref={lines} args={[undefined, undefined, LINES]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={glowTexture()} color="#b8ffd9" {...GLOW_PROPS} opacity={0.75} />
      </instancedMesh>
      {[k.trail, k.core].map((r, i) => (
        <mesh key={i} geometry={r.geometry} frustumCulled={false}>
          <meshBasicMaterial vertexColors transparent depthWrite={false} blending={AdditiveBlending} fog={false} side={DoubleSide} />
        </mesh>
      ))}
      {Array.from({ length: SLASHES }, (_, i) => (
        <mesh key={i} ref={(m) => { slashes.current[i] = m; }} visible={false}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={glowTexture()} color="#eafff2" {...GLOW_PROPS} />
        </mesh>
      ))}
      <sprite ref={launch} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <sprite ref={flash} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <mesh ref={gust} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[2, 2]} /><meshBasicMaterial ref={gustMat} map={ringTexture()} color="#b8ffd9" {...GLOW_PROPS} />
      </mesh>
      <mesh ref={gust2} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[2, 2]} /><meshBasicMaterial ref={gust2Mat} map={ringTexture()} color="#eafff2" {...GLOW_PROPS} />
      </mesh>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[k.pool.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[k.pool.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.17} map={glowTexture()} sizeAttenuation vertexColors {...GLOW_PROPS} />
      </points>
    </group>
  );
}
