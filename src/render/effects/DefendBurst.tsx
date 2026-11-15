// A short effect round the hero each time a defend counts (battle.defendedAt/defendedMove, the same moment the HUD chip
// shows). Block: a soft ring spreading off the shield. Dodge: drawn by dodge/DodgeFx. Duck: a soft whoosh over his head. Jump: a gold pulse on the ground. All of it is soft (additive blending on small generated
// textures), eased, animated off nowSeconds() every frame, 550 ms, and nothing is drawn with reduced motion.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, DoubleSide, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Mesh, Points, Texture } from "three";
import { battle, calmMotion, nowSeconds } from "../battle";
import { HOME_Z } from "../PlayerFigure";
import { burstFade, burstKind, burstProgress, easeOut } from "./defendTiming";
import { SHIELD_FRONT, SHIELD_Y } from "./GuardShield";
import { createPool, emit, stepPool } from "./sparks";
import { makeSoftTextures } from "./softTextures";
import { DodgeFx } from "./dodge/DodgeFx";

const GOLD = 0xffd36b;
const WHITE = 0xfff4d6;
const GREEN = 0x9be7a0;

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
      swoosh: glow(tex.swoosh, WHITE),
      pool: createPool(40),
    };
  }, []);
  const ground = useRef<Mesh>(null);
  const body = useRef<Mesh>(null);
  const swoosh = useRef<Mesh>(null);
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
    const x = battle.heroX + battle.reachX;
    const z = HOME_Z + battle.heroZ + battle.reachZ;

    if (battle.defendedAt !== seenAt.current && now >= battle.defendedAt) {
      seenAt.current = battle.defendedAt;
      if (!calm && kind === "jump") emit(kit.pool, [x, 0.1, z], 22, 1.8);
      kit.ground.color.setHex(kind === "jump" ? GOLD : GREEN);
      kit.body.color.setHex(kind === "block" ? WHITE : GREEN);
    }

    // Flat pulse on the floor: the jump's.
    const g = ground.current;
    if (g) {
      g.position.set(x, 0.03, z);
      g.scale.setScalar(0.7 + 2.6 * t);
      put(g, kind === "jump" ? e * 0.9 : 0);
    }

    // Upright ring facing the camera: the block ring off the shield.
    const b = body.current;
    if (b) {
      const block = kind === "block";
      b.position.set(x, SHIELD_Y + battle.reachY, z - SHIELD_FRONT + 0.02);
      b.scale.setScalar(1.2 + 1.3 * t);
      put(b, block ? e : 0);
    }

    // The duck whoosh.
    const m = swoosh.current;
    if (m) {
      m.position.set(x - 0.6 + 1.2 * t, 1.95 + battle.reachY, z - 0.05);
      m.scale.set(1.7, 0.7, 1);
      m.rotation.z = 0;
      put(m, kind === "duck" ? e : 0);
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
      <DodgeFx />
      <mesh ref={ground} visible={false} rotation={[-Math.PI / 2, 0, 0]} geometry={kit.plane} material={kit.ground} />
      <mesh ref={body} visible={false} geometry={kit.plane} material={kit.body} />
      <mesh ref={swoosh} visible={false} geometry={kit.plane} material={kit.swoosh} />
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
