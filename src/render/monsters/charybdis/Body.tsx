// Charybdis's body: a funnel of turning water open toward the camera with fangs of foam round its rim and a great
// eye deep in the dark throat, a wave arching over it, and walls of water that rear up from either side. Every
// attack drives a different part (see look.ts), so the player can tell which defence is being asked for.
import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, MathUtils, RingGeometry, TorusGeometry } from "three";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import type { MonsterProps } from "../../../core/types";
import { battle, decay, nowSeconds } from "../../battle";
import { useQualityLevel } from "../../quality";
import { IDLE, PHASES, lookFor } from "./look";
import type { Look } from "./look";
import { MOUTH_RX, MOUTH_RY, MOUTH_Z, THROAT_Y, columnGeometry, eyeGeometry, fangGeometry, funnelGeometry, waveGeometry } from "./shapes";
import { LookParts } from "./lookParts";
import { makeWaterMaterial, updateWater } from "./waterMaterial";

const RINGS = 3;
// The anglerfish look ("a") is the owner's pick and the default. ?look=b is the tentacle look, ?look=base the one built in code.
const LOOK = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("look");
const ALT = LOOK === "base" ? null : LOOK === "b" ? "b" : "a";
const WALL_X = 3.4;
const eyeColor = new Color();
const eyeFrom = new Color();

