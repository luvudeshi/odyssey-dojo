// Artemis, the moon arrow: a crescent moon swells in the dark behind the hero, a silver arrow of light is drawn and
// loosed along a shallow arc with a long tapering trail, and on the weak spot it bursts into a ring of pale shards
// with a facing ring of light and a spray of silver sparks.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, Object3D, Shape, ShapeGeometry } from "three";
import type { Group, InstancedMesh, Mesh, MeshBasicMaterial, Points, Sprite } from "three";
import { battle, calmMotion, nowSeconds } from "../../battle";
import type { Anchors } from "./powerKit";
import { GLOW_PROPS, createParticles, createRibbon, emitBurst, fillRibbon, glowTexture, makeAnchors, makeStyle, readAnchors, ringTexture, setGlow, stepParticles, syncPoints } from "./powerKit";
import { POWER_SPAN, clamp01, easeIn, easeOut, makeClock, readClock, smooth } from "./powerTiming";

const TRAIL = 22;
const SHARDS = 20;
const dummy = new Object3D();
const tint = new Color();

/** A crescent: the outer unit circle with a smaller one bitten out of its right side. */
function crescent(): ShapeGeometry {
  const d = 0.42; const r = 0.8;
  const x = (1 - r * r + d * d) / (2 * d);
  const y = Math.sqrt(1 - x * x);
  const alpha = Math.atan2(y, x);
  const beta = Math.atan2(y, x - d);
  const shape = new Shape();
  shape.absarc(0, 0, 1, alpha, Math.PI * 2 - alpha, false);
  shape.absarc(d, 0, r, Math.PI * 2 - beta, beta, true);
  return new ShapeGeometry(shape, 48);
}

/** A point `p` (0..1) along the arrow's shallow arc from the hero's hand to the weak spot. */
function arrowAt(a: Anchors, hx: number, hy: number, hz: number, p: number, out: Float32Array, o: number): void {
  out[o] = hx + (a.tx - hx) * p;
  out[o + 1] = hy + (a.ty - hy) * p + 0.7 * Math.sin(Math.PI * p);
  out[o + 2] = hz + (a.tz - hz) * p;
}

