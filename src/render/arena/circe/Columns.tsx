// The six marble Doric columns of Circe's portico (Victor Vina, CC-BY 3.0, see CREDITS.md). Same frame as hall.ts,
// so this sits inside the hall's group and the columns move back with it.
import { Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Vector3 } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ErrorBoundary } from "../../ErrorBoundary";
import { COLUMN_X, COLUMN_Z, PLATFORM_Y } from "./hall";

const URL = `${import.meta.env.BASE_URL}models/circe/doric.glb`;
const HEIGHT = 6.3;

/** One column scaled to HEIGHT metres, standing on the platform and centred on x and z. */
function Column({ x, yaw }: { x: number; yaw: number }) {
  const gltf = useGLTF(URL);
  const fitted = useMemo(() => {
    const root = clone(gltf.scene);
    root.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const scale = size.y > 1e-3 ? HEIGHT / size.y : 1;
    return { root, scale, offset: [-centre.x * scale, -box.min.y * scale, -centre.z * scale] as const };
  }, [gltf]);
  return (
    <group position={[x, PLATFORM_Y, COLUMN_Z]} rotation={[0, yaw, 0]}>
      <primitive object={fitted.root} scale={fitted.scale} position={fitted.offset} />
    </group>
  );
}

export function Columns() {
  return (
    <ErrorBoundary label="circe-columns" fallback={null}>
      <Suspense fallback={null}>
        {COLUMN_X.map((x, i) => <Column key={x} x={x} yaw={i} />)}
      </Suspense>
    </ErrorBoundary>
  );
}
