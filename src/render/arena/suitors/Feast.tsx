// Downloaded hall furniture, standing on top of the code-built hall: upright feast tables with food, stools and chairs
// (KayKit Dungeon Remastered, CC0) and the twelve real axes for the bow contest (Poly Haven Wooden Axe, CC0).
import { useGLTF } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import type { Object3D } from "three";
import { ErrorBoundary } from "../../ErrorBoundary";
import { CHAIRS, STOOLS, TABLES, axes } from "./layout";

const KK = "/models/suitors/kkd_";
const AXE = "/models/suitors/ph/wooden_axe/wooden_axe_1k.gltf";
const HALF = Math.PI / 2;
const TABLE_SCALE = 0.62;
/** The axe's own origin is its middle: this much of it sits below, so lift it to stand the butt on the floor. */
const AXE_SCALE = 1.7;
const AXE_BELOW = 0.22;

interface PieceProps {
  readonly url: string;
  readonly at: readonly [number, number, number];
  readonly turn?: number;
  readonly scale?: number;
}

function Piece({ url, at, turn = 0, scale = 1 }: PieceProps) {
  const gltf = useGLTF(url);
  const copy = useMemo((): Object3D => {
    const c = gltf.scene.clone();
    c.traverse((n) => { const m = n as { isMesh?: boolean; castShadow: boolean; receiveShadow: boolean }; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return c;
  }, [gltf]);
  return <primitive object={copy} position={[...at]} rotation={[0, turn, 0]} scale={scale} />;
}

/** A piece that fails to load simply leaves a gap: the code-built hall still stands. */
function Safe(props: PieceProps) {
  return (
    <ErrorBoundary label="suitors-feast-prop" fallback={null}>
      <Suspense fallback={null}>
        <Piece {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

export function Feast() {
  return (
    <>
      {TABLES.map((t) => <Safe key={`t${String(t.z)}`} url={`${KK}table_long_tablecloth_decorated_A.glb`} at={[t.x, 0, t.z]} turn={t.yaw} scale={TABLE_SCALE} />)}
      {STOOLS.map((s) => <Safe key={`s${String(s.z)}`} url={`${KK}stool.glb`} at={[s.x, 0, s.z]} scale={0.9} />)}
      {[-4.4, -8.4].map((z) => <Safe key={`p${String(z)}`} url={`${KK}plate_food_A.glb`} at={[-5.2, 0.45, z]} scale={0.3} />)}
      {CHAIRS.map((c) => <Safe key={`c${String(c.z)}`} url={`${KK}chair.glb`} at={[c.x, 0, c.z]} turn={HALF} scale={0.9} />)}
      {axes().map(([x, , z]) => <Safe key={`a${String(z)}`} url={AXE} at={[x, AXE_BELOW * AXE_SCALE, z]} turn={HALF} scale={AXE_SCALE} />)}
    </>
  );
}
