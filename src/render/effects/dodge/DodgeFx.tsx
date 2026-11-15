// What the dodge leaves behind (dodgeMotion.ts moves the hero): a gold crest trail and a crimson cloak trail follow the
// move, dust is kicked up behind his feet and as he pushes off, and a puff rises on his mark where the blow lands.
// All soft (additive), eased, and drawn from the dodge store every frame.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending } from "three";
import type { Points } from "three";
import { battle, nowSeconds } from "../../battle";
import { HOME_Z } from "../../PlayerFigure";
import { createPool } from "../sparks";
import { makeSoftTextures } from "../softTextures";
import { bodyPoint, dodge } from "./dodgeMotion";
import { emitDust, stepDust } from "./dust";
import { Ribbon } from "./ribbon";

const POINTS = 14;
/** Seconds between the trail's points: the trail is POINTS * this long. */
const TRAIL_STEP = 0.03;
/** The numbers to nudge: widths (metres, half) and colours (rgb, additive) of the two trails. */
const CREST = { width: 0.04, rgb: [0.5, 0.38, 0.14] } as const;
const CLOAK = { width: 0.08, rgb: [0.4, 0.05, 0.08] } as const;
const DUST: readonly [number, number, number] = [0.62, 0.52, 0.42];

const tmp = { x: 0, tilt: 0 };
const pt = { x: 0, y: 0 };

export function DodgeFx() {
  const kit = useMemo(() => ({ disc: makeSoftTextures().disc, crest: new Ribbon(POINTS), cloak: new Ribbon(POINTS), pool: createPool(64) }), []);
  const dust = useRef<Points>(null);
  const seen = useRef({ miss: -Infinity, out: -Infinity, carry: 0 });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = nowSeconds();
    const x = dodge.x + battle.reachX;
    const z = HOME_Z + battle.heroZ + battle.reachZ;
    const dir = Math.abs(dodge.vx) > 0.3 ? Math.sign(dodge.vx) : dodge.dir;
    const fast = dodge.active && Math.abs(dodge.vx) > 1.2;
    const mem = seen.current;

    // The crest (gold) and the cloak (crimson) trails: where those points of his body were a moment ago, fading toward the tail.
    for (let j = 0; j < POINTS; j++) {
      const k = j / (POINTS - 1);
      const fade = (1 - k) ** 1.4;
      dodge.trail.at(now, j * TRAIL_STEP, tmp);
      const tx = tmp.x + battle.reachX;
      bodyPoint(tx, tmp.tilt, 0, 1.8, pt);
      kit.crest.set(j, pt.x, pt.y, z - 0.1, CREST.width * (1 - k) ** 0.6, CREST.rgb[0] * fade, CREST.rgb[1] * fade, CREST.rgb[2] * fade);
      bodyPoint(tx, tmp.tilt, -0.2, 1.25, pt);
      kit.cloak.set(j, pt.x, pt.y, z - 0.18, CLOAK.width * (1 - k) ** 0.6, CLOAK.rgb[0] * fade, CLOAK.rgb[1] * fade, CLOAK.rgb[2] * fade);
    }
    const trailing = dodge.active && Math.abs(dodge.x) + Math.abs(dodge.vx) * 0.2 > 0.05;
    kit.crest.commit(trailing);
    kit.cloak.commit(trailing);

    // Dust behind his feet while he is fast, a puff as he pushes off, and a puff on his mark where the blow lands.
    if (fast) {
      mem.carry += dt * 70;
      const n = Math.floor(mem.carry);
      mem.carry -= n;
      emitDust(kit.pool, [x - dir * 0.15, 0.03, z + 0.05], n, -dir * 1.6, 0.8);
    }
    if (dodge.active && dodge.outAt !== mem.out) {
      mem.out = dodge.outAt;
      emitDust(kit.pool, [0, 0.03, z + 0.05], 10, -dodge.dir * 2.2, 1);
    }
    if (dodge.active && dodge.missAt >= dodge.outAt && dodge.missAt !== mem.miss) {
      mem.miss = dodge.missAt;
      emitDust(kit.pool, [0, 0.03, z], 16, 0, 3.4);
    }
    const alive = stepDust(kit.pool, dt, DUST);
    const attributes = dust.current?.geometry.attributes;
    if (alive > 0 && attributes?.position && attributes.color) {
      attributes.position.needsUpdate = true;
      attributes.color.needsUpdate = true;
    }
  });

  return (
    <>
      <primitive object={kit.crest.mesh} />
      <primitive object={kit.cloak.mesh} />
      <points ref={dust} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[kit.pool.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[kit.pool.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial map={kit.disc} size={0.3} sizeAttenuation vertexColors transparent depthWrite={false} blending={AdditiveBlending} fog={false} />
      </points>
    </>
  );
}
