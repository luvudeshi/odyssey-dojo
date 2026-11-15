// Circe, built from flat-shaded primitives about 2.9 m tall, facing +z. Her wand is in her right hand (the left of
// the screen), the cup in her left. Every arm and the body are driven by circePose, so each attack reads on screen.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, LatheGeometry, MathUtils, MeshBasicMaterial, MeshStandardMaterial, Vector2 } from "three";
import type { Group, Mesh, MeshStandardMaterialParameters } from "three";
import type { MonsterProps } from "../../../core/types";
import { nowSeconds } from "../../battle";
import { lookFor, SKIN } from "./palette";
import { circePose, newPose, POSE_KEYS } from "./pose";
import type { CirclePose } from "./pose";

const RED = new Color(1, 0.2, 0.1);
const LAMBDA = 11;
/** Larger than life: about 3.2 m beside the 1.8 m hero. */
const BODY_SCALE = 1.12;

const lathe = (points: readonly (readonly [number, number])[], segments: number): LatheGeometry =>
  new LatheGeometry(points.map(([r, y]) => new Vector2(r, y)), segments);

function flat(color: string, extra: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });
}

/** The glowing colour of her magic, shared so one lerp per frame recolours every orb, ring and arc. */
const MAGIC = new MeshBasicMaterial({ color: "#7dffb0", toneMapped: false });
const GLOW = new MeshBasicMaterial({ color: "#7dffb0", transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false, toneMapped: false });

const ROBE: readonly (readonly [number, number])[] = [
  [0.0, 0], [0.7, 0], [0.66, 0.2], [0.54, 0.8], [0.4, 1.35], [0.3, 1.6], [0.36, 1.85], [0.38, 2.05], [0.3, 2.22], [0.14, 2.32], [0, 2.34],
];
const HAIR_BACK: readonly (readonly [number, number])[] = [
  [0.0, 0.0], [0.2, 0.08], [0.34, 0.5], [0.3, 1.0], [0.16, 1.45], [0.0, 1.5],
];
const GOBLET: readonly (readonly [number, number])[] = [
  [0.0, 0], [0.09, 0], [0.03, 0.05], [0.03, 0.16], [0.14, 0.3], [0.15, 0.36], [0.0, 0.36],
];

function Arm({ side, pose, wand, cup, sleeve, trim }: { side: -1 | 1; pose: React.RefObject<CirclePose>; wand: boolean; cup: boolean; sleeve: MeshStandardMaterial; trim: MeshStandardMaterial }) {
  const upper = useRef<Group>(null);
  const fore = useRef<Group>(null);
  useFrame(() => {
    const p = pose.current;
    const out = wand ? p.wandOut : p.cupOut;
    const fwd = wand ? p.wandFwd : p.cupFwd;
    const elbow = wand ? p.wandElbow : p.cupElbow;
    upper.current?.rotation.set(-fwd, 0, side * out);
    fore.current?.rotation.set(-elbow, 0, 0);
  });
  return (
    <group ref={upper} position={[side * 0.36, 2.12, 0]}>
      <mesh position={[0, -0.28, 0]} material={sleeve}>
        <cylinderGeometry args={[0.1, 0.15, 0.6, 6]} />
      </mesh>
      <group ref={fore} position={[0, -0.58, 0]}>
        <mesh position={[0, -0.26, 0]} material={sleeve}>
          <cylinderGeometry args={[0.1, 0.2, 0.6, 6]} />
        </mesh>
        <mesh position={[0, -0.57, 0]}>
          <icosahedronGeometry args={[0.1, 0]} />
          <meshStandardMaterial color={SKIN} flatShading roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.02, 0]} material={trim}>
          <torusGeometry args={[0.12, 0.03, 4, 8]} />
        </mesh>
        {wand && <Wand pose={pose} />}
        {cup && <Cup pose={pose} />}
      </group>
    </group>
  );
}

function Wand({ pose }: { pose: React.RefObject<CirclePose> }) {
  const halo = useRef<Mesh>(null);
  const tip = useRef<Mesh>(null);
  useFrame(() => {
    const g = pose.current.wandGlow;
    const s = 0.1 + 0.08 * g;
    halo.current?.scale.setScalar(s * 2);
    tip.current?.scale.setScalar(0.07 + 0.05 * g);
  });
  return (
    <group position={[0, -0.57, 0]} rotation={[0.25, 0, 0]}>
      <mesh position={[0, -0.45, 0]}>
        <cylinderGeometry args={[0.018, 0.03, 1.1, 5]} />
        <meshStandardMaterial color="#6b3d1e" flatShading roughness={0.8} />
      </mesh>
      <mesh ref={tip} position={[0, -1.02, 0]}>
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#fffbe0" toneMapped={false} />
      </mesh>
      <mesh ref={halo} position={[0, -1.02, 0]}>
        <icosahedronGeometry args={[1, 2]} />
        <primitive object={GLOW} attach="material" />
      </mesh>
    </group>
  );
}

