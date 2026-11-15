// Downloaded furniture for the owner's look comparison (?look=a, ?look=b), placed on top of the code-built hall.
// Look a: KayKit Dungeon Remastered (CC0): upright feast tables with stools, wall torches, shield banners, kegs.
// Look b: Poly Haven (CC0): a stone fire pit for the hearth and twelve real axes for the bow contest.
import { useGLTF } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import type { Object3D } from "three";
import { ErrorBoundary } from "../../ErrorBoundary";
import { HEARTH, axes } from "./layout";

const KK = "/models/suitors/kkd_";

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

function Safe(props: PieceProps) {
  return (
    <ErrorBoundary label="suitors-alt-prop" fallback={null}>
      <Suspense fallback={null}>
        <Piece {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

const HALF = Math.PI / 2;

/** Everything here stays clear of the fight zone (|x| < 4.6) and the camera's box. */
function KayKitHall() {
  const table = `${KK}table_long_tablecloth_decorated_A.glb`;
  return (
    <>
      {[-3.4, -8.4].map((z) => <Safe key={z} url={table} at={[-6.4, 0, z]} scale={0.62} />)}
      <Safe url={table} at={[-2.4, 0, -15.6]} turn={HALF} scale={0.62} />
      {[-2.4, -4.4, -6.4, -8.4, -10.4].map((z) => <Safe key={z} url={`${KK}stool.glb`} at={[-5.2, 0, z]} scale={0.9} />)}
      {[-3.4, -8.4].map((z) => <Safe key={z} url={`${KK}chair.glb`} at={[-7.8, 0, z]} turn={HALF} scale={0.9} />)}
      {[-1.5, -6.5, -11.5].map((z) => <Safe key={z} url={`${KK}torch_mounted.glb`} at={[-7.55, 2.9, z]} turn={HALF} scale={1.1} />)}
      {[-1.5, -6.5, -11.5].map((z) => <Safe key={"r" + String(z)} url={`${KK}torch_mounted.glb`} at={[7.55, 2.9, z]} turn={-HALF} scale={1.1} />)}
      {[-4, -9, -14].map((z) => <Safe key={"b" + String(z)} url={`${KK}banner_shield_red.glb`} at={[-10.9, 1.2, z]} turn={HALF} scale={0.9} />)}
      {[-4, -9, -14].map((z) => <Safe key={"c" + String(z)} url={`${KK}banner_shield_red.glb`} at={[10.9, 1.2, z]} turn={-HALF} scale={0.9} />)}
      <Safe url={`${KK}keg_decorated.glb`} at={[8.6, 0, -15.4]} turn={0.3} scale={0.42} />
      <Safe url={`${KK}keg_decorated.glb`} at={[-9.4, 0, -15.8]} turn={-0.2} scale={0.42} />
    </>
  );
}

function PolyHavenHall() {
  return (
    <>
      <Safe url="/models/suitors/ph/stone_fire_pit/stone_fire_pit_1k.gltf" at={[HEARTH.x, 0.19 * 2.3, HEARTH.z]} scale={2.3} />
      {axes().map(([x, , z], i) => <Safe key={i} url="/models/suitors/ph/wooden_axe/wooden_axe_1k.gltf" at={[x, 0.22 * 1.7, z]} turn={HALF} scale={1.7} />)}
    </>
  );
}

export function AltProps({ look }: { look: "a" | "b" }) {
  return look === "a" ? <KayKitHall /> : <PolyHavenHall />;
}
