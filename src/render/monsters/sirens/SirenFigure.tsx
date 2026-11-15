// One bird-woman: the merged parts from parts.ts on a small rig of groups, posed every frame by sirenPose.
// Her look changes with the fight's phase (violet and gold, then restless, then dark with red eyes), she flashes
// red when hit, and the song leaves her throat as rings and notes of light (SongRings).
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, MeshStandardMaterial } from "three";
import type { Group, Mesh } from "three";
import type { MonsterProps } from "../../../core/types";
import { eyeGeometry, foreArmGeometry, headGeometry, legGeometry, mouthGeometry, bodyGeometry, tailGeometry, torsoGeometry, upperArmGeometry, wingGeometry, COLORS, SIREN } from "./parts";
import { setProps } from "./geo";
import { makePose, sirenPose } from "./pose";
import { SongRings } from "./SongRings";
import { PHASE_LOOKS } from "./looks";

const geometries = (() => {
  let built: {
    body: ReturnType<typeof bodyGeometry>; tail: ReturnType<typeof tailGeometry>; leg: ReturnType<typeof legGeometry>;
    torso: ReturnType<typeof torsoGeometry>; head: ReturnType<typeof headGeometry>; upper: ReturnType<typeof upperArmGeometry>;
    fore: ReturnType<typeof foreArmGeometry>; wing: ReturnType<typeof wingGeometry>; eye: ReturnType<typeof eyeGeometry>;
    mouth: ReturnType<typeof mouthGeometry>;
  } | null = null;
  return () => (built ??= {
    body: bodyGeometry(), tail: tailGeometry(), leg: legGeometry(), torso: torsoGeometry(), head: headGeometry(),
    upper: upperArmGeometry(), fore: foreArmGeometry(), wing: wingGeometry(), eye: eyeGeometry(), mouth: mouthGeometry(),
  });
})();

const FALLEN = new Color("#8d8296");
const HIT = new Color(1, 0.18, 0.06);

export interface SirenFigureProps extends MonsterProps {
  readonly lead: boolean;
  readonly position?: readonly [number, number, number];
  readonly scale?: number;
  readonly yaw?: number;
  /** Seconds added to the idle clock so two Sirens do not flutter in step. */
  readonly offset?: number;
}

