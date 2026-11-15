// The effects round a dodge, for ?dodge=1..4 (dodgeMotion.ts moves the hero; this draws what he leaves behind):
//  1 after-images: two fading copies trail him, and a gold decoy stands where the blow lands and bursts.
//  2 dash: a streak along the floor and a low one at the hip, dust kicked up behind his feet, a puff where the blow lands.
//  3 roll: a gold crest trail and a crimson cloak trail follow the turn, dust where the blow lands.
//  4 Hermes: a tight blue-white blur of copies, speed lines, then a wind slash and a ring through the empty air he left,
//    with the camera pushing in (CameraRig reads dodge.push).
// Everything is soft (additive, on small generated textures), eased, and drawn from the store every frame.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, DoubleSide, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Mesh, Points, Texture } from "three";
import { battle, nowSeconds } from "../../battle";
import { HOME_Z } from "../../PlayerFigure";
import { burstFade, easeOut } from "../defendTiming";
import { createPool } from "../sparks";
import { makeSoftTextures } from "../softTextures";
import { bodyPoint, dodge } from "./dodgeMotion";
import { emitDust, stepDust } from "./dust";
import { Ribbon } from "./ribbon";
import { makeSilhouette } from "./silhouette";

const GOLD = 0xffd36b;
const COOL = 0xbfe8ff;
const GHOSTS = 5;
const LINES = 5;
const POINTS = 14;
const TINTS: Readonly<Record<number, readonly [number, number, number]>> = { 1: [1, 0.8, 0.35], 2: [0.62, 0.52, 0.42], 3: [0.85, 0.55, 0.4], 4: [0.8, 0.9, 1] };
const DELAYS_1 = [0.07, 0.14] as const;

function glow(map: Texture, color: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, fog: false, side: DoubleSide });
}

