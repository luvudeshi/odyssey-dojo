// Zeus, the thunderbolt: a charge gathers in the dark sky (the screen tint is in powerLook), then a thick branching
// bolt drops onto the weak spot, re-jittered every few frames so it flickers, with a white-hot core inside a wide glow,
// a flash, a ground shock ring, a scorch and a spray of sparks. The point light and the shake are PowerStrike's.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, DoubleSide } from "three";
import type { Group, Mesh, MeshBasicMaterial, Points, Sprite } from "three";
import { battle, calmMotion, nowSeconds } from "../../battle";
import { GLOW_PROPS, createParticles, createRibbon, emitBurst, fillRibbon, glowTexture, makeAnchors, makeStyle, readAnchors, ringTexture, setGlow, stepParticles, syncPoints } from "./powerKit";
import { POWER_SPAN, easeOut, makeClock, readClock } from "./powerTiming";

const POINTS = 15;
const BRANCH_POINTS = 7;
const SKY = 5.2;
/** The bolt shows from just before the hit and flickers until it burns out. */
const LEAD = 0.05;
const BURN = 0.6;
const REJITTER = 0.045;

function jag(pts: Float32Array, from: number, n: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, amp: number): void {
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const wobble = Math.sin(Math.PI * f) ** 0.7 * amp;
    const o = (from + i) * 3;
    pts[o] = x0 + (x1 - x0) * f + (Math.random() - 0.5) * 2 * wobble;
    pts[o + 1] = y0 + (y1 - y0) * f;
    pts[o + 2] = z0 + (z1 - z0) * f + (Math.random() - 0.5) * wobble;
  }
}

