// Athena, the aegis push: a great round shield of light (the look of GuardShield, larger) forms in front of the hero,
// is hurled at the monster with a trail of fading copies, and on the hit breaks into a gold dome, a floor ring and a
// facing ring of shockwave with sparks.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { Group, Mesh, MeshBasicMaterial, Points, Sprite } from "three";
import { battle, calmMotion, nowSeconds } from "../../battle";
import { GLOW_PROPS, createParticles, createRimMaterial, emitBurst, glowTexture, makeAnchors, readAnchors, ringTexture, setGlow, setRimAlpha, stepParticles, syncPoints } from "./powerKit";
import { POWER_SPAN, easeIn, easeOut, makeClock, readClock, smooth } from "./powerTiming";

const RADIUS = 0.62;
const GOLD = "#e0a83c";
const PALE = "#ffe9a8";
const SHIELD_Y = 1.3;

interface ShieldRefs { group: RefObject<Group | null>; face: RefObject<MeshBasicMaterial | null>; rim: RefObject<MeshBasicMaterial | null>; spokes: RefObject<MeshBasicMaterial | null>; boss: RefObject<MeshBasicMaterial | null>; spin: RefObject<Mesh | null> }

function useShield(): ShieldRefs {
  return { group: useRef<Group>(null), face: useRef<MeshBasicMaterial>(null), rim: useRef<MeshBasicMaterial>(null), spokes: useRef<MeshBasicMaterial>(null), boss: useRef<MeshBasicMaterial>(null), spin: useRef<Mesh>(null) };
}

function Shield({ s }: { s: ShieldRefs }) {
  return (
    <group ref={s.group} visible={false}>
      <mesh><circleGeometry args={[RADIUS, 40]} /><meshBasicMaterial ref={s.face} color={GOLD} {...GLOW_PROPS} opacity={0.3} /></mesh>
      <mesh position={[0, 0, 0.01]}><planeGeometry args={[RADIUS * 3.4, RADIUS * 3.4]} /><meshBasicMaterial map={glowTexture()} color={GOLD} {...GLOW_PROPS} opacity={0.28} /></mesh>
      <mesh><ringGeometry args={[RADIUS * 0.9, RADIUS, 56]} /><meshBasicMaterial ref={s.rim} color={PALE} {...GLOW_PROPS} /></mesh>
      <mesh ref={s.spin}><ringGeometry args={[RADIUS * 0.5, RADIUS * 0.6, 8]} /><meshBasicMaterial ref={s.spokes} color={GOLD} {...GLOW_PROPS} /></mesh>
      <mesh><circleGeometry args={[RADIUS * 0.18, 20]} /><meshBasicMaterial ref={s.boss} color={PALE} {...GLOW_PROPS} /></mesh>
    </group>
  );
}

function poseShield(s: ShieldRefs, x: number, y: number, z: number, scale: number, alphaIn: number, spin: number): void {
  const g = s.group.current;
  if (!g) return;
  let alpha = alphaIn;
  g.visible = alpha > 0.01 && scale > 0.01;
  if (!g.visible) return;
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  // A big shield is spread thin: dim it so it stays a shield of light and not a white disc.
  const dim = 1 / (1 + 0.7 * Math.max(0, scale - 1.4));
  alpha *= dim;
  if (s.face.current) s.face.current.opacity = 0.35 * alpha;
  if (s.rim.current) s.rim.current.opacity = 1.4 * alpha;
  if (s.spokes.current) s.spokes.current.opacity = 0.7 * alpha;
  if (s.boss.current) s.boss.current.opacity = 1.1 * alpha;
  if (s.spin.current) s.spin.current.rotation.z = spin;
}

