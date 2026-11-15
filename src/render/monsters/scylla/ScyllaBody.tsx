// Scylla's six necks and heads, drawn from pose.ts and moved each frame by animate.ts. The necks are one instanced mesh
// of tapered segments; each head is a skull, a hinged jaw and a pair of glowing eyes. No React re-render per frame.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConeGeometry, CylinderGeometry } from "three";
import type { MonsterProps } from "../../../core/types";
import {
  PHASES, SEG, animate, bindGroup, bindHead, bindJaw, bindNecks, bindSpikes, disposeRig, headGeometry, makeRig, paintNecks,
} from "./animate";
import { NECK_COUNT } from "./pose";

/** Used if the real body fails to build: one plain neck, so the fight goes on. */
export function ScyllaStandIn({ phaseIndex }: Pick<MonsterProps, "phaseIndex">) {
  return (
    <mesh position={[0.6, 4, -8]} scale={[1, 1 + phaseIndex * 0.1, 1]}>
      <cylinderGeometry args={[0.6, 0.9, 8, 8]} />
      <meshStandardMaterial color={PHASES[0].skin} flatShading />
    </mesh>
  );
}

export function ScyllaBody(props: MonsterProps) {
  const [rig] = useState(makeRig);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });
  const phase = Math.min(PHASES.length - 1, Math.max(0, props.phaseIndex));
  const segment = useMemo(() => new CylinderGeometry(0.86, 1, 1, 6, 1), []);
  const spike = useMemo(() => new ConeGeometry(0.1, 0.36, 4), []);
  useEffect(() => () => { segment.dispose(); spike.dispose(); disposeRig(rig); }, [rig, segment, spike]);
  useEffect(() => { paintNecks(rig, phase, props.defeated); }, [rig, phase, props.defeated]);
  useFrame((_, delta) => { animate(rig, latest.current, delta); });

  const heads = headGeometry(rig, phase);
  if (!heads) return null;
  return (
    <group ref={(g) => { bindGroup(rig, g); }} matrixAutoUpdate={false}>
      <instancedMesh ref={(m) => { bindNecks(rig, m); }} args={[segment, rig.neckMaterial, NECK_COUNT * SEG]} frustumCulled={false} castShadow receiveShadow />
      <instancedMesh ref={(m) => { bindSpikes(rig, m); }} args={[spike, rig.spikeMaterial, NECK_COUNT * (SEG / 2)]} frustumCulled={false} visible={false} castShadow />
      {Array.from({ length: NECK_COUNT }, (_, i) => (
        <group key={i} ref={(g) => { bindHead(rig, i, g); }}>
          <mesh geometry={heads.skull} material={rig.skinMaterial} castShadow />
          <group ref={(g) => { bindJaw(rig, i, g); }} position={[0, -0.14, 0.1]}>
            <mesh geometry={heads.jaw} material={rig.skinMaterial} castShadow />
          </group>
          <mesh geometry={heads.eyes} material={rig.eyeMaterial} />
        </group>
      ))}
    </group>
  );
}