export function ZeusStrike() {
  const group = useRef<Group>(null);
  const charge = useRef<Sprite>(null);
  const halo = useRef<Sprite>(null);
  const flash = useRef<Sprite>(null);
  const wide = useRef<Sprite>(null);
  const shock = useRef<Mesh>(null);
  const shockMat = useRef<MeshBasicMaterial>(null);
  const scorch = useRef<Mesh>(null);
  const scorchMat = useRef<MeshBasicMaterial>(null);
  const points = useRef<Points>(null);
  const k = useMemo(() => {
    const glow = createRibbon(POINTS);
    const core = createRibbon(POINTS);
    const branches = [createRibbon(BRANCH_POINTS), createRibbon(BRANCH_POINTS), createRibbon(BRANCH_POINTS)];
    return {
      clock: makeClock(), a: makeAnchors(), pool: createParticles(110, 9, 1.2), glow, core, branches, all: [glow, core, ...branches],
      glowStyle: makeStyle(0.9, 0.25, 0.45, 1), coreStyle: makeStyle(0.17, 1.8, 2, 2.4), branchStyle: makeStyle(0.1, 0.9, 1.2, 2),
    };
  }, []);
  const live = useRef({ seenHit: -Infinity, firedAt: -Infinity, nextJitter: 0, flicker: 1, sparking: false });

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.05);
    const c = readClock(k.clock, battle.powerGod, battle.powerAt, nowSeconds());
    const on = c.god === "zeus" && c.phase !== "idle" && !calmMotion();
    const g = group.current;
    if (g && g.visible !== on) g.visible = on;
    const s = live.current;
    syncPoints(points.current, stepParticles(k.pool, dt), s);
    if (!on) return;
    if (s.firedAt !== battle.powerAt) { s.firedAt = battle.powerAt; s.nextJitter = 0; }
    const a = readAnchors(k.a);
    const hit = POWER_SPAN.zeus.hit;
    const sx = a.tx + 0.7;
    const sz = a.tz - 1.2;
    // The charge in the sky.
    const wind = c.t < hit ? c.t / hit : 0;
    const gone = c.t >= hit ? Math.max(0, 1 - (c.t - hit) / 0.25) : 1;
    setGlow(charge.current, sx, SKY, sz, (0.4 + 3.2 * wind * wind) * (1 + 0.15 * Math.sin(c.t * 70)), 0.95 * gone * Math.min(1, wind * 3), 0.8, 0.9, 1);
    setGlow(halo.current, sx, SKY, sz, 4 + 9 * wind, 0.4 * gone * wind, 0.3, 0.45, 1);

    // The bolt itself: re-jittered every few frames.
    const since = c.t - hit;
    const bolt = since > -LEAD && since < BURN;
    if (!bolt) for (const r of k.all) r.geometry.setDrawRange(0, 0);
    if (bolt) {
      if (c.t >= s.nextJitter) {
        s.nextJitter = c.t + REJITTER;
        s.flicker = 0.62 + Math.random() * 0.38;
        jag(k.glow.pts, 0, POINTS, sx, SKY, sz, a.tx, a.ty, a.tz, 0.55);
        k.core.pts.set(k.glow.pts);
        for (let b = 0; b < 3; b++) {
          const from = 3 + b * 4;
          const dir = b === 1 ? -1 : 1;
          const o = from * 3;
          const x0 = k.glow.pts[o] ?? 0; const y0 = k.glow.pts[o + 1] ?? 0; const z0 = k.glow.pts[o + 2] ?? 0;
          const branch = k.branches[b];
          if (branch) jag(branch.pts, 0, BRANCH_POINTS, x0, y0, z0, x0 + dir * (0.9 + Math.random() * 0.9), y0 - 1.7, z0 + 0.3, 0.35);
        }
      }
      const burn = since < 0 ? 1 : 1 - (since / BURN) ** 1.6;
      // A second, fainter stroke rides the same path a beat after the first.
      const echo = 1 + 0.5 * Math.exp(-(((since - 0.2) / 0.05) ** 2));
      const power = s.flicker * burn * echo;
      k.glowStyle.alpha0 = k.glowStyle.alpha1 = 0.55 * power;
      k.coreStyle.alpha0 = k.coreStyle.alpha1 = Math.min(1, power * 1.2);
      k.coreStyle.width0 = k.coreStyle.width1 = 0.2 + 0.14 * burn;
      k.glowStyle.width0 = k.glowStyle.width1 = 1.2 + 1.2 * burn;
      k.branchStyle.alpha0 = k.branchStyle.alpha1 = 0.85 * power;
      const { x, y, z } = camera.position;
      fillRibbon(k.glow, POINTS, k.glowStyle, x, y, z);
      fillRibbon(k.core, POINTS, k.coreStyle, x, y, z);
      for (const r of k.branches) fillRibbon(r, BRANCH_POINTS, k.branchStyle, x, y, z);
    }

    // The hit: sparks once, then the flash, the shock ring on the floor and the scorch.
    if (c.t >= hit && s.seenHit !== battle.powerAt) {
      s.seenHit = battle.powerAt;
      emitBurst(k.pool, { x: a.tx, y: a.ty, z: a.tz, count: 70, speed: 7, r: 1.6, g: 1.8, b: 2.4, life: 0.9 });
      emitBurst(k.pool, { x: a.tx, y: 0.1, z: a.tz, count: 36, speed: 4.5, r: 1.4, g: 1.2, b: 0.8, life: 0.8, by: 1, bias: 0.4 });
    }
    const tt = Math.max(0, since);
    const pop = since >= 0 ? (1 - Math.min(1, tt / 0.4)) ** 1.5 : 0;
    setGlow(flash.current, a.tx, a.ty, a.tz, 1.5 + 7 * easeOut(tt / 0.3), 2.2 * pop, 0.9, 0.95, 1);
    setGlow(wide.current, a.tx, a.ty, a.tz, 11 * easeOut(tt / 0.8), 0.55 * (since >= 0 ? (1 - Math.min(1, tt / 0.8)) : 0), 0.3, 0.5, 1);
    const ring = scorch.current; const rm = scorchMat.current;
    const sh = shock.current; const sm = shockMat.current;
    if (sh && sm) {
      sh.visible = since >= 0 && tt < 0.55;
      const r = 0.4 + 2.8 * easeOut(tt / 0.5);
      sh.position.set(a.tx, 0.04, a.tz);
      sh.scale.set(r / 0.8, r / 0.8, 1);
      sm.opacity = 1.4 * (1 - Math.min(1, tt / 0.55)) ** 1.4;
    }
    if (ring && rm) {
      ring.visible = since >= 0;
      ring.position.set(a.tx, 0.03, a.tz);
      ring.scale.set(3.6, 3.6, 1);
      rm.opacity = 0.7 * (1 - c.after) ** 0.8;
    }
  });

  return (
    <group ref={group} visible={false}>
      {k.all.map((r, i) => (
        <mesh key={i} geometry={r.geometry} frustumCulled={false}>
          <meshBasicMaterial vertexColors transparent depthWrite={false} blending={AdditiveBlending} side={DoubleSide} fog={false} />
        </mesh>
      ))}
      <sprite ref={halo} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <sprite ref={charge} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <sprite ref={wide} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <sprite ref={flash} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <mesh ref={shock} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial ref={shockMat} map={ringTexture()} color="#bcd4ff" {...GLOW_PROPS} />
      </mesh>
      <mesh ref={scorch} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial ref={scorchMat} map={glowTexture()} color="#ff8a3a" {...GLOW_PROPS} />
      </mesh>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[k.pool.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[k.pool.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.22} map={glowTexture()} sizeAttenuation vertexColors {...GLOW_PROPS} />
      </points>
    </group>
  );
}