export function AthenaStrike() {
  const group = useRef<Group>(null);
  const main = useShield();
  const ghostA = useShield();
  const ghostB = useShield();
  const dome = useRef<Mesh>(null);
  const dome2 = useRef<Mesh>(null);
  const flat = useRef<Mesh>(null);
  const flatMat = useRef<MeshBasicMaterial>(null);
  const facing = useRef<Mesh>(null);
  const facingMat = useRef<MeshBasicMaterial>(null);
  const flash = useRef<Sprite>(null);
  const points = useRef<Points>(null);
  const k = useMemo(() => ({
    clock: makeClock(), a: makeAnchors(), pool: createParticles(150, 4.5, 1.0), rimA: createRimMaterial(1, 0.78, 0.3), rimB: createRimMaterial(1, 0.95, 0.65),
  }), []);
  const live = useRef({ seenHit: -Infinity, seenForm: -Infinity, sparking: false });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const c = readClock(k.clock, battle.powerGod, battle.powerAt, nowSeconds());
    const on = c.god === "athena" && c.phase !== "idle" && !calmMotion();
    const g = group.current;
    if (g && g.visible !== on) g.visible = on;
    const s = live.current;
    syncPoints(points.current, stepParticles(k.pool, dt), s);
    if (!on) return;
    const a = readAnchors(k.a);
    const hit = POWER_SPAN.athena.hit;
    const homeZ = a.hz - 0.85;
    const farZ = a.tz + 0.9;
    const at = (strike: number): number => easeIn(strike);
    // Forms with a little overshoot, then flies.
    const form = smooth(c.wind) * (1 + 0.16 * Math.sin(c.wind * Math.PI));
    const fly = at(c.strike);
    const size = c.phase === "aftermath" ? 2.5 + 0.8 * easeOut(c.after * 4) : (1.35 + 1.15 * fly) * form;
    const fade = c.phase === "aftermath" ? Math.max(0, 1 - c.after * 7) : 1;
    const spin = c.t * 2.2;
    const x = a.hx + (a.tx - a.hx) * fly;
    const y = SHIELD_Y + (a.ty - SHIELD_Y) * fly;
    const z = homeZ + (farZ - homeZ) * fly;
    poseShield(main, x, y, z, size, fade * (0.5 + 0.5 * form), spin);
    for (const [ghost, lag, dim] of [[ghostA, 0.11, 0.5], [ghostB, 0.22, 0.28]] as const) {
      const p = c.phase === "aftermath" ? 0 : at(Math.max(0, c.strike - lag));
      const show = c.phase === "strike" && c.strike > lag ? fade * dim : 0;
      poseShield(ghost, a.hx + (a.tx - a.hx) * p, SHIELD_Y + (a.ty - SHIELD_Y) * p, homeZ + (farZ - homeZ) * p, (1.35 + 1.15 * p) * 0.96, show, spin - 0.3);
    }

    // Gold dust: a flare as it forms, a stream behind it in flight, a burst on the hit.
    if (c.t >= 0.29 && s.seenForm !== battle.powerAt) {
      s.seenForm = battle.powerAt;
      emitBurst(k.pool, { x: a.hx, y: SHIELD_Y, z: homeZ, count: 26, speed: 2.4, r: 1.6, g: 1.2, b: 0.5, life: 0.6 });
    }
    if (c.phase === "strike" && c.strike > 0.05) {
      emitBurst(k.pool, { x, y: y + (Math.random() - 0.5) * 1.2, z: z + 0.2, count: 3, speed: 1.2, r: 1.5, g: 1.1, b: 0.45, life: 0.45, bz: 1, bias: 0.6 });
    }
    if (c.t >= hit && s.seenHit !== battle.powerAt) {
      s.seenHit = battle.powerAt;
      emitBurst(k.pool, { x: a.tx, y: a.ty, z: a.tz, count: 100, speed: 6.5, r: 1.8, g: 1.4, b: 0.6, life: 0.9 });
    }

    // The break: two nested domes, a ring on the floor and a ring facing the camera.
    const since = c.t - hit;
    const tt = Math.max(0, since);
    const hitOn = since >= 0;
    const d1 = dome.current; const d2 = dome2.current;
    if (d1) {
      d1.visible = hitOn && tt < 0.75;
      d1.position.set(a.tx, a.ty, a.tz);
      d1.scale.setScalar(0.4 + 3.0 * easeOut(tt / 0.55));
      setRimAlpha(k.rimA, (1 - Math.min(1, tt / 0.75)) ** 1.5);
    }
    if (d2) {
      d2.visible = hitOn && tt < 0.6;
      d2.position.set(a.tx, a.ty, a.tz);
      d2.scale.setScalar(0.25 + 1.9 * easeOut(tt / 0.4));
      setRimAlpha(k.rimB, 1.3 * (1 - Math.min(1, tt / 0.6)) ** 1.5);
    }
    const fl = flat.current; const fm = flatMat.current;
    if (fl && fm) {
      fl.visible = hitOn && tt < 0.8;
      const r = 0.5 + 4 * easeOut(tt / 0.7);
      fl.position.set(a.tx, 0.05, a.tz);
      fl.scale.set(r / 0.8, r / 0.8, 1);
      fm.opacity = 1.2 * (1 - Math.min(1, tt / 0.8));
    }
    const fc = facing.current; const fcm = facingMat.current;
    if (fc && fcm) {
      fc.visible = hitOn && tt < 0.5;
      const r = 0.6 + 3.2 * easeOut(tt / 0.4);
      fc.position.set(a.tx, a.ty, a.tz + 0.4);
      fc.scale.set(r / 0.8, r / 0.8, 1);
      fcm.opacity = 1.5 * (1 - Math.min(1, tt / 0.5)) ** 1.2;
    }
    setGlow(flash.current, a.tx, a.ty, a.tz, 2 + 7 * easeOut(tt / 0.3), hitOn ? 2 * (1 - Math.min(1, tt / 0.4)) ** 1.5 : 0, 1, 0.82, 0.4);
  });

  return (
    <group ref={group} visible={false}>
      <Shield s={ghostB} />
      <Shield s={ghostA} />
      <Shield s={main} />
      <mesh ref={dome} material={k.rimA} visible={false}><sphereGeometry args={[1, 28, 16]} /></mesh>
      <mesh ref={dome2} material={k.rimB} visible={false}><sphereGeometry args={[1, 24, 14]} /></mesh>
      <mesh ref={flat} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial ref={flatMat} map={ringTexture()} color="#ffd27a" {...GLOW_PROPS} />
      </mesh>
      <mesh ref={facing} visible={false}>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial ref={facingMat} map={ringTexture()} color="#fff0c0" {...GLOW_PROPS} />
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
