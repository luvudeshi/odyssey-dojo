// Polyphemus's boulder throw, drawn: a rock rises into his raised hand during the telegraph, he hurls it in the last
// 400 ms and it arrives as the attack lands. Hit: it smashes on the hero. Ducked or dodged: it flies on and breaks on the
// floor behind him. Blocked: it shatters in front of him. Drawing only: it reads battle.state and changes no fight rule.
// Mount it inside the monster's group (positions are in the rig's space).
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending } from "three";
import type { Group, Mesh, Points } from "three";
import { battle, calmMotion, nowSeconds } from "../battle";
import { thrownRockGeometry } from "../arena/cave/solids";
import { HOME_Z } from "../PlayerFigure";
import { FLOOR, boulderAt, endingFor, missBreakMs } from "./boulderFlight";
import type { RockPose, Spot } from "./boulderFlight";
import { createPool, emit, stepPool } from "./sparks";

const RADIUS = 0.6;
const PIECES = 10;
const PIECE_SECONDS = 0.55;
const FADE_SECONDS = 0.25;
const AIM_Y = 1.9;

/** One run of the attack, from the first frame of its telegraph to the end of its ending. */
interface Run {
  startedAt: number;
  totalMs: number;
  counter: string;
  /** Set at landing: when a missed rock breaks on the floor (seconds), and the landing time. */
  landedAt: number;
  breakAt: number;
  /** Seconds when a calm-motion fade began, or -1. */
  fadeAt: number;
}

