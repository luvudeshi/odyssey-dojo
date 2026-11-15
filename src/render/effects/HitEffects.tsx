// What a hit feels like: sparks and a flash of light where the monster is struck, a bigger burst when it falls,
// and a camera shake (handed to the camera rig) with a red flash at the screen's edge when the player is struck.
// Mount it inside the monster's group. It only reads combat state; it never changes fight rules.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending } from "three";
import type { Mesh, PointLight, Points } from "three";
import type { CombatState } from "../../core/types";
import { battle, calmMotion, nowSeconds } from "../battle";
import { REACH } from "../strikeReach";
import { fxBetween } from "./events";
import type { Fx, Vec3 } from "./events";
import { markHit } from "./pulse";
import { createPool, emit, stepPool } from "./sparks";

const POOL_SIZE = 220;
const SHAKE_SECONDS = 0.25;
const SHAKE_REACH = 0.13;
const FLASH_SECONDS = 0.22;

type MonsterFx = Exclude<Fx, { type: "playerHit" }>;

export function HitEffects({ state, finishAt }: { state: CombatState; finishAt: Vec3 }) {
  const gl = useThree((three) => three.gl);
  const pool = useMemo(() => createPool(POOL_SIZE), []);
  const sparks = useRef<Points>(null);
  const previous = useRef<CombatState | null>(null);
  const light = useRef<PointLight>(null);
  const overlay = useRef<HTMLDivElement | null>(null);
  const live = useRef({ shake: 0, shakeScale: 1, flash: 0, flashPower: 0, sparking: false });
  /** Blows still on their way: each fires when the hero's reach arrives, so sparks and flash meet the fist. */
  const pending = useRef<{ fireAt: number; effect: MonsterFx }[]>([]);

  // The red edge flash is a plain element laid over the canvas, styled by `.hurt-flash` in index.css.
  useEffect(() => {
    const element = document.createElement("div");
    element.className = "hurt-flash";
    gl.domElement.parentElement?.append(element);
    overlay.current = element;
    return () => {
      element.remove();
      overlay.current = null;
    };
  }, [gl]);

  useEffect(() => {
    const fx = fxBetween(previous.current, state, finishAt, REACH.out);
    previous.current = state;
    for (const effect of fx) {
      if (effect.type === "playerHit") {
        live.current.shake = SHAKE_SECONDS;
        live.current.shakeScale = 1;
        const element = overlay.current;
        if (element) {
          element.classList.remove("on");
          element.getBoundingClientRect(); // restarts the animation when hits come close together
          element.classList.add("on");
        }
        continue;
      }
      pending.current.push({ fireAt: nowSeconds() + effect.delay, effect });
    }
  }, [state, finishAt]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = live.current;
    const clock = nowSeconds();
    for (let next = pending.current[0]; next && next.fireAt <= clock; next = pending.current[0]) {
      pending.current.shift();
      const effect = next.effect;
      const big = effect.type === "finished";
      emit(pool, effect.at, big ? 150 : 34, big ? 7.5 : 4.2);
      now.flash = FLASH_SECONDS * (big ? 2 : 1);
      now.flashPower = big ? 70 : 22;
      markHit();
      light.current?.position.set(effect.at[0], effect.at[1], effect.at[2] + 0.4);
      now.shake = SHAKE_SECONDS;
      now.shakeScale = big ? 0.6 : 0.35;
    }

    // Upload on the frame the last spark dies too, or it would stay frozen on screen.
    const alive = stepPool(pool, dt);
    if (alive > 0 || now.sparking) {
      const attributes = sparks.current?.geometry.attributes;
      if (attributes?.position) attributes.position.needsUpdate = true;
      if (attributes?.color) attributes.color.needsUpdate = true;
    }
    now.sparking = alive > 0;
    if (light.current) {
      now.flash = Math.max(0, now.flash - dt);
      light.current.intensity = now.flashPower * (now.flash / FLASH_SECONDS);
    }
    // The camera rig owns the camera; the shake is only an offset it adds on top.
    now.shake = Math.max(0, now.shake - dt);
    const reach = calmMotion() ? 0 : SHAKE_REACH * now.shakeScale * (now.shake / SHAKE_SECONDS);
    battle.shakeX = (Math.random() - 0.5) * 2 * reach;
    battle.shakeY = (Math.random() - 0.5) * 2 * reach;
  });

  // Clear the shake if the fight ends mid-shake.
  useEffect(() => () => {
    battle.shakeX = 0;
    battle.shakeY = 0;
  }, []);

  return (
    <>
      <points ref={sparks} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pool.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[pool.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.16}
          sizeAttenuation
          vertexColors
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          fog={false}
        />
      </points>
      <pointLight ref={light} color="#ffd27a" intensity={0} distance={9} decay={1.5} />
    </>
  );
}

/**
 * The gold ring on the weak spot. It stays up after a strike counts until the hero's blow lands there
 * (battle.enemyHitAt), so it marks the spot he is leaping at rather than vanishing as he takes off.
 */
export function WeakSpotRing({ spot }: { spot: Vec3 | null }) {
  const ring = useRef<Mesh>(null);
  useEffect(() => {
    if (spot) ring.current?.position.set(spot[0], spot[1], spot[2]);
  }, [spot]);
  useFrame(() => {
    if (ring.current) ring.current.visible = spot !== null || nowSeconds() < battle.enemyHitAt;
  });
  return (
    <mesh ref={ring} visible={false}>
      <torusGeometry args={[0.45, 0.06, 8, 32]} />
      <meshBasicMaterial color="#ffd54a" />
    </mesh>
  );
}