function put(mesh: Mesh | null | undefined, alpha: number): void {
  if (!mesh) return;
  mesh.visible = alpha > 0.003;
  if (mesh.visible && !Array.isArray(mesh.material)) (mesh.material as MeshBasicMaterial).opacity = alpha;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const tmp = { x: 0, tilt: 0 };
const pt = { x: 0, y: 0 };

export function DodgeFx() {
  const kit = useMemo(() => {
    const soft = makeSoftTextures();
    const sil = makeSilhouette();
    return {
      soft,
      plane: new PlaneGeometry(1, 1),
      ghost: Array.from({ length: GHOSTS }, () => glow(sil, GOLD)),
      decoy: glow(sil, GOLD),
      lines: Array.from({ length: LINES }, () => glow(soft.disc, 0xffffff)),
      slash: glow(soft.swoosh, 0xe6f6ff),
      cut: glow(soft.disc, 0xffffff),
      ring: glow(soft.ring, COOL),
      ribbons: [new Ribbon(POINTS), new Ribbon(POINTS)] as const,
      pool: createPool(64),
    };
  }, []);
  const ghost = useRef<(Mesh | null)[]>([]);
  const decoy = useRef<Mesh>(null);
  const lines = useRef<(Mesh | null)[]>([]);
  const slash = useRef<Mesh>(null);
  const cut = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const dust = useRef<Points>(null);
  const seen = useRef({ miss: -Infinity, out: -Infinity, carry: 0 });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = nowSeconds();
    const v = dodge.variant;
    const x = dodge.x + battle.reachX;
    const z = HOME_Z + battle.heroZ + battle.reachZ;
    const missed = dodge.missAt >= dodge.outAt;
    const since = missed ? now - dodge.missAt : -1;
    const dir = Math.abs(dodge.vx) > 0.3 ? Math.sign(dodge.vx) : dodge.dir;
    const speed = clamp01(Math.abs(dodge.vx) / 3);
    const tint = TINTS[v] ?? TINTS[1] ?? [1, 1, 1];

    // Afterimages: where he was a moment ago, faint, and only while they are apart from him.
    const copies = v === 1 ? DELAYS_1.length : v === 4 ? GHOSTS : 0;
    for (let i = 0; i < GHOSTS; i++) {
      const m = ghost.current[i];
      if (!m) continue;
      if (i >= copies) { put(m, 0); continue; }
      const ago = v === 1 ? DELAYS_1[i] ?? 0.1 : 0.032 * (i + 1);
      dodge.trail.at(now, ago, tmp);
      bodyPoint(tmp.x + battle.reachX, tmp.tilt, 0, 0.95, pt);
      m.position.set(pt.x, pt.y, z - 0.1 - i * 0.01);
      m.rotation.z = tmp.tilt;
      m.scale.set(v === 4 ? 0.95 : 0.95, 1.9, 1);
      (m.material as MeshBasicMaterial).color.setHex(v === 4 ? COOL : GOLD);
      const apart = clamp01(Math.abs(x - tmp.x - battle.reachX) / 0.3);
      put(m, (v === 4 ? 0.24 - 0.035 * i : 0.4 - 0.2 * i) * apart);
    }

    // Decoy (1): a gold copy left on his mark, which the blow lands on and which bursts when it does.
    const d = decoy.current;
    if (d) {
      const fade = missed ? 1 - clamp01(since / 0.35) : 1;
      d.position.set(0, 0.95, z - 0.14);
      d.scale.set(0.95, 1.9, 1);
      put(d, v === 1 ? 0.3 * clamp01(Math.abs(dodge.x) / 0.6) * fade : 0);
    }

    // Speed lines (4): thin horizontal streaks trailing him while he is fast.
    for (let i = 0; i < LINES; i++) {
      const m = lines.current[i];
      if (!m) continue;
      const len = 1.1 + 0.9 * speed + i * 0.15;
      m.position.set(x - dir * (0.55 + len / 2 + i * 0.12), 0.35 + i * 0.36, z + (i % 2 === 0 ? 0.06 : -0.08));
      m.scale.set(len, 0.035, 1);
      put(m, v === 4 ? speed * (0.55 + 0.08 * i) : 0);
    }

    // Wind slash (4): the blow passing through the empty air he left.
    const p = clamp01(since / 0.5);
    const on = v === 4 && since >= 0;
    const s = slash.current;
    if (s) {
      s.position.set(0, 1.3, z - 0.2);
      s.rotation.z = dodge.dir * 0.3;
      s.scale.set(dodge.dir * (1.4 + 2.6 * easeOut(p)), 0.5 + 1.0 * easeOut(p), 1);
      put(s, on ? burstFade(p) * 0.95 : 0);
    }
    const c = cut.current;
    if (c) {
      c.position.set(0, 1.25, z - 0.18);
      c.rotation.z = dodge.dir * 0.62;
      c.scale.set(0.8 + 3.6 * easeOut(p * 1.6), 0.07, 1);
      put(c, on ? burstFade(p) : 0);
    }
    const r = ring.current;
    if (r) {
      r.position.set(0, 1.2, z - 0.3);
      r.scale.setScalar(0.8 + 2.6 * easeOut(p));
      put(r, on ? burstFade(p) * 0.6 : 0);
    }

    // Trails: the floor streak and hip streak (2), the crest and cloak (3).
    const [ra, rb] = kit.ribbons;
    const trailing = (v === 2 || v === 3) && (Math.abs(dodge.x) + Math.abs(dodge.vx) * 0.2 > 0.05 || dodge.rolling);
    for (let j = 0; j < POINTS; j++) {
      const k = j / (POINTS - 1);
      const fade = (1 - k) ** 1.4;
      dodge.trail.at(now, j * (v === 3 ? 0.03 : 0.02), tmp);
      const tx = tmp.x + battle.reachX;
      if (v === 2) {
        ra.set(j, tx, 0.04, z, 0.08 * (1 - k) ** 0.7, true, 0.42 * fade, 0.46 * fade, 0.5 * fade);
        rb.set(j, tx, 0.55, z - 0.05, 0.03 * (1 - k), false, 0.25 * fade, 0.35 * fade, 0.55 * fade);
      } else if (v === 3) {
        bodyPoint(tx, tmp.tilt, 0, 1.8, pt);
        ra.set(j, pt.x, pt.y, z - 0.1, 0.05 * (1 - k) ** 0.6, false, 0.7 * fade, 0.55 * fade, 0.2 * fade);
        bodyPoint(tx, tmp.tilt, -0.2, 1.25, pt);
        rb.set(j, pt.x, pt.y, z - 0.18, 0.1 * (1 - k) ** 0.6, false, 0.55 * fade, 0.06 * fade, 0.1 * fade);
      }
    }
    ra.commit(trailing);
    rb.commit(trailing);

    // Dust: kicked up behind his feet while he is fast (2, 3), a puff when he pushes off and where the blow lands (1, 2, 3).
    const mem = seen.current;
    if (v === 2 && speed > 0.4) {
      mem.carry += dt * 70;
      const n = Math.floor(mem.carry);
      mem.carry -= n;
      emitDust(kit.pool, [x - dir * 0.15, 0.03, z + 0.05], n, -dir * 1.6, 0.8);
    }
    if (v >= 1 && v <= 3 && dodge.outAt !== mem.out) {
      mem.out = dodge.outAt;
      if (v !== 1) emitDust(kit.pool, [0, 0.03, z + 0.05], 10, -dodge.dir * 2.2, 1);
    }
    if (v >= 1 && v <= 3 && missed && dodge.missAt !== mem.miss) {
      mem.miss = dodge.missAt;
      emitDust(kit.pool, [0, v === 1 ? 1.0 : 0.03, z], v === 1 ? 12 : 16, 0, v === 1 ? 2.4 : 3.4);
    }
    const alive = stepDust(kit.pool, dt, tint);
    const attributes = dust.current?.geometry.attributes;
    if (alive > 0 && attributes?.position && attributes.color) {
      attributes.position.needsUpdate = true;
      attributes.color.needsUpdate = true;
    }
  });

  return (
    <>
      {kit.ghost.map((material, i) => (
        <mesh key={i} ref={(m) => { ghost.current[i] = m; }} visible={false} geometry={kit.plane} material={material} />
      ))}
      <mesh ref={decoy} visible={false} geometry={kit.plane} material={kit.decoy} />
      {kit.lines.map((material, i) => (
        <mesh key={i} ref={(m) => { lines.current[i] = m; }} visible={false} geometry={kit.plane} material={material} />
      ))}
      <mesh ref={slash} visible={false} geometry={kit.plane} material={kit.slash} />
      <mesh ref={cut} visible={false} geometry={kit.plane} material={kit.cut} />
      <mesh ref={ring} visible={false} geometry={kit.plane} material={kit.ring} />
      <primitive object={kit.ribbons[0].mesh} />
      <primitive object={kit.ribbons[1].mesh} />
      <points ref={dust} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[kit.pool.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[kit.pool.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial map={kit.soft.disc} size={0.3} sizeAttenuation vertexColors transparent depthWrite={false} blending={AdditiveBlending} fog={false} />
      </points>
    </>
  );
}