export function Boulder() {
  const root = useRef<Group>(null);
  const rock = useRef<Mesh>(null);
  const pieces = useRef<(Mesh | null)[]>([]);
  const dust = useRef<(Mesh | null)[]>([]);
  const sparks = useRef<Points>(null);
  const geometry = useMemo(() => thrownRockGeometry(), []);
  const pool = useMemo(() => createPool(36), []);
  const bits = useMemo(() => ({ pos: new Float32Array(PIECES * 3), vel: new Float32Array(PIECES * 3), life: new Float32Array(PIECES), dust: 0 }), []);
  const live = useRef<{ run: Run | null; aim: Spot; pose: RockPose; sparking: boolean }>({
    run: null, aim: { x: 0, y: AIM_Y, z: 5 }, pose: { x: 0, y: 0, z: 0, scale: 0, spin: 0 }, sparking: false,
  });

  function burst(at: Spot, big: boolean, withSparks: boolean): void {
    bits.dust = 0.5;
    for (let i = 0; i < PIECES; i++) {
      const turn = Math.random() * Math.PI * 2;
      const speed = (big ? 3.2 : 2.4) * (0.4 + Math.random() * 0.6);
      bits.pos.set([at.x, at.y, at.z], i * 3);
      bits.vel[i * 3] = Math.cos(turn) * speed;
      bits.vel[i * 3 + 1] = 1.5 + Math.random() * 2.5;
      bits.vel[i * 3 + 2] = Math.sin(turn) * speed * 0.7 + 1.2;
      bits.life[i] = PIECE_SECONDS * (0.7 + Math.random() * 0.3);
    }
    if (withSparks) emit(pool, [at.x, at.y, at.z], 36, 4.5);
    dust.current.forEach((puff) => puff?.position.set(at.x, Math.max(at.y, 0.6), at.z));
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = nowSeconds();
    const state = live.current;
    const phase = battle.state?.phase;
    const throwing = phase?.kind === "defend" && phase.attack.id === "boulder" ? phase : null;
    const calm = calmMotion();
    const rockMesh = rock.current;
    if (!rockMesh) return;

    // Where the hero stands in the rig's space (the rig lunges, so take its own offset off).
    const rigZ = root.current?.parent?.position.z ?? -4;
    state.aim.z = HOME_Z - rigZ - 0.1;

    if (throwing) {
      const run = (state.run ??= { startedAt: now, totalMs: throwing.totalMs, counter: throwing.attack.counter, landedAt: -1, breakAt: -1, fadeAt: -1 });
      run.totalMs = throwing.totalMs;
      run.counter = throwing.attack.counter;
      const progress = 1 - throwing.msLeft / throwing.totalMs;
      boulderAt(state.pose, progress, run.totalMs, state.aim);
    } else if (state.run && state.run.landedAt < 0) {
      // The attack has just landed: pick the ending from what the engine says happened.
      const run = state.run;
      run.landedAt = now;
      const hit = battle.playerHitAt >= run.startedAt;
      const ending = endingFor(hit, run.counter);
      const spot: Spot = { x: state.aim.x + battle.heroX, y: AIM_Y - 0.4, z: state.aim.z + (ending === "shatter" ? -0.5 : 0) };
      if (ending === "miss") run.breakAt = now + missBreakMs(run.totalMs, state.aim) / 1000;
      else if (calm) run.fadeAt = now;
      else {
        burst(spot, ending === "smash", ending === "shatter");
        run.breakAt = -2;
      }
    }

    const run = state.run;
    if (run && !throwing) {
      if (run.breakAt > 0 && now < run.breakAt) {
        // A missed rock carries on along its line, in step with real time.
        const p = 1 + ((now - run.landedAt) * 1000) / run.totalMs;
        boulderAt(state.pose, p, run.totalMs, state.aim);
        state.pose.y = Math.max(state.pose.y, FLOOR);
      } else if (run.breakAt > 0) {
        if (calm) run.fadeAt = now;
        else burst({ x: state.pose.x, y: FLOOR, z: state.pose.z }, false, false);
        run.breakAt = -2;
      }
      if (run.fadeAt > 0) state.pose.scale = Math.max(0, 1 - (now - run.fadeAt) / FADE_SECONDS) * 0.6;
      else if (run.breakAt === -2) state.pose.scale = 0;
      // Done once the pieces are gone: nothing is left lying about.
      if (run.breakAt === -2 && run.fadeAt < 0 && bits.life.every((life) => life <= 0) && bits.dust <= 0) state.run = null;
      if (run.fadeAt > 0 && state.pose.scale <= 0) state.run = null;
    }

    const showRock = state.run !== null && state.pose.scale > 0;
    rockMesh.visible = showRock;
    if (showRock) {
      rockMesh.position.set(state.pose.x, state.pose.y, state.pose.z);
      rockMesh.scale.setScalar(RADIUS * state.pose.scale);
      rockMesh.rotation.set(calm ? 0 : state.pose.spin * 0.8, calm ? 0 : state.pose.spin, 0);
    }

    // Pieces: gravity, shrinking to nothing, hidden when spent.
    for (let i = 0; i < PIECES; i++) {
      const mesh = pieces.current[i];
      if (!mesh) continue;
      const life = bits.life[i] ?? 0;
      if (life <= 0) { mesh.visible = false; continue; }
      bits.life[i] = life - dt;
      bits.vel[i * 3 + 1] = (bits.vel[i * 3 + 1] ?? 0) - 9 * dt;
      for (let axis = 0; axis < 3; axis++) bits.pos[i * 3 + axis] = (bits.pos[i * 3 + axis] ?? 0) + (bits.vel[i * 3 + axis] ?? 0) * dt;
      bits.pos[i * 3 + 1] = Math.max(bits.pos[i * 3 + 1] ?? 0, 0.1);
      mesh.visible = true;
      mesh.position.set(bits.pos[i * 3] ?? 0, bits.pos[i * 3 + 1] ?? 0, bits.pos[i * 3 + 2] ?? 0);
      mesh.scale.setScalar(0.22 * Math.min(1, (life / PIECE_SECONDS) * 2));
      mesh.rotation.set(life * 9 + i, life * 7, i);
    }
    // Dust puffs swell and fade.
    bits.dust = Math.max(0, bits.dust - dt);
    dust.current.forEach((puff, index) => {
      if (!puff) return;
      puff.visible = bits.dust > 0;
      const k = 1 - bits.dust / 0.5;
      puff.scale.setScalar(0.4 + k * (0.9 + index * 0.35));
      puff.position.y += dt * (0.5 + index * 0.2);
      (puff.material as { opacity: number }).opacity = 0.45 * (1 - k);
    });

    const alive = stepPool(pool, dt);
    if (alive > 0 || state.sparking) {
      const attributes = sparks.current?.geometry.attributes;
      if (attributes?.position) attributes.position.needsUpdate = true;
      if (attributes?.color) attributes.color.needsUpdate = true;
    }
    state.sparking = alive > 0;
  });

  return (
    <group ref={root}>
      <mesh ref={rock} geometry={geometry} visible={false} castShadow>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      {Array.from({ length: PIECES }, (_, i) => (
        <mesh key={i} ref={(mesh) => { pieces.current[i] = mesh; }} geometry={geometry} visible={false}>
          <meshStandardMaterial vertexColors flatShading roughness={1} />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(mesh) => { dust.current[i] = mesh; }} visible={false}>
          <icosahedronGeometry args={[0.5, 0]} />
          <meshBasicMaterial color="#a89880" transparent opacity={0} depthWrite={false} fog={false} />
        </mesh>
      ))}
      <points ref={sparks} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pool.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[pool.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.16} sizeAttenuation vertexColors transparent depthWrite={false} blending={AdditiveBlending} fog={false} />
      </points>
    </group>
  );
}
