// The guard shield: a round hoplite shield of light that rises in front of the hero while block is held
// (keyboard and webcam alike, through battle.held), pulses while held and shrinks away when dropped.
// A counted block flashes it and throws sparks off its face. Reduced motion gets a plain still shield.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending } from "three";
import type { Group, MeshBasicMaterial, Points } from "three";
import { battle, calmMotion, decay, nowSeconds } from "../battle";
import { HOME_Z } from "../PlayerFigure";
import { BURST_S, shieldScale, stepShield } from "./defendTiming";
import { createPool, emit, stepPool } from "./sparks";

export const SHIELD_Y = 1.25;
/** In front of the hero, toward the monster (-z). */
export const SHIELD_FRONT = 0.75;
const RADIUS = 0.62;
const BRONZE = "#e0a83c";

export function GuardShield() {
  const group = useRef<Group>(null);
  const face = useRef<MeshBasicMaterial>(null);
  const rim = useRef<MeshBasicMaterial>(null);
  const boss = useRef<MeshBasicMaterial>(null);
  const sparks = useRef<Points>(null);
  const pool = useMemo(() => createPool(40), []);
  const live = useRef({ level: 0, seenAt: -Infinity });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = nowSeconds();
    const s = live.current;
    const calm = calmMotion();
    s.level = stepShield(s.level, battle.held.has("block"), dt);
    const g = group.current;
    if (g) {
      g.visible = s.level > 0.001;
      const flash = battle.defendedMove === "block" && !calm ? decay(now, battle.defendedAt, BURST_S) : 0;
      const pulse = calm ? 0 : 0.03 * Math.sin(now * 9);
      const size = (calm ? s.level : shieldScale(s.level)) * (1 + pulse + 0.12 * flash);
      g.scale.setScalar(Math.max(0.001, size));
      g.position.set(battle.heroX + battle.reachX, SHIELD_Y + battle.reachY, HOME_Z + battle.heroZ + battle.reachZ - SHIELD_FRONT);
      if (face.current) face.current.opacity = 0.16 + 0.3 * flash;
      if (rim.current) rim.current.opacity = 0.6 + 0.4 * flash;
      if (boss.current) boss.current.opacity = 0.5 + 0.5 * flash;
      if (!calm && battle.defendedMove === "block" && battle.defendedAt !== s.seenAt && now >= battle.defendedAt) {
        s.seenAt = battle.defendedAt;
        emit(pool, [g.position.x, g.position.y, g.position.z + 0.1], 22, 3.4);
      }
    }
    const alive = stepPool(pool, dt);
    const attributes = sparks.current?.geometry.attributes;
    if (alive > 0 && attributes?.position && attributes.color) {
      attributes.position.needsUpdate = true;
      attributes.color.needsUpdate = true;
    }
  });

  return (
    <>
      <group ref={group} visible={false}>
        <mesh>
          <circleGeometry args={[RADIUS, 40]} />
          <meshBasicMaterial ref={face} color={BRONZE} transparent opacity={0.16} depthWrite={false} blending={AdditiveBlending} fog={false} />
        </mesh>
        <mesh>
          <ringGeometry args={[RADIUS * 0.9, RADIUS, 48]} />
          <meshBasicMaterial ref={rim} color="#ffe9a8" transparent opacity={0.6} depthWrite={false} blending={AdditiveBlending} fog={false} />
        </mesh>
        <mesh>
          <ringGeometry args={[RADIUS * 0.55, RADIUS * 0.6, 4]} />
          <meshBasicMaterial color={BRONZE} transparent opacity={0.35} depthWrite={false} blending={AdditiveBlending} fog={false} />
        </mesh>
        <mesh>
          <circleGeometry args={[RADIUS * 0.17, 20]} />
          <meshBasicMaterial ref={boss} color="#ffe9a8" transparent opacity={0.5} depthWrite={false} blending={AdditiveBlending} fog={false} />
        </mesh>
      </group>
      <points ref={sparks} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pool.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[pool.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.1} sizeAttenuation vertexColors transparent depthWrite={false} blending={AdditiveBlending} fog={false} />
      </points>
    </>
  );
}