export function SirenFigure(props: SirenFigureProps) {
  const g = geometries();
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });
  const pose = useRef(makePose());
  const body = useMemo(() => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82 }), []);
  const eyes = useMemo(() => new MeshStandardMaterial({ color: "#2a1020", emissive: new Color("#ffd070"), emissiveIntensity: 2, toneMapped: false }), []);
  const mouth = useMemo(() => new MeshStandardMaterial({ color: COLORS.mouth, roughness: 1, flatShading: true }), []);
  useEffect(() => () => { body.dispose(); eyes.dispose(); mouth.dispose(); }, [body, eyes, mouth]);

  const bodyG = useRef<Group>(null);
  const tailG = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const torsoG = useRef<Group>(null);
  const headG = useRef<Group>(null);
  const mouthM = useRef<Mesh>(null);
  const eyeR = useRef<Mesh>(null);
  const eyeL = useRef<Mesh>(null);
  const armR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const foreR = useRef<Group>(null);
  const foreL = useRef<Group>(null);
  const wingR = useRef<Group>(null);
  const wingL = useRef<Group>(null);
  const tint = useRef(new Color("#ffffff"));
  const eyeTint = useRef(new Color("#ffd070"));

  useFrame((state, delta) => {
    const p = latest.current;
    const time = state.clock.elapsedTime + (p.offset ?? 0);
    const s = sirenPose(pose.current, {
      windup: p.windup, attackId: p.attackId, defeated: p.defeated, phaseIndex: p.phaseIndex, hitFlash: p.hitFlash, time, lead: p.lead,
    });
    const k = 1 - Math.exp(-delta * 3);
    const look = PHASE_LOOKS[Math.min(p.phaseIndex, PHASE_LOOKS.length - 1)] ?? PHASE_LOOKS[0];
    tint.current.lerp(p.defeated ? FALLEN : look.tint, k);
    eyeTint.current.lerp(look.eye, k);
    body.color.copy(tint.current);
    body.emissive.copy(HIT).multiplyScalar(1.6 * p.hitFlash);
    eyes.emissive.copy(eyeTint.current);
    setProps(eyes, { emissiveIntensity: s.eyesOpen ? 2 + s.song * 2 + p.hitFlash * 3 : 0 });

    bodyG.current?.position.set(s.x, s.y, s.z);
    bodyG.current?.rotation.set(s.lean, 0, s.roll);
    tailG.current?.rotation.set(Math.sin(time * 1.1) * 0.08 - s.lean * 0.5, Math.sin(time * 0.7) * 0.1, 0);
    for (const leg of [legR.current, legL.current]) {
      leg?.rotation.set(s.legSwing, 0, 0);
      leg?.scale.set(leg.scale.x < 0 ? -1 : 1, 1 - 0.8 * s.legFold, 1);
      if (leg) leg.position.y = SIREN.hip[1] - s.legFold * 0.35;
    }
    torsoG.current?.rotation.set(s.torsoBend, 0, 0);
    headG.current?.rotation.set(s.headX, s.headY, 0);
    mouthM.current?.scale.set(1.1, 0.2 + s.mouth * 1.3, 0.6);
    for (const eye of [eyeR.current, eyeL.current]) eye?.scale.set(1, s.eyesOpen ? 1 : 0.12, 1);
    armR.current?.rotation.set(-s.armFwd, 0, s.armOutR);
    armL.current?.rotation.set(-s.armFwd, 0, -s.armOutL);
    foreR.current?.rotation.set(-s.elbow, 0, 0);
    foreL.current?.rotation.set(-s.elbow, 0, 0);
    wingR.current?.rotation.set(0, -s.cupR, s.wingR);
    wingR.current?.scale.setScalar(s.spanR);
    wingL.current?.rotation.set(0, s.cupL, -s.wingL);
    wingL.current?.scale.set(-s.spanL, s.spanL, s.spanL);
  });

  const [px, py, pz] = props.position ?? [0, 0, 0];
  const claws = SIREN.hip;
  return (
    <group position={[px, py, pz]} rotation={[0, props.yaw ?? 0, 0]} scale={props.scale ?? 1}>
      <group ref={bodyG}>
        <mesh geometry={g.body} material={body} castShadow />
        <group ref={tailG} position={[0, 1.4, -1.05]}>
          <mesh geometry={g.tail} material={body} castShadow />
        </group>
        <group ref={legR} position={[claws[0], claws[1], claws[2]]}>
          <mesh geometry={g.leg} material={body} castShadow />
        </group>
        <group ref={legL} position={[-claws[0], claws[1], claws[2]]} scale={[-1, 1, 1]}>
          <mesh geometry={g.leg} material={body} castShadow />
        </group>
        <group ref={torsoG} position={[...SIREN.torsoPivot]}>
          <mesh geometry={g.torso} material={body} castShadow />
          <group ref={headG} position={[...SIREN.headPivot]}>
            <mesh geometry={g.head} material={body} castShadow />
            <mesh ref={eyeR} geometry={g.eye} material={eyes} position={[0.1, 0.38, 0.27]} />
            <mesh ref={eyeL} geometry={g.eye} material={eyes} position={[-0.1, 0.38, 0.27]} />
            <mesh ref={mouthM} geometry={g.mouth} material={mouth} position={[...SIREN.mouth]} />
          </group>
          <group ref={armR} position={[SIREN.shoulderX, SIREN.shoulderY, 0.02]}>
            <mesh geometry={g.upper} material={body} castShadow />
            <group ref={foreR} position={[0, -0.7, 0]}>
              <mesh geometry={g.fore} material={body} castShadow />
            </group>
          </group>
          <group ref={armL} position={[-SIREN.shoulderX, SIREN.shoulderY, 0.02]}>
            <mesh geometry={g.upper} material={body} castShadow />
            <group ref={foreL} position={[0, -0.7, 0]}>
              <mesh geometry={g.fore} material={body} castShadow />
            </group>
          </group>
          <group ref={wingR} position={[...SIREN.wingPivot]}>
            <mesh geometry={g.wing} material={body} castShadow />
          </group>
          <group ref={wingL} position={[-SIREN.wingPivot[0], SIREN.wingPivot[1], SIREN.wingPivot[2]]} scale={[-1, 1, 1]}>
            <mesh geometry={g.wing} material={body} castShadow />
          </group>
        </group>
      </group>
      <SongRings pose={pose} phaseIndex={props.phaseIndex} />
    </group>
  );
}
