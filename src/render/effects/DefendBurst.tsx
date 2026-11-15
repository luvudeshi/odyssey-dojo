// A short effect round the hero each time a defend counts (battle.defendedAt/defendedMove, the same moment the HUD chip
// shows). Block: a soft ring spreading off the shield. Dodge (three versions, ?burst=a|b|c): a, a circular pulse out from
// him; b, curved afterimage arcs from where he stood; c, the attack's line whiffing past with a dust kick. Duck: a soft
// whoosh over his head. Jump: a gold pulse on the ground. All of it is soft (additive blending on small generated
// textures), eased, animated off nowSeconds() every frame, 550 ms, and nothing is drawn with reduced motion.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, DoubleSide, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Mesh, Points, Texture } from "three";
import { battle, calmMotion, nowSeconds } from "../battle";
import { HOME_Z } from "../PlayerFigure";
import { burstFade, burstKind, burstProgress, burstVariant, easeOut } from "./defendTiming";
import { SHIELD_FRONT, SHIELD_Y } from "./GuardShield";
import { createPool, emit, stepPool } from "./sparks";
import { makeSoftTextures } from "./softTextures";

const VARIANT = burstVariant(window.location.search);
const GOLD = 0xffd36b;
const WHITE = 0xfff4d6;
const GREEN = 0x9be7a0;
const SWOOSHES = 3;

function glow(map: Texture, color: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, fog: false, side: DoubleSide });
}

/** Sets a layer's brightness; it is hidden when it is dark. */
function put(mesh: Mesh | null | undefined, alpha: number): void {
  if (!mesh) return;
  mesh.visible = alpha > 0.003;
  if (mesh.visible && !Array.isArray(mesh.material)) (mesh.material as MeshBasicMaterial).opacity = alpha;
}

export function DefendBurst() {
  const kit = useMemo(() => {
    const tex = makeSoftTextures();
    return {
      tex,
      plane: new PlaneGeometry(1, 1),
      ground: glow(tex.ring, GREEN),
      body: glow(tex.ring, GREEN),
      line: glow(tex.disc, WHITE),
      swoosh: [glow(tex.swoosh, WHITE), glow(tex.swoosh, GREEN), glow(tex.swoosh, GREEN)],
      pool: createPool(40),
    };
  }, []);
  const ground = useRef<Mesh>(null);
  const body = useRef<Mesh>(null);
  const line = useRef<Mesh>(null);
  const swoosh = useRef<(Mesh | null)[]>([]);
  const dust = useRef<Points>(null);
  const seenAt = useRef(-Infinity);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = nowSeconds();
    const calm = calmMotion();
    const kind = burstKind(battle.defendedMove);
    const p = calm ? 1 : burstProgress(now, battle.defendedAt);
    const t = easeOut(p);
    const e = burstFade(p);
    const dir = battle.defendedMove === "dodge_left" ? -1 : 1;
    const x = battle.heroX + battle.reachX;
    const z = HOME_Z + battle.heroZ + battle.reachZ;
    const isDodge = kind === "dodge";

    if (battle.defendedAt !== seenAt.current && now >= battle.defendedAt) {
      seenAt.current = battle.defendedAt;
      if (!calm && (isDodge || kind === "jump")) emit(kit.pool, [x - (isDodge ? dir * 0.2 : 0), 0.1, z], kind === "jump" ? 22 : 12, 1.8);
      kit.ground.color.setHex(kind === "jump" ? GOLD : GREEN);
      kit.body.color.setHex(kind === "block" ? WHITE : GREEN);
    }

    // Flat pulse on the floor: dodge a, jump, and a small one under dodge c's dust.
    const g = ground.current;
    if (g) {
      const big = kind === "jump" || (isDodge && VARIANT === "a");
      const small = isDodge && VARIANT === "c";
      g.position.set(x, 0.03, z);
      g.scale.setScalar(big ? 0.7 + 2.6 * t : 0.4 + 1.1 * t);
      put(g, big ? e * 0.9 : small ? e * 0.45 : 0);
    }

    // Upright ring facing the camera: the block ring off the shield, and dodge a's pulse round his body.
    const b = body.current;
    if (b) {
      const block = kind === "block";
      b.position.set(x, block ? SHIELD_Y + battle.reachY : 1.1, block ? z - SHIELD_FRONT + 0.02 : z - 0.1);
      b.scale.setScalar(block ? 1.2 + 1.3 * t : 1.3 + 1.7 * t);
      put(b, block ? e : isDodge && VARIANT === "a" ? e * 0.5 : 0);
    }

    // Dodge c: the attack's line whiffs past, a thin bright slash across where he stood.
    const l = line.current;
    if (l) {
      const on = isDodge && VARIANT === "c";
      l.position.set(x - dir * 0.5, 1.25 + 0.25 * t, z - 0.15);
      l.rotation.z = dir * 0.55;
      l.scale.set(0.5 + 2.4 * easeOut(p * 2), 0.09, 1);
      put(l, on ? burstFade(p) : 0);
    }

    // Swooshes: dodge b's three afterimage arcs (staggered, each easing from where he stood to where he went), and the duck whoosh.
    for (let i = 0; i < SWOOSHES; i++) {
      const m = swoosh.current[i];
      if (!m) continue;
      if (isDodge && VARIANT === "b") {
        const pi = Math.min(1, Math.max(0, (p - i * 0.08) / (1 - i * 0.08)));
        m.position.set(x - dir * (1.0 - 0.9 * easeOut(pi)), 0.75 + i * 0.33, z - 0.1);
        m.scale.set(dir * (1.7 - i * 0.2), 0.65, 1);
        m.rotation.z = 0;
        put(m, burstFade(pi) * (0.9 - i * 0.12));
      } else if (kind === "duck" && i === 0) {
        m.position.set(x - 0.6 + 1.2 * t, 1.95 + battle.reachY, z - 0.05);
        m.scale.set(1.7, 0.7, 1);
        m.rotation.z = 0;
        put(m, e);
      } else put(m, 0);
    }

    const alive = stepPool(kit.pool, dt);
    const attributes = dust.current?.geometry.attributes;
    if (alive > 0 && attributes?.position && attributes.color) {
      attributes.position.needsUpdate = true;
      attributes.color.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh ref={ground} visible={false} rotation={[-Math.PI / 2, 0, 0]} geometry={kit.plane} material={kit.ground} />
      <mesh ref={body} visible={false} geometry={kit.plane} material={kit.body} />
      <mesh ref={line} visible={false} geometry={kit.plane} material={kit.line} />
      {kit.swoosh.map((material, i) => (
        <mesh key={i} ref={(m) => { swoosh.current[i] = m; }} visible={false} geometry={kit.plane} material={material} />
      ))}
      <points ref={dust} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[kit.pool.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[kit.pool.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial map={kit.tex.disc} size={0.26} sizeAttenuation vertexColors transparent depthWrite={false} blending={AdditiveBlending} fog={false} />
      </points>
    </>
  );
}