export function Body(props: MonsterProps) {
  const high = useQualityLevel() === "high";
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const parts = useMemo(
    () => ({
      funnel: funnelGeometry(), wave: waveGeometry(4), wall: waveGeometry(3.4), column: columnGeometry(),
      fangs: fangGeometry(), eye: eyeGeometry(), ring: new TorusGeometry(1, 0.035, 5, 28), lip: new TorusGeometry(1, 0.1, 6, 22), foam: new RingGeometry(1.6, 4.5, 40, 1),
      body: makeWaterMaterial(0), sheet: makeWaterMaterial(1), foamMat: makeWaterMaterial(2),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(parts).forEach((part) => { part.dispose(); });
    },
    [parts],
  );

  const live = useRef<Look & { phase: number }>({ ...IDLE, phase: 0 });
  const funnel = useRef<Group>(null);
  const crest = useRef<Group>(null);
  const wallLeft = useRef<Mesh>(null);
  const wallRight = useRef<Mesh>(null);
  const column = useRef<Mesh>(null);
  const fangs = useRef<Group>(null);
  const eye = useRef<Group>(null);
  const eyeMaterial = useRef<MeshBasicMaterial>(null);
  const rings = useRef<(Mesh | null)[]>([]);
  const foam = useRef<Mesh>(null);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const p = latest.current;
    const target = lookFor(p.attackId, p.windup, p.defeated, p.phaseIndex);
    const l = live.current;
    for (const key of Object.keys(target) as (keyof Look)[]) {
      l[key] = MathUtils.damp(l[key], target[key], key === "collapse" ? 2.5 : p.attackId || p.defeated ? 9 : 6, dt);
    }
    l.phase = MathUtils.damp(l.phase, p.phaseIndex, 2.5, dt);
    // The killing blow must not blow the funnel out to white: the hit wash fades out as it collapses.
    const flash = Math.max(p.hitFlash, decay(nowSeconds(), battle.enemyHitAt, 0.35)) * (p.defeated ? 0.35 : 1);
    const t = clock.elapsedTime;
    for (const material of [parts.body, parts.sheet, parts.foamMat]) {
      updateWater(material, { time: t, flash, spin: l.spin, defeat: l.collapse, phase: l.phase });
    }

    const c = l.collapse;
    funnel.current?.scale.set(l.mouth * (1 - 0.15 * c), l.mouth * (1 - 0.3 * c), 1 - 0.3 * c);
    funnel.current?.position.set(0, -4.4 * c * c, 0);
    if (crest.current) {
      crest.current.position.set(0.3, 1.45 + l.crestLift - 1.1 * c, -0.6);
      crest.current.rotation.x = l.crestLean;
      crest.current.scale.set(1, Math.max(0.001, 0.92 * (1 - c)), 1);
      crest.current.visible = c < 0.85;
    }
    for (const [ref, amount] of [[wallLeft, l.wallLeft], [wallRight, l.wallRight]] as const) {
      const wall = ref.current;
      if (!wall) continue;
      wall.visible = amount > 0.02;
      wall.scale.set(1, Math.max(0.001, amount * 1.9), 1);
    }
    if (column.current) {
      column.current.visible = l.spout > 0.02;
      column.current.scale.set(1 + l.spout * 0.5, Math.max(0.001, l.spout * 3), 1 + l.spout * 0.5);
    }
    if (fangs.current) {
      const s = Math.max(0.001, l.fangs);
      fangs.current.scale.setScalar(s);
      fangs.current.position.set(0, THROAT_Y * (1 - s), MOUTH_Z * (1 - s));
    }
    if (eye.current) eye.current.scale.set(1, Math.max(0.05, l.eye * 0.9), 1);
    if (eyeMaterial.current) {
      const i = Math.min(PHASES.length - 1, Math.floor(l.phase));
      eyeColor.set(PHASES[i]?.eye ?? "#ffffff");
      eyeFrom.set(PHASES[Math.min(PHASES.length - 1, i + 1)]?.eye ?? "#ffffff");
      eyeMaterial.current.color.copy(eyeColor.lerp(eyeFrom, l.phase - i)).multiplyScalar(1.6 + flash * 3 + (p.weakSpotId === "maw" ? 1 : 0));
    }
    rings.current.forEach((ring, index) => {
      if (!ring) return;
      ring.visible = l.pull > 0.04;
      // Each ring slides from far out in front of the mouth into the throat, one behind another.
      const q = (l.pull * 2.2 + index / RINGS) % 1;
      const radius = 0.7 + 3.3 * (1 - q);
      ring.position.set(0, THROAT_Y, MOUTH_Z + 0.2 + 2.2 * (1 - q));
      ring.scale.set(radius * 0.95, radius * 1.15, 1);
      (ring.material as MeshBasicMaterial).opacity = Math.min(1, l.pull * 1.6) * Math.sin(q * Math.PI);
    });
    foam.current?.scale.setScalar(l.mouth * (1 - 0.35 * c));
  });

  return (
    <>
      <group ref={funnel}>
        <mesh geometry={parts.funnel} material={parts.body} frustumCulled={false} />
        <mesh position={[0, THROAT_Y, MOUTH_Z + 0.02]} scale={[MOUTH_RX * 0.99, MOUTH_RY * 0.99, 1]} geometry={parts.lip}>
          <meshStandardMaterial color="#d8f2f0" emissive="#3c9aa8" emissiveIntensity={0.35} flatShading roughness={0.4} />
        </mesh>
        <group ref={fangs}>
          <mesh geometry={parts.fangs}>
            <meshStandardMaterial color="#cfeff0" emissive="#3c9aa8" emissiveIntensity={0.55} flatShading roughness={0.35} />
          </mesh>
        </group>
        <group ref={eye} position={[0, THROAT_Y, -2.15]} visible={LOOK !== "a"}>
          <mesh geometry={parts.eye}>
            <meshBasicMaterial ref={eyeMaterial} color="#ffc24a" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.36]} scale={[0.1, 0.34, 0.06]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshBasicMaterial color="#05060a" />
          </mesh>
        </group>
      </group>
      {ALT && <LookParts look={ALT} live={latest} />}
      <group ref={crest}>
        <mesh geometry={parts.wave} material={parts.sheet} frustumCulled={false} />
      </group>
      <mesh ref={wallLeft} geometry={parts.wall} material={parts.sheet} position={[-WALL_X, -0.1, 1.4]} rotation={[0, 0.95, 0]} visible={false} frustumCulled={false} />
      <mesh ref={wallRight} geometry={parts.wall} material={parts.sheet} position={[WALL_X, -0.1, 1.4]} rotation={[0, -0.95, 0]} visible={false} frustumCulled={false} />
      <mesh ref={column} geometry={parts.column} material={parts.sheet} position={[0, THROAT_Y - 0.5, -0.3]} visible={false} frustumCulled={false} />
      {Array.from({ length: RINGS }, (_, index) => (
        <mesh key={index} ref={(ring) => { rings.current[index] = ring; }} geometry={parts.ring} visible={false}>
          <meshBasicMaterial color="#bff4ff" transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh ref={foam} geometry={parts.foam} material={parts.foamMat} position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      {high && (
        <Sparkles
          count={36 + props.phaseIndex * 28}
          scale={[7, 5, 4]}
          position={[0, 2.2, 0.4]}
          size={3.2}
          speed={0.9 + props.phaseIndex * 0.4}
          opacity={0.75}
          color="#dff6ff"
        />
      )}
    </>
  );
}
