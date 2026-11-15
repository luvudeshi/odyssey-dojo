// A short effect round the hero each time a defend counts (battle.defendedAt/defendedMove, the same moment the HUD
// shows DODGED or BLOCKED): a ring flash on the shield for a block, a streak and dust for a dodge, a whoosh arc over
// his head for a duck, a dust ring under his feet for a jump. Gold, white and green only, under 500 ms, no text.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending } from "three";
import type { Group, Mesh, MeshBasicMaterial, Points } from "three";
import { battle, calmMotion, nowSeconds } from "../battle";
import { HOME_Z } from "../PlayerFigure";
import { burstKind, burstProgress } from "./defendTiming";
import { SHIELD_FRONT, SHIELD_Y } from "./GuardShield";
import { createPool, emit, stepPool } from "./sparks";

const GOLD = "#ffd36b";
const WHITE = "#fff4d6";
const GREEN = "#9be7a0";

/** Shows `mesh` at `p` (0..1 through the burst), fading out; hides it when `on` is false. */
function fade(mesh: Mesh | null, material: MeshBasicMaterial | null, on: boolean, p: number, peak: number): void {
  if (!mesh || !material) return;
  mesh.visible = on && p < 1;
  material.opacity = peak * (1 - p);
}

export function DefendBurst() {
  const ring = useRef<Mesh>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const streak = useRef<Mesh>(null);
  const streakMat = useRef<MeshBasicMaterial>(null);
  const arc = useRef<Group>(null);
  const arcMesh = useRef<Mesh>(null);
  const arcMat = useRef<MeshBasicMaterial>(null);
  const ground = useRef<Mesh>(null);
  const groundMat = useRef<MeshBasicMaterial>(null);
  const dust = useRef<Points>(null);
  const pool = useMemo(() => createPool(40), []);
  const seenAt = useRef(-Infinity);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = nowSeconds();
    const calm = calmMotion();
    const kind = burstKind(battle.defendedMove);
    const p = calm ? 1 : burstProgress(now, battle.defendedAt);
    const x = battle.heroX + battle.reachX;
    const z = HOME_Z + battle.heroZ + battle.reachZ;
    const fresh = battle.defendedAt !== seenAt.current && now >= battle.defendedAt;
    if (fresh) {
      seenAt.current = battle.defendedAt;
      if (!calm && (kind === "dodge" || kind === "jump")) emit(pool, [x, 0.1, z], kind === "jump" ? 26 : 16, 2.2);
    }

    const rg = ring.current;
    if (rg) {
      rg.position.set(x, SHIELD_Y + battle.reachY, z - SHIELD_FRONT + 0.02);
      rg.scale.setScalar(0.9 + 1.1 * p);
    }
    fade(rg, ringMat.current, kind === "block", p, 1);

    const st = streak.current;
    if (st) {
      const dir = battle.defendedMove === "dodge_left" ? -1 : 1;
      st.position.set(x - dir * (0.45 + 0.5 * p), 1.0, z);
      st.scale.set(1 + 1.5 * p, 1, 1);
    }
    fade(st, streakMat.current, kind === "dodge", p, 0.6);

    const ag = arc.current;
    if (ag) {
      ag.position.set(x, 1.95 + battle.reachY, z);
      ag.rotation.y = -0.8 + 1.6 * p;
    }
    fade(arcMesh.current, arcMat.current, kind === "duck", p, 1);

    const gr = ground.current;
    if (gr) {
      gr.position.set(x, 0.03, z);
      gr.scale.setScalar(0.5 + 1.8 * p);
    }
    fade(gr, groundMat.current, kind === "jump", p, 1);

    const alive = stepPool(pool, dt);
    const attributes = dust.current?.geometry.attributes;
    if (alive > 0 && attributes?.position && attributes.color) {
      attributes.position.needsUpdate = true;
      attributes.color.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh ref={ring} visible={false}>
        <ringGeometry args={[0.5, 0.64, 48]} />
        <meshBasicMaterial ref={ringMat} color={WHITE} transparent depthWrite={false} blending={AdditiveBlending} fog={false} />
      </mesh>
      <mesh ref={streak} visible={false}>
        <planeGeometry args={[0.35, 1.7]} />
        <meshBasicMaterial ref={streakMat} color={GREEN} transparent depthWrite={false} blending={AdditiveBlending} fog={false} />
      </mesh>
      <group ref={arc}>
        <mesh ref={arcMesh} visible={false} rotation={[1.15, 0, 0]}>
          <torusGeometry args={[0.6, 0.04, 6, 28, Math.PI * 1.2]} />
          <meshBasicMaterial ref={arcMat} color={WHITE} transparent depthWrite={false} blending={AdditiveBlending} fog={false} />
        </mesh>
      </group>
      <mesh ref={ground} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, 0.78, 40]} />
        <meshBasicMaterial ref={groundMat} color={GOLD} transparent depthWrite={false} blending={AdditiveBlending} fog={false} />
      </mesh>
      <points ref={dust} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pool.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[pool.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.2} sizeAttenuation vertexColors transparent depthWrite={false} blending={AdditiveBlending} fog={false} />
      </points>
    </>
  );
}
