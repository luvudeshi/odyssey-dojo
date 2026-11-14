// Wraps whichever monster model is in the arena and gives it life: breathing and sway, a lunge toward the hero
// through the windup, a snap back, recoil when struck, a stagger between phases and a sink when it falls.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { ReactNode } from "react";
import { MathUtils } from "three";
import type { Group } from "three";
import { battle, calmMotion, nowSeconds } from "./battle";
import { MONSTER_Z } from "./cameraShots";
import { makeMotion, monsterMotion } from "./monsterMotion";
import type { MonsterMotion } from "./monsterMotion";

export function MonsterRig({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);
  const motion = useRef<MonsterMotion | null>(null);
  const advance = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const m = (motion.current ??= makeMotion());
    monsterMotion(m, battle, nowSeconds(), calmMotion());
    advance.current = MathUtils.damp(advance.current, m.advanceTarget, m.advanceLambda, dt);
    group.current?.position.set(m.x, m.y, MONSTER_Z + advance.current + m.z);
    group.current?.rotation.set(m.rx, 0, m.rz);
    group.current?.scale.set(1, m.sy, 1);
  });

  return <group ref={group} position={[0, 0, MONSTER_Z]}>{children}</group>;
}
