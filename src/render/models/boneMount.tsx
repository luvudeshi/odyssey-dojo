// Parents a prop to a bone but undoes the bone's scale (GLB rigs often carry a 100x armature) so children are sized in metres.
// By default it also undoes the bone's rotation, so offsets are along world axes (+z toward the hero); `follow` keeps the bone's turn, for a club in a hand.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { ReactNode } from "react";
import { Quaternion, Vector3 } from "three";
import type { Group } from "three";

const scale = new Vector3();
const turn = new Quaternion();

export function BoneMount({ children, follow = false }: { children: ReactNode; follow?: boolean }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const mount = group.current;
    const parent = mount?.parent;
    if (!mount || !parent) return;
    parent.getWorldScale(scale);
    mount.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
    if (!follow) mount.quaternion.copy(parent.getWorldQuaternion(turn).invert());
  });
  return <group ref={group}>{children}</group>;
}
