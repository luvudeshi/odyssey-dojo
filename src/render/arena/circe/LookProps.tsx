// Downloaded props for the alternate looks of Circe's courtyard (?look=a and ?look=b): forest trees, tame wolves and
// pigs, columns. Every file is under public/models/circe and listed in docs/models/circe.md. Same frame as hall.ts.
import { Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Vector3 } from "three";
import type { Object3D } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { ClipDecision } from "../../models/clipMap";
import { RiggedModel } from "../../models/RiggedModel";
import { ErrorBoundary } from "../../ErrorBoundary";
import { COLUMN_X, COLUMN_Z, PLATFORM_Y } from "./hall";
import { PIGS, WOLVES, treeSpots } from "./yard";

export type CirceLook = "a" | "b";

const BASE = `${import.meta.env.BASE_URL}models/circe/`;
const STAND = new Box3();
const SIZE = new Vector3();

interface StaticProps {
  readonly file: string;
  readonly x: number;
  readonly y?: number;
  readonly z: number;
  readonly height: number;
  readonly yaw?: number;
}

/** A static GLB scaled to `height` metres and standing on y, centred on x and z. */
function Static({ file, x, y = 0, z, height, yaw = 0 }: StaticProps) {
  const gltf = useGLTF(BASE + file);
  const fitted = useMemo(() => {
    const root: Object3D = clone(gltf.scene);
    root.updateWorldMatrix(true, true);
    STAND.setFromObject(root);
    STAND.getSize(SIZE);
    const scale = SIZE.y > 1e-3 ? height / SIZE.y : 1;
    const centre = STAND.getCenter(new Vector3());
    return { root, scale, offset: [-centre.x * scale, -STAND.min.y * scale, -centre.z * scale] as const };
  }, [gltf, height]);
  return (
    <group position={[x, y, z]} rotation={[0, yaw, 0]}>
      <primitive object={fitted.root} scale={fitted.scale} position={fitted.offset} />
    </group>
  );
}

function idleOf(clip: string): (available: ReadonlySet<string>, out: ClipDecision) => ClipDecision {
  return (available, out) => {
    out.clip = available.has(clip) ? clip : null;
    out.loop = true;
    out.scrub = null;
    out.timeScale = 1;
    return out;
  };
}
const WOLF_IDLE = idleOf("AnimalArmature|Idle");
const PIG_IDLE = idleOf("Armature|Idle");

function Animals() {
  return (
    <>
      {WOLVES.map(([x, z, yaw], i) => (
        <group key={`w${String(i)}`} position={[x, 0, z]} rotation={[0, yaw, 0]}>
          <RiggedModel url={`${BASE}wolf.glb`} fit={{ targetHeight: 1.5 }} decide={WOLF_IDLE} />
        </group>
      ))}
      {PIGS.map(([x, z, yaw], i) => (
        <group key={`p${String(i)}`} position={[x, -0.12, z]} rotation={[0, yaw, 0]}>
          <RiggedModel url={`${BASE}pig.glb`} fit={{ targetHeight: 0.72 }} decide={PIG_IDLE} />
        </group>
      ))}
    </>
  );
}

const TREES: Record<CirceLook, readonly string[]> = {
  a: ["pine.glb", "pine.glb", "tree.glb", "willow.glb"],
  b: ["willow.glb", "tree.glb", "tree.glb", "pine.glb"],
};

function Forest({ look }: { look: CirceLook }) {
  const files = TREES[look];
  return (
    <>
      {treeSpots().map(([x, z, h], i) => (
        <Static key={`t${String(i)}`} file={files[i % files.length] ?? "pine.glb"} x={x} y={-0.12} z={z} height={h * 0.62} yaw={i * 1.7} />
      ))}
      {[[-6, 6.5], [7.5, 7], [-12, 1], [13, -2], [-3.5, -13.5], [3.5, -13.8]].map(([x, z], i) => (
        <Static key={`b${String(i)}`} file={i % 2 ? "rock.glb" : "bush.glb"} x={x ?? 0} y={-0.12} z={z ?? 0} height={i % 2 ? 1.1 : 1.3} yaw={i} />
      ))}
    </>
  );
}

/** The six columns of the portico, replacing the code-built ones. */
function Columns() {
  return (
    <>
      {COLUMN_X.map((x, i) => (
        <Static key={x} file="doric.glb" x={x} y={PLATFORM_Y} z={COLUMN_Z} height={6.3} yaw={i} />
      ))}
    </>
  );
}

/** Everything downloaded in the yard. If one file fails to load the rest of the courtyard still stands. */
export function LookProps({ look }: { look: CirceLook }) {
  return (
    <>
      <ErrorBoundary label="circe-look-animals" fallback={null}>
        <Suspense fallback={null}><Animals /></Suspense>
      </ErrorBoundary>
      <ErrorBoundary label="circe-look-forest" fallback={null}>
        <Suspense fallback={null}><Forest look={look} /></Suspense>
      </ErrorBoundary>
      <ErrorBoundary label="circe-look-columns" fallback={null}>
        <Suspense fallback={null}><Columns /></Suspense>
      </ErrorBoundary>
    </>
  );
}