export function ArtemisStrike() {
  const group = useRef<Group>(null);
  const moon = useRef<Group>(null);
  const moonMat = useRef<MeshBasicMaterial>(null);
  const moonHalo = useRef<MeshBasicMaterial>(null);
  const moonGlow = useRef<Sprite>(null);
  const nock = useRef<Sprite>(null);
  const head = useRef<Sprite>(null);
  const flash = useRef<Sprite>(null);
  const shards = useRef<InstancedMesh>(null);
  const ring = useRef<Mesh>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const flat = useRef<Mesh>(null);
  const flatMat = useRef<MeshBasicMaterial>(null);
  const points = useRef<Points>(null);
  const k = useMemo(() => ({
    clock: makeClock(), a: makeAnchors(), pool: createParticles(110, 3, 1.3), moonShape: crescent(),
    glow: createRibbon(TRAIL), core: createRibbon(TRAIL), glowStyle: makeStyle(0.7, 0.6, 0.8, 1.6), coreStyle: makeStyle(0.14, 2.2, 2.4, 2.8),
  }), []);
  const live = useRef({ seenHit: -Infinity, sparking: false });

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.05);
    const c = readClock(k.clock, battle.powerGod, battle.powerAt, nowSeconds());
    const on = c.god === "artemis" && c.phase !== "idle" && !calmMotion();
    const g = group.current;
    if (g && g.visible !== on) g.visible = on;
    const s = live.current;
    syncPoints(points.current, stepParticles(k.pool, dt), s);
    if (!on) return;
    const a = readAnchors(k.a);
    const span = POWER_SPAN.artemis;

    // The moon holds from the wind-up to the end, easing in and out.
    const mg = moon.current;
    const moonLevel = smooth(c.t / 0.3) * (1 - smooth((c.t - (span.total - 0.45)) / 0.45));
    if (mg) {
      mg.visible = moonLevel > 0.01;
      mg.position.set(a.hx - 1.6, 3.9, (a.hz + a.tz) / 2 - 1);
      mg.rotation.z = 0.5 + 0.05 * c.t;
      mg.scale.setScalar(0.3 + 0.85 * easeOut(c.wind) + 0.05 * c.t);
    }
    if (moonMat.current) moonMat.current.opacity = 1.3 * moonLevel;
    if (moonHalo.current) moonHalo.current.opacity = 0.35 * moonLevel;
    setGlow(moonGlow.current, a.hx - 1.6, 3.9, (a.hz + a.tz) / 2 - 1.1, 6.5 * (0.6 + 0.4 * c.wind), 0.55 * moonLevel, 0.55, 0.7, 1);

    // The arrow: nocked in the wind-up (a short bright shaft at his hand), loosed along an arc.
    const hx = a.hx + 0.3; const hy = 1.5; const hz = a.hz - 0.5;
    const flight = easeIn(c.strike) ** 1.15;
    const flying = c.phase === "strike";
    const pts = k.glow.pts;
    let n = 0;
    if (c.phase === "windup") {
      n = TRAIL;
      const reach = 0.9 * easeOut(c.wind);
      const dx = a.tx - hx; const dy = a.ty - hy; const dz = a.tz - hz;
      const len = Math.hypot(dx, dy, dz) || 1;
      for (let i = 0; i < TRAIL; i++) {
        const f = (i / (TRAIL - 1)) * reach;
        pts[i * 3] = hx + (dx / len) * f; pts[i * 3 + 1] = hy + (dy / len) * f; pts[i * 3 + 2] = hz + (dz / len) * f;
      }
      k.glowStyle.alpha0 = 0; k.glowStyle.alpha1 = 0.8 * c.wind; k.coreStyle.alpha0 = 0; k.coreStyle.alpha1 = c.wind;
      k.glowStyle.width0 = 0.05; k.glowStyle.width1 = 0.2; k.coreStyle.width0 = 0.02; k.coreStyle.width1 = 0.06;
    } else if (flying) {
      n = TRAIL;
      for (let i = 0; i < TRAIL; i++) arrowAt(a, hx, hy, hz, Math.max(0, flight - (1 - i / (TRAIL - 1)) * 0.62 * (0.35 + 0.65 * flight)), pts, i * 3);
      k.glowStyle.alpha0 = 0; k.glowStyle.alpha1 = 0.9; k.coreStyle.alpha0 = 0; k.coreStyle.alpha1 = 1;
      k.glowStyle.width0 = 0.04; k.glowStyle.width1 = 0.85; k.coreStyle.width0 = 0.02; k.coreStyle.width1 = 0.17;
    }
    if (n > 0) {
      k.core.pts.set(pts);
      fillRibbon(k.glow, n, k.glowStyle, camera.position.x, camera.position.y, camera.position.z);
      fillRibbon(k.core, n, k.coreStyle, camera.position.x, camera.position.y, camera.position.z);
    } else {
      k.glow.geometry.setDrawRange(0, 0);
      k.core.geometry.setDrawRange(0, 0);
    }
    setGlow(nock.current, hx, hy, hz, 0.4 + 1.4 * c.wind, c.phase === "windup" ? 1.1 * c.wind : 0, 0.8, 0.9, 1);
    if (flying) {
      arrowAt(a, hx, hy, hz, flight, pts, 0);
      setGlow(head.current, pts[0] ?? 0, pts[1] ?? 0, pts[2] ?? 0, 0.9 + 0.5 * flight, 2, 0.85, 0.92, 1);
    } else setGlow(head.current, 0, 0, 0, 0, 0, 1, 1, 1);

    // The burst of pale shards.
    if (c.t >= span.hit && s.seenHit !== battle.powerAt) {
      s.seenHit = battle.powerAt;
      emitBurst(k.pool, { x: a.tx, y: a.ty, z: a.tz, count: 80, speed: 5.2, r: 1.6, g: 1.8, b: 2.2, life: 1.0 });
    }
    const since = c.t - span.hit;
    const tt = Math.max(0, since);
    const hitOn = since >= 0;
    const sh = shards.current;
    if (sh) {
      const r = 0.25 + 2.2 * easeOut(tt / 0.55);
      const dim = hitOn ? (1 - clamp01(tt / 0.6)) ** 1.2 : 0;
      for (let i = 0; i < SHARDS; i++) {
        const ang = (i / SHARDS) * Math.PI * 2 + (i % 2) * 0.08;
        const reach = r * (i % 2 === 0 ? 1 : 0.72);
        dummy.position.set(a.tx + Math.cos(ang) * reach, a.ty + Math.sin(ang) * reach, a.tz + 0.3);
        dummy.rotation.set(0, 0, ang - Math.PI / 2);
        dummy.scale.set(0.09 * dim + 0.001, (0.25 + 0.5 * (1 - clamp01(tt / 0.5))) * (i % 2 === 0 ? 1.2 : 0.8) * dim + 0.001, 1);
        dummy.updateMatrix();
        sh.setMatrixAt(i, dummy.matrix);
        sh.setColorAt(i, tint.setRGB(1.2 * dim, 1.4 * dim, 1.8 * dim));
      }
      sh.instanceMatrix.needsUpdate = true;
      if (sh.instanceColor) sh.instanceColor.needsUpdate = true;
    }
    const rg = ring.current; const rm = ringMat.current;
    if (rg && rm) {
      rg.visible = hitOn && tt < 0.6;
      const rr = 0.4 + 3 * easeOut(tt / 0.5);
      rg.position.set(a.tx, a.ty, a.tz + 0.35);
      rg.scale.set(rr / 0.8, rr / 0.8, 1);
      rm.opacity = 1.4 * (1 - clamp01(tt / 0.6)) ** 1.2;
    }
    const fl = flat.current; const fm = flatMat.current;
    if (fl && fm) {
      fl.visible = hitOn && tt < 0.7;
      const rr = 0.4 + 2.6 * easeOut(tt / 0.6);
      fl.position.set(a.tx, 0.05, a.tz);
      fl.scale.set(rr / 0.8, rr / 0.8, 1);
      fm.opacity = 1.1 * (1 - clamp01(tt / 0.7));
    }
    setGlow(flash.current, a.tx, a.ty, a.tz, 2 + 5 * easeOut(tt / 0.3), hitOn ? 2.1 * (1 - clamp01(tt / 0.4)) ** 1.5 : 0, 0.8, 0.9, 1);
  });

  return (
    <group ref={group} visible={false}>
      <group ref={moon}>
        <mesh geometry={k.moonShape} scale={1.12}><meshBasicMaterial ref={moonHalo} color="#9fb8ff" {...GLOW_PROPS} side={DoubleSide} opacity={0.3} /></mesh>
        <mesh geometry={k.moonShape}><meshBasicMaterial ref={moonMat} color="#e6eeff" {...GLOW_PROPS} side={DoubleSide} /></mesh>
      </group>
      <sprite ref={moonGlow} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      {[k.glow, k.core].map((r, i) => (
        <mesh key={i} geometry={r.geometry} frustumCulled={false}>
          <meshBasicMaterial vertexColors transparent depthWrite={false} blending={AdditiveBlending} fog={false} side={DoubleSide} />
        </mesh>
      ))}
      <sprite ref={nock} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <sprite ref={head} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <instancedMesh ref={shards} args={[undefined, undefined, SHARDS]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={glowTexture()} color="#ffffff" {...GLOW_PROPS} />
      </instancedMesh>
      <mesh ref={ring} visible={false}>
        <planeGeometry args={[2, 2]} /><meshBasicMaterial ref={ringMat} map={ringTexture()} color="#dce8ff" {...GLOW_PROPS} />
      </mesh>
      <mesh ref={flat} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[2, 2]} /><meshBasicMaterial ref={flatMat} map={ringTexture()} color="#b9ccff" {...GLOW_PROPS} />
      </mesh>
      <sprite ref={flash} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
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
