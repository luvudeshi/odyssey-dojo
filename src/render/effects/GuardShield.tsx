// The guard shield: Athena's aegis in blue light (a Gorgon's face, scales and a fringe of snakes, drawn by aegisArt.ts)
// that rises between the hero and the camera while block is held and the card asks for a block (keyboard and webcam alike, through
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
/** Where a blocked blow lands, in front of the hero toward the monster (-z). DefendBurst draws its ring there. */
export const SHIELD_FRONT = 0.75;
/** The shield itself stands this far from the hero toward the camera, so his body never covers the Gorgon. */
const SHIELD_NEAR = 0.6;
/** Smaller than the 0.7 it had on the monster's side: nearer the camera it would otherwise cover him whole. */
const RADIUS = 0.46;
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

  useFrame(({ camera }, delta) => {
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
      // On the line from the hero to the camera and turned to face it, so it covers him squarely wherever he stands and however the shot has moved.
      const hx = battle.heroX + battle.reachX;
      const hz = HOME_Z + battle.heroZ + battle.reachZ;
      const dx = camera.position.x - hx;
      const dz = camera.position.z - hz;
      const away = SHIELD_NEAR / (Math.hypot(dx, dz) || 1);
      g.position.set(hx + dx * away, SHIELD_Y + battle.reachY, hz + dz * away);
      g.quaternion.copy(camera.quaternion);
      if (face.current) face.current.opacity = 0.3 + 0.35 * flash;
      if (art.current) art.current.opacity = 0.96 + 0.04 * flash;
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
        {/* No depth test, so nothing in the scene (a raised arm, the cloak) cuts into it; plain blending so it stays blue over a bright sky. */}
        <mesh position={[0, 0, 0.01]} renderOrder={20}>
          <planeGeometry args={[(2 * RADIUS) / AEGIS_RIM, (2 * RADIUS) / AEGIS_RIM]} />
          <meshBasicMaterial ref={art} map={aegis} color={PALE_BLUE} transparent opacity={0.96} depthWrite={false} depthTest={false} fog={false} />
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
