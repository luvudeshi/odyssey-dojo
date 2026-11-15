// The downloaded scenery for the strait's ?look= alternates: real rocks, ships and trees from open packs, and for
// look "a" three's own Water and Sky objects. Each piece is placed and sized by hand; see docs/models/charybdis.md.
import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import { DataTexture, PlaneGeometry, RepeatWrapping, RGBAFormat, UVMapping, LinearFilter, Vector3 } from "three";
import { Sky as SkyObject } from "three/examples/jsm/objects/Sky.js";
import { Water as WaterObject } from "three/examples/jsm/objects/Water.js";
import { ErrorBoundary } from "../../ErrorBoundary";
import { Glb } from "../../monsters/charybdis/Glb";
import { SEA_Y, SUN_DIR } from "./layout";
import { waterNormalBytes } from "./waterNormals";

type Vec3 = readonly [number, number, number];

interface Piece {
  readonly url: string;
  readonly size: number;
  readonly at: Vec3;
  readonly rot?: Vec3;
  readonly by?: "height" | "longest";
  readonly node?: string;
  readonly tint?: string;
}

const Q = "/models/charybdis/";
const DUSK = "#9a8fb0";
const WARM = "#c9a58a";

// Look a: low-poly Quaternius rocks stacked into sea stacks, a tree on the fig rock, two ships broken on the water.
const PIECES_A: readonly Piece[] = [
  { url: `${Q}Rock_4.glb`, size: 7, at: [-9.5, -1, -10.5], rot: [0, 0.6, 0], tint: DUSK },
  { url: `${Q}Rock_6.glb`, size: 4.6, at: [-6.2, -1, -9], rot: [0, 2.1, 0], tint: DUSK },
  { url: `${Q}Rock_Moss_4.glb`, size: 5.2, at: [-13, -1, -8], rot: [0, 4, 0], tint: DUSK },
  { url: `${Q}CommonTree_5.glb`, size: 5.2, at: [-9.8, 3.6, -10.8], rot: [0.14, 0.5, -0.12], by: "height" },
  { url: `${Q}Rock_6.glb`, size: 22, at: [17, -2, -26], rot: [0, 0.4, 0], tint: DUSK },
  { url: `${Q}Rock_4.glb`, size: 34, at: [28, -3, -40], rot: [0, 2.6, 0], tint: DUSK },
  { url: `${Q}Rock_Moss_4.glb`, size: 26, at: [40, -3, -30], rot: [0, 1.1, 0], tint: DUSK },
  { url: `${Q}Rock_4.glb`, size: 30, at: [-34, -3, -44], rot: [0, 4.4, 0], tint: DUSK },
  { url: `${Q}Viking_boat.glb`, size: 7.5, at: [-14, -0.9, -1.5], rot: [0.12, 0.9, 0.55], tint: WARM },
  { url: `${Q}Sail_ship.glb`, size: 15, at: [13, -2.1, -13], rot: [-0.22, -0.7, 0.4], tint: WARM },
  { url: `${Q}Viking_boat.glb`, size: 6, at: [6, -1, -24], rot: [0.3, 2.2, -0.35], tint: WARM },
];

// Look b: scanned Poly Haven moss rocks for the fig rock and the cliffs, with a dead tree and one wrecked ship.
const PH = `${Q}rocks/rock_moss_set_01.gltf`;
const PIECES_B: readonly Piece[] = [
  { url: PH, node: "rock_moss_set_01_rock01", size: 8, at: [-9.5, -1.2, -10.5], rot: [0, 0.4, 0] },
  { url: PH, node: "rock_moss_set_01_rock03", size: 5.5, at: [-5.8, -1, -8.6], rot: [0, 2.2, 0] },
  { url: PH, node: "rock_moss_set_01_rock05", size: 6, at: [-13.5, -1.2, -7.5], rot: [0, 3.9, 0] },
  { url: `${Q}CommonTree_Dead_3.glb`, size: 6, at: [-9.8, 4.2, -10.8], rot: [0.12, 0.5, -0.2], by: "height", tint: "#8a7a78" },
  { url: PH, node: "rock_moss_set_01_rock02", size: 26, at: [17, -3, -26], rot: [0, 0.4, 0] },
  { url: PH, node: "rock_moss_set_01_rock04", size: 38, at: [29, -4, -40], rot: [0, 2.6, 0] },
  { url: PH, node: "rock_moss_set_01_rock06", size: 30, at: [42, -4, -30], rot: [0, 1.1, 0] },
  { url: PH, node: "rock_moss_set_01_rock01", size: 34, at: [-34, -4, -44], rot: [0, 4.4, 0] },
  { url: `${Q}Sail_ship.glb`, size: 14, at: [-13, -2, -2], rot: [-0.2, 1.0, 0.45], tint: WARM },
];

export function Scenery({ look }: { look: "a" | "b" }) {
  return (
    <ErrorBoundary label="charybdis-look-scenery" fallback={null}>
      {(look === "a" ? PIECES_A : PIECES_B).map((piece, index) => (
        <Suspense key={index} fallback={null}>
          <Glb url={piece.url} size={piece.size} position={piece.at} {...(piece.rot ? { rotation: piece.rot } : {})} {...(piece.by ? { by: piece.by } : {})} {...(piece.node ? { node: piece.node } : {})} {...(piece.tint ? { tint: piece.tint } : {})} />
        </Suspense>
      ))}
    </ErrorBoundary>
  );
}

type Uniforms = Record<string, { value: unknown }>;

function setUniform(uniforms: Uniforms, name: string, value: unknown): void {
  const slot = uniforms[name];
  if (slot) slot.value = value;
}

function addToUniform(uniforms: Uniforms, name: string, by: number): void {
  const slot = uniforms[name];
  if (slot && typeof slot.value === "number") slot.value += by;
}

/** Look a's sea and sky: three's Water (mirror and sun glints from a procedural normal map) under its physical Sky. */
export function SeaAndSky() {
  const { water, sky } = useMemo(() => {
    const normals = new DataTexture(waterNormalBytes(256), 256, 256, RGBAFormat);
    normals.wrapS = RepeatWrapping;
    normals.wrapT = RepeatWrapping;
    normals.mapping = UVMapping;
    normals.magFilter = LinearFilter;
    normals.minFilter = LinearFilter;
    normals.needsUpdate = true;
    const sun = new Vector3(...SUN_DIR).normalize();
    const w = new WaterObject(new PlaneGeometry(1200, 1200), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: sun,
      sunColor: 0xc07040,
      waterColor: 0x0a2c36,
      distortionScale: 4.5,
    });
    w.rotation.x = -Math.PI / 2;
    w.position.set(0, SEA_Y, -8);
    setUniform(w.material.uniforms, "size", 14);
    const s = new SkyObject();
    s.scale.setScalar(900);
    const u = s.material.uniforms;
    setUniform(u, "turbidity", 3);
    setUniform(u, "rayleigh", 0.35);
    setUniform(u, "mieCoefficient", 0.0015);
    setUniform(u, "mieDirectionalG", 0.6);
    setUniform(u, "cloudCoverage", 0.62);
    setUniform(u, "cloudDensity", 0.55);
    // The sky's sun sits high on the left, out of the way of the whirlpool, so its glare cannot wash out the fight.
    setUniform(u, "sunPosition", new Vector3(-0.75, 0.3, -0.5));
    return { water: w, sky: s };
  }, []);
  useFrame((_, delta) => {
    addToUniform(water.material.uniforms, "time", Math.min(delta, 0.05) * 0.6);
  });
  return (
    <>
      <primitive object={sky} />
      <primitive object={water} />
    </>
  );
}
