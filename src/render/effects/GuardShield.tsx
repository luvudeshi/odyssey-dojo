// The guard shield: Athena's aegis in blue light (a Gorgon's face, scales and a fringe of snakes, drawn by aegisArt.ts)
// that rises in front of the hero while block is held and the card asks for a block (keyboard and webcam alike, through
// battle.held), pulses while held and shrinks away when dropped.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture } from "three";
import type { Group, MeshBasicMaterial, Points } from "three";
import { battle, calmMotion, decay, nowSeconds } from "../battle";
import { HOME_Z } from "../PlayerFigure";
import { AEGIS_RIM, drawAegis } from "./aegisArt";
import { BURST_S, shieldScale, shieldUp, stepShield } from "./defendTiming";
import { createPool, emit, stepPool } from "./sparks";

export const SHIELD_Y = 1.25;
/** In front of the hero, toward the monster (-z). */
export const SHIELD_FRONT = 0.75;
const RADIUS = 0.7;
const BLUE = "#1f6fff";
const PALE_BLUE = "#8fd0ff";
const SPARK_BLUE = [0.4, 0.72, 1] as const;

export function GuardShield() {
  const group = useRef<Group>(null);
  const face = useRef<MeshBasicMaterial>(null);
  const art = useRef<MeshBasicMaterial>(null);
  const aegis = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx) drawAegis(ctx, 512);
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => { aegis.dispose(); }, [aegis]);
  const sparks = useRef<Points>(null);
  const pool = useMemo(() => createPool(40), []);
  const live = useRef({ level: 0, seenAt: -Infinity });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = nowSeconds();
    const s = live.current;
    const calm = calmMotion();
    const sinceBlock = battle.defendedMove === "block" ? now - battle.defendedAt : -1;
    s.level = stepShield(s.level, shieldUp(battle.held, battle.state?.phase, sinceBlock), dt);
    const g = group.current;
    if (g) {
      g.visible = s.level > 0.001;
      const flash = battle.defendedMove === "block" && !calm ? decay(now, battle.defendedAt, BURST_S) : 0;
      const pulse = calm ? 0 : 0.03 * Math.sin(now * 9);
      const size = (calm ? s.level : shieldScale(s.level)) * (1 + pulse + 0.12 * flash);
      g.scale.setScalar(Math.max(0.001, size));
      g.position.set(battle.heroX + battle.reachX, SHIELD_Y + battle.reachY, HOME_Z + battle.heroZ + battle.reachZ - SHIELD_FRONT);
      if (face.current) face.current.opacity = 0.3 + 0.35 * flash;
      if (art.current) art.current.opacity = 0.85 + 0.15 * flash;
      if (!calm && battle.defendedMove === "block" && battle.defendedAt !== s.seenAt && now >= battle.defendedAt) {
        s.seenAt = battle.defendedAt;
        emit(pool, [g.position.x, g.position.y, g.position.z + 0.1], 22, 3.4);
      }
    }
    const alive = stepPool(pool, dt, SPARK_BLUE);
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
          <meshBasicMaterial ref={face} color={BLUE} transparent opacity={0.3} depthWrite={false} depthTest={false} blending={AdditiveBlending} fog={false} />
        </mesh>
        {/* Drawn over the hero (no depth test) so his back does not hide the Gorgon, and in plain blending so it stays blue over a bright sky. */}
        <mesh position={[0, 0, 0.01]} renderOrder={20}>
          <planeGeometry args={[(2 * RADIUS) / AEGIS_RIM, (2 * RADIUS) / AEGIS_RIM]} />
          <meshBasicMaterial ref={art} map={aegis} color={PALE_BLUE} transparent opacity={0.85} depthWrite={false} depthTest={false} fog={false} />
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