function Cup({ pose }: { pose: React.RefObject<CirclePose> }) {
  const liquid = useRef<Mesh>(null);
  const gob = useMemo(() => lathe(GOBLET, 8), []);
  useEffect(() => () => { gob.dispose(); }, [gob]);
  useFrame(() => {
    liquid.current?.scale.setScalar(1 + pose.current.cupGlow * 0.5);
  });
  return (
    <group position={[0, -0.6, 0]} rotation={[Math.PI, 0, 0]}>
      <mesh geometry={gob}>
        <meshStandardMaterial color="#e8c04a" metalness={0.5} roughness={0.35} flatShading side={DoubleSide} />
      </mesh>
      <mesh ref={liquid} position={[0, 0.33, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAGIC}>
        <circleGeometry args={[0.13, 8]} />
      </mesh>
    </group>
  );
}

export function CirceFigure(props: MonsterProps) {
  const pose = useRef<CirclePose>(newPose());
  const want = useRef<CirclePose>(newPose());
  const lean = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const hair = useRef<Group>(null);
  const root = useRef<Group>(null);
  const orb = useRef<Group>(null);
  const ring = useRef<Group>(null);
  const halo = useRef<Mesh>(null);
  const arcL = useRef<Mesh>(null);
  const arcR = useRef<Mesh>(null);
  const eyes = useRef<Group>(null);
  const mats = useMemo(
    () => ({
      robe: flat("#1f9a82", { side: DoubleSide }),
      trim: flat("#f0c24a", { metalness: 0.4, roughness: 0.4 }),
      hair: flat("#c4501f"),
      skin: flat(SKIN),
    }),
    [],
  );
  const live = useRef(props);
  useEffect(() => { live.current = props; });
  const robeGeo = useMemo(() => lathe(ROBE, 9), []);
  const hairGeo = useMemo(() => lathe(HAIR_BACK, 6), []);
  useEffect(() => () => { robeGeo.dispose(); hairGeo.dispose(); }, [robeGeo, hairGeo]);
  const tint = useMemo(() => new Color(), []);

  useFrame((_, delta) => {
    const p = live.current;
    const dt = Math.min(delta, 0.05);
    const t = nowSeconds();
    circePose(want.current, p, t);
    for (const key of POSE_KEYS) pose.current[key] = MathUtils.damp(pose.current[key], want.current[key], p.defeated || key === "drop" ? 5 : LAMBDA, dt);
    const c = pose.current;
    const look = lookFor(p.phaseIndex);
    const flash = p.hitFlash;
    for (const [mat, hex] of [[mats.robe, look.robe], [mats.trim, look.trim], [mats.hair, look.hair]] as const) {
      mat.color.lerp(tint.set(hex), 0.08);
    }
    for (const mat of Object.values(mats)) mat.emissive.set(RED).multiplyScalar(flash * 0.8);
    mats.hair.emissive.set(look.hair).multiplyScalar(0.5 * c.eyes).add(tint.copy(RED).multiplyScalar(flash * 0.5));
    root.current?.position.set(0, -c.drop, 0);
    lean.current?.rotation.set(c.bow, c.twist, c.lean);
    head.current?.rotation.set(c.nod, -c.twist * 0.6, -c.lean * 0.8);
    hair.current?.rotation.set(0.05 + c.orb * 0.25 + c.halo * 0.15, 0, 0);
    body.current?.scale.set(1, 1 + Math.sin(t * 1.7) * 0.008, 1);
    MAGIC.color.lerp(tint.set(look.magic), 0.15);
    GLOW.color.copy(MAGIC.color);
    const spin = t * (1.5 + c.orb * 3);
    if (orb.current) {
      orb.current.visible = c.orb > 0.02;
      orb.current.scale.setScalar(0.05 + c.orb * 0.7);
      orb.current.rotation.set(spin, spin * 0.7, 0);
    }
    if (ring.current) {
      ring.current.visible = c.ring > 0.02;
      ring.current.scale.setScalar(0.4 + c.ring * 0.9);
      ring.current.rotation.z = t * 0.9;
    }
    if (halo.current) {
      halo.current.visible = c.halo > 0.02;
      halo.current.scale.setScalar(0.3 + c.halo * 0.9);
      halo.current.rotation.z = t * 2;
    }
    for (const [ref, k, dir] of [[arcL, c.arcLeft, -1], [arcR, c.arcRight, 1]] as const) {
      const arc = ref.current;
      if (!arc) continue;
      arc.visible = k > 0.02;
      arc.scale.setScalar(0.4 + k * 0.9);
      arc.rotation.z = dir * (1.2 - k * 0.5);
    }
    if (eyes.current) eyes.current.scale.setScalar(1 + c.eyes * 0.6);
  });

  return (
    <group scale={BODY_SCALE}>
    <group ref={root}>
      <group ref={lean}>
        <group ref={body}>
          <mesh geometry={robeGeo} material={mats.robe} castShadow />
          <mesh position={[0, 1.58, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.trim}>
            <torusGeometry args={[0.31, 0.045, 4, 9]} />
          </mesh>
          <mesh position={[0, 2.22, 0.02]} rotation={[Math.PI / 2, 0, 0]} material={mats.trim}>
            <torusGeometry args={[0.23, 0.035, 4, 9]} />
          </mesh>
          <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.trim}>
            <torusGeometry args={[0.68, 0.035, 4, 9]} />
          </mesh>
          <Arm side={-1} pose={pose} wand cup={false} sleeve={mats.robe} trim={mats.trim} />
          <Arm side={1} pose={pose} wand={false} cup sleeve={mats.robe} trim={mats.trim} />
          <group ref={head} position={[0, 2.34, 0]}>
            <mesh position={[0, 0.07, 0]} material={mats.skin}>
              <cylinderGeometry args={[0.08, 0.1, 0.16, 6]} />
            </mesh>
            <mesh position={[0, 0.32, 0]} scale={[0.9, 1.08, 0.95]} material={mats.skin} castShadow>
              <icosahedronGeometry args={[0.22, 1]} />
            </mesh>
            <group ref={eyes} position={[0, 0.34, 0.2]}>
              {[-0.085, 0.085].map((x) => (
                <mesh key={x} position={[x, 0, 0.02]}>
                  <icosahedronGeometry args={[0.032, 0]} />
                  <primitive object={MAGIC} attach="material" />
                </mesh>
              ))}
            </group>
            <mesh position={[0, 0.25, 0.215]} material={mats.hair}>
              <boxGeometry args={[0.07, 0.012, 0.01]} />
            </mesh>
            <mesh position={[0, 0.4, -0.02]} scale={[1, 0.95, 1.04]} material={mats.hair} castShadow>
              <icosahedronGeometry args={[0.245, 1]} />
            </mesh>
            <mesh position={[0, 0.5, 0.02]} rotation={[0.35, 0, 0]} material={mats.trim}>
              <torusGeometry args={[0.2, 0.025, 4, 8, Math.PI]} />
            </mesh>
            <mesh position={[0, 0.58, 0.14]} material={mats.trim}>
              <octahedronGeometry args={[0.05, 0]} />
            </mesh>
            <group ref={hair} position={[0, 0.42, -0.1]} rotation={[0.05, 0, 0]}>
              <mesh geometry={hairGeo} position={[0, -1.35, 0]} material={mats.hair} castShadow />
            </group>
          </group>
          <mesh ref={halo} position={[0, 3.1, 0.05]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
            <torusGeometry args={[0.6, 0.05, 6, 20]} />
            <primitive object={MAGIC} attach="material" />
          </mesh>
        </group>
      </group>
      <group ref={orb} position={[0, 2.1, 1.05]} visible={false}>
        <mesh>
          <icosahedronGeometry args={[1, 1]} />
          <primitive object={GLOW} attach="material" />
        </mesh>
        <mesh>
          <torusGeometry args={[1.5, 0.08, 4, 16]} />
          <primitive object={MAGIC} attach="material" />
        </mesh>
      </group>
      <group ref={ring} position={[0, 0.06, 0.9]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <mesh>
          <torusGeometry args={[1.5, 0.07, 4, 24]} />
          <primitive object={MAGIC} attach="material" />
        </mesh>
        <mesh>
          <torusGeometry args={[0.9, 0.05, 4, 6]} />
          <primitive object={MAGIC} attach="material" />
        </mesh>
      </group>
      {([[arcL, -1], [arcR, 1]] as const).map(([ref, dir]) => (
        <mesh key={dir} ref={ref} position={[dir * 1.55, 2.3, 0.8]} rotation={[0, 0, dir * 1.2]} visible={false}>
          <torusGeometry args={[1.1, 0.09, 4, 14, 2.2]} />
          <primitive object={GLOW} attach="material" />
        </mesh>
      ))}
    </group>
    </group>
  );
}
