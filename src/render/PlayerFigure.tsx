// The player as a bronze figure seen from behind, driven straight from the webcam's 3D body points.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { RefObject } from "react";
import { Vector3 } from "three";
import type { Group, Mesh } from "three";
import type { Landmark, PoseFrame } from "../core/types";
import { JOINT, joint } from "../pose/signals";

const J = JOINT;
const BONES: readonly (readonly [number, number])[] = [
  [J.leftShoulder, J.rightShoulder], [J.leftShoulder, J.leftElbow], [J.leftElbow, J.leftWrist],
  [J.rightShoulder, J.rightElbow], [J.rightElbow, J.rightWrist], [J.leftShoulder, J.leftHip],
  [J.rightShoulder, J.rightHip], [J.leftHip, J.rightHip], [J.leftHip, J.leftKnee],
  [J.leftKnee, J.leftAnkle], [J.rightHip, J.rightKnee], [J.rightKnee, J.rightAnkle],
];
const HIP_HEIGHT = 0.95;
const UP = new Vector3(0, 1, 0);

// MediaPipe's y points down and its origin is the hips; lift the figure so its feet touch the floor.
function place(target: Vector3, point: Landmark): Vector3 {
  return target.set(point.x, HIP_HEIGHT - point.y, point.z);
}

export function PlayerFigure({ poseRef }: { poseRef: RefObject<PoseFrame | null> }) {
  const bones = useRef<(Mesh | null)[]>([]);
  const head = useRef<Mesh>(null);
  const figure = useRef<Group>(null);
  const scratch = useRef({ a: new Vector3(), b: new Vector3(), dir: new Vector3() });

  useFrame(() => {
    const frame = poseRef.current;
    if (!frame) return;
    if (figure.current) figure.current.visible = true;
    const { a, b, dir } = scratch.current;
    BONES.forEach(([from, to], index) => {
      const mesh = bones.current[index];
      if (!mesh) return;
      place(a, joint(frame.world, from));
      place(b, joint(frame.world, to));
      dir.subVectors(b, a);
      mesh.position.addVectors(a, b).multiplyScalar(0.5);
      mesh.scale.set(1, Math.max(dir.length(), 0.001), 1);
      mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    });
    if (head.current) place(head.current.position, joint(frame.world, J.nose));
  });

  return (
    <group ref={figure} position={[0, 0, 1.2]} visible={false}>
      {BONES.map((_, index) => (
        <mesh key={index} ref={(mesh) => { bones.current[index] = mesh; }}>
          <cylinderGeometry args={[0.045, 0.045, 1, 8]} />
          <meshStandardMaterial color="#c8963c" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
      <mesh ref={head} position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#c8963c" metalness={0.8} roughness={0.35} />
      </mesh>
    </group>
  );
}
