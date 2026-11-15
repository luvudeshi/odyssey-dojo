// Apollo, the sun burst: a small sun ignites above the arena and swells, rays sweep out from it, then a beam of
// light pours down onto the weak spot and flares there while embers rise. Everything is additive and pushed past
// white so the scene's bloom pass lights it up; the warm tint and the light on the cave are PowerStrike's.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, Object3D } from "three";
import type { Group, InstancedMesh, Mesh, MeshBasicMaterial, Points, Sprite } from "three";
import { battle, calmMotion, nowSeconds } from "../../battle";
import { GLOW_PROPS, createParticles, createRibbon, emitBurst, fillRibbon, glowTexture, makeAnchors, makeStyle, readAnchors, ringTexture, setGlow, stepParticles, syncPoints } from "./powerKit";
import { POWER_SPAN, clamp01, easeIn, easeOut, makeClock, readClock, smooth } from "./powerTiming";

const RAYS = 18;
const BEAM = 14;
const dummy = new Object3D();
const tint = new Color();
/** Where the beam starts pouring: it leaves the sun a little after the rays have swept out. */
const POUR_FROM = 0.42;

export function ApolloStrike() {
  const group = useRef<Group>(null);
  const core = useRef<Sprite>(null);
  const halo = useRef<Sprite>(null);
  const corona = useRef<Mesh>(null);
  const coronaMat = useRef<MeshBasicMaterial>(null);
  const rays = useRef<InstancedMesh>(null);
  const flare = useRef<Sprite>(null);
  const bloom = useRef<Sprite>(null);
  const ring = useRef<Mesh>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const floor = useRef<Mesh>(null);
  const floorMat = useRef<MeshBasicMaterial>(null);
  const points = useRef<Points>(null);
  const k = useMemo(() => ({
    clock: makeClock(), a: makeAnchors(), pool: createParticles(130, -1.3, 0.7), wide: createRibbon(BEAM), hot: createRibbon(BEAM),
    wideStyle: makeStyle(1, 1.5, 0.75, 0.2), hotStyle: makeStyle(0.25, 2.6, 2.3, 1.7),
  }), []);
  const live = useRef({ seenHit: -Infinity, sparking: false });

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = nowSeconds();
    const c = readClock(k.clock, battle.powerGod, battle.powerAt, now);
    const on = c.god === "apollo" && c.phase !== "idle" && !calmMotion();
    const g = group.current;
    if (g && g.visible !== on) g.visible = on;
    const s = live.current;
    syncPoints(points.current, stepParticles(k.pool, dt), s);
    if (!on) return;
    const a = readAnchors(k.a);
    const span = POWER_SPAN.apollo;
    const sx = a.tx * 0.5 + a.hx * 0.5 + 0.2; const sy = 4.5; const sz = (a.hz + a.tz) / 2 - 1.4;
    const out = 1 - smooth((c.t - (span.total - 0.55)) / 0.55);
    const ignite = easeOut(c.t / 0.5) * (1 + 0.14 * Math.sin(Math.min(1, c.t / 0.5) * Math.PI));
    const pulse = 1 + 0.07 * Math.sin(c.t * 24);
    setGlow(core.current, sx, sy, sz, (0.15 + 1.5 * ignite) * pulse, 3 * out * Math.min(1, c.t * 8), 1, 0.92, 0.65);
    setGlow(halo.current, sx, sy, sz, (1 + 6 * ignite) * pulse, 0.8 * out, 1, 0.55, 0.15);
    const cr = corona.current; const cm = coronaMat.current;
    if (cr && cm) {
      cr.visible = out > 0.01 && c.t > 0.05;
      cr.position.set(sx, sy, sz);
      cr.scale.setScalar((0.5 + 2.2 * ignite) / 0.8);
      cr.rotation.z = c.t * 0.6;
      cm.opacity = 0.8 * out;
    }

    // Rays sweep out from the sun, turning slowly.
    const rs = rays.current;
    if (rs) {
      const sweep = easeOut((c.t - 0.22) / 0.4);
      for (let i = 0; i < RAYS; i++) {
        const ang = (i / RAYS) * Math.PI * 2 + c.t * 0.5;
        const len = (2.2 + (i % 3) * 1.1) * sweep + 0.001;
        const dim = out * sweep * (i % 2 === 0 ? 1 : 0.6);
        dummy.position.set(sx + Math.cos(ang) * (0.25 + len * 0.5), sy + Math.sin(ang) * (0.25 + len * 0.5), sz);
        dummy.rotation.set(0, 0, ang - Math.PI / 2);
        dummy.scale.set(0.2 * dim + 0.001, len * dim + 0.001, 1);
        dummy.updateMatrix();
        rs.setMatrixAt(i, dummy.matrix);
        rs.setColorAt(i, tint.setRGB(1.4 * dim, 0.8 * dim, 0.25 * dim));
      }
      rs.instanceMatrix.needsUpdate = true;
      if (rs.instanceColor) rs.instanceColor.needsUpdate = true;
    }

    // The beam pours from the sun to the weak spot, holds, then thins out.
    const pour = easeIn(clamp01((c.t - POUR_FROM) / (span.hit - POUR_FROM)));
    const hold = c.t >= span.hit ? 1 - smooth((c.t - span.hit - 0.3) / (span.total - span.hit - 0.3)) : 1;
    if (pour > 0.001) {
      const wob = 1 + 0.12 * Math.sin(c.t * 40);
      for (let i = 0; i < BEAM; i++) {
        const f = (i / (BEAM - 1)) * pour;
        k.wide.pts[i * 3] = sx + (a.tx - sx) * f; k.wide.pts[i * 3 + 1] = sy + (a.ty - sy) * f; k.wide.pts[i * 3 + 2] = sz + (a.tz - sz) * f;
      }
      k.hot.pts.set(k.wide.pts);
      k.wideStyle.width0 = 0.8; k.wideStyle.width1 = (1.8 + 0.8 * pour) * wob * (0.4 + 0.6 * hold);
      k.hotStyle.width0 = 0.2; k.hotStyle.width1 = 0.5 * wob * (0.3 + 0.7 * hold);
      k.wideStyle.alpha0 = 0.7 * hold; k.wideStyle.alpha1 = 1 * hold;
      k.hotStyle.alpha0 = hold; k.hotStyle.alpha1 = hold;
      fillRibbon(k.wide, BEAM, k.wideStyle, camera.position.x, camera.position.y, camera.position.z);
      fillRibbon(k.hot, BEAM, k.hotStyle, camera.position.x, camera.position.y, camera.position.z);
    } else {
      k.wide.geometry.setDrawRange(0, 0);
      k.hot.geometry.setDrawRange(0, 0);
    }

    // The flare where it lands, and the embers it throws up.
    const since = c.t - span.hit;
    const hitOn = since >= 0;
    if (hitOn && s.seenHit !== battle.powerAt) {
      s.seenHit = battle.powerAt;
      emitBurst(k.pool, { x: a.tx, y: a.ty, z: a.tz, count: 90, speed: 5, r: 1.8, g: 1.0, b: 0.3, life: 1.3, by: 1, bias: 0.3 });
    }
    if (hitOn && since < 0.9) emitBurst(k.pool, { x: a.tx + (Math.random() - 0.5), y: a.ty - 0.4, z: a.tz, count: 2, speed: 2.2, r: 1.6, g: 0.8, b: 0.2, life: 1.2, by: 1, bias: 0.6 });
    const tt = Math.max(0, since);
    const glow = hitOn ? hold * (0.7 + 0.3 * Math.sin(c.t * 18)) : 0;
    setGlow(flare.current, a.tx, a.ty, a.tz, 2.2 + 5 * easeOut(tt / 0.35), (hitOn ? 2.2 * (1 - clamp01(tt / 0.5)) ** 1.2 : 0) + 0.8 * glow, 1, 0.75, 0.35);
    setGlow(bloom.current, a.tx, a.ty, a.tz, 8 + 4 * easeOut(tt / 0.6), 0.5 * glow, 1, 0.5, 0.1);
    const rg = ring.current; const rm = ringMat.current;
    if (rg && rm) {
      rg.visible = hitOn && tt < 0.8;
      const rr = 0.4 + 3.6 * easeOut(tt / 0.7);
      rg.position.set(a.tx, 0.05, a.tz);
      rg.scale.set(rr / 0.8, rr / 0.8, 1);
      rm.opacity = 1.3 * (1 - clamp01(tt / 0.8));
    }
    const fl = floor.current; const fm = floorMat.current;
    if (fl && fm) {
      fl.visible = hitOn && glow > 0.01;
      fl.position.set(a.tx, 0.04, a.tz);
      fl.scale.set(4.5, 4.5, 1);
      fm.opacity = 0.7 * glow;
    }
  });

  return (
    <group ref={group} visible={false}>
      <sprite ref={halo} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <mesh ref={corona} visible={false}>
        <planeGeometry args={[2, 2]} /><meshBasicMaterial ref={coronaMat} map={ringTexture()} color="#ffb347" {...GLOW_PROPS} />
      </mesh>
      <instancedMesh ref={rays} args={[undefined, undefined, RAYS]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={glowTexture()} color="#ffffff" {...GLOW_PROPS} />
      </instancedMesh>
      {[k.wide, k.hot].map((r, i) => (
        <mesh key={i} geometry={r.geometry} frustumCulled={false}>
          <meshBasicMaterial vertexColors transparent depthWrite={false} blending={AdditiveBlending} fog={false} side={DoubleSide} />
        </mesh>
      ))}
      <sprite ref={core} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <mesh ref={floor} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[1, 1]} /><meshBasicMaterial ref={floorMat} map={glowTexture()} color="#ff9a3c" {...GLOW_PROPS} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[2, 2]} /><meshBasicMaterial ref={ringMat} map={ringTexture()} color="#ffd27a" {...GLOW_PROPS} />
      </mesh>
      <sprite ref={bloom} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <sprite ref={flare} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[k.pool.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[k.pool.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.15} map={glowTexture()} sizeAttenuation vertexColors {...GLOW_PROPS} />
      </points>
    </group>
  );
}
