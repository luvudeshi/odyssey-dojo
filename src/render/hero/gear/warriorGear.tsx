// Hoplite gear for the "warrior" hero, built from primitives and parented to the mannequin's bones: a crested bronze
// helmet, a bronze cuirass, a crimson tunic skirt and cape, bronze greaves, a round shield on the left forearm and a
// spear that only appears while a spear move plays. Sizes are in metres (BoneMount-style scale compensation).
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { BoxGeometry, ConeGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, MathUtils, MeshStandardMaterial, Quaternion, Shape, ShapeGeometry, SphereGeometry, TorusGeometry, Vector3 } from "three";
import type { Group, Object3D } from "three";
import { battle, nowSeconds } from "../../battle";
import { strikeWindow } from "../heroClips";

const mat = (color: string, metalness: number, roughness: number, side = false): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, metalness, roughness, flatShading: true, side: side ? DoubleSide : 0 });

const BRONZE = mat("#c98a3a", 0.35, 0.5);
const CRIMSON = mat("#a8222c", 0, 0.85, true);
const WOOD = mat("#6b4a2b", 0, 0.9);
const LEATHER = mat("#4a2f1c", 0, 0.9);

function crestGeometry(): ExtrudeGeometry {
  // Side profile in (front-back, up): a fan that arches from the brow over the dome and down the back.
  const s = new Shape();
  s.moveTo(0.1, 0.1);
  s.quadraticCurveTo(0.12, 0.27, -0.02, 0.29);
  s.quadraticCurveTo(-0.17, 0.3, -0.24, 0.0);
  s.lineTo(-0.15, 0.06);
  s.quadraticCurveTo(-0.08, 0.17, 0.02, 0.17);
  s.quadraticCurveTo(0.08, 0.17, 0.1, 0.1);
  const g = new ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
  g.translate(0, 0, -0.02);
  g.rotateY(-Math.PI / 2); // profile x -> forward (+z), thickness -> across the head
  return g;
}

function capeGeometry(): ShapeGeometry {
  const s = new Shape();
  s.moveTo(-0.17, 0);
  s.lineTo(0.17, 0);
  s.lineTo(0.27, -0.74);
  s.lineTo(0.1, -0.7);
  s.lineTo(0, -0.78);
  s.lineTo(-0.1, -0.7);
  s.lineTo(-0.27, -0.74);
  s.closePath();
  return new ShapeGeometry(s);
}

const GEO = {
  dome: new SphereGeometry(0.135, 10, 8),
  neckGuard: new CylinderGeometry(0.14, 0.175, 0.07, 10, 1, true),
  cheek: new BoxGeometry(0.035, 0.15, 0.1),
  brow: new BoxGeometry(0.22, 0.035, 0.05),
  nose: new BoxGeometry(0.03, 0.12, 0.03),
  crest: crestGeometry(),
  cuirass: new CylinderGeometry(0.17, 0.145, 0.46, 10, 1),
  skirt: new CylinderGeometry(0.17, 0.27, 0.34, 10, 1, true),
  strap: new CylinderGeometry(0.075, 0.075, 0.07, 8),
  greave: new CylinderGeometry(0.07, 0.052, 0.31, 8, 1),
  cape: capeGeometry(),
  disc: new CylinderGeometry(0.34, 0.34, 0.035, 18),
  rim: new TorusGeometry(0.34, 0.025, 5, 18),
  emblem: new CylinderGeometry(0.2, 0.2, 0.045, 12),
  boss: new SphereGeometry(0.07, 8, 6),
  shaft: new CylinderGeometry(0.017, 0.017, 2.1, 6),
  tip: new ConeGeometry(0.04, 0.26, 4),
  butt: new ConeGeometry(0.02, 0.1, 5),
};

const UP = new Vector3(0, 1, 0);
const AXIS = new Vector3();
const TURN = new Quaternion();
const SCALE = new Vector3();
const AIM = new Quaternion();
const TILT = new Quaternion().setFromUnitVectors(UP, new Vector3(0, 0.15, 1).normalize());

/** The top of the cloned model (the glTF scene): the frame every bit of gear is measured in. */
function sceneOf(node: Object3D): Object3D {
  let n = node;
  while (n.parent && n.name !== "Scene") n = n.parent;
  return n;
}

/** Where `bone` points in the model's own frame (+z forward, +y up, +x the character's left) before any clip moves it. */
function boneTurn(bone: Object3D, scene: Object3D, out: Quaternion): Quaternion {
  out.identity();
  for (let n: Object3D | null = bone; n && n !== scene; n = n.parent) out.premultiply(n.quaternion);
  return out;
}

/**
 * Parents gear to a bone but builds it in the model's frame, whatever the rig's bone axes are. The bind pose gives
 * the frame (this runs before the first clip frame), after that the gear turns with the bone. `place` gets the inner
 * group and the direction the bone points in that frame, to hang a shield or a spear along a limb.
 */
function Framed({ children, place }: { children: ReactNode; place?: (inner: Group, along: Vector3) => void }) {
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  useLayoutEffect(() => {
    const g = outer.current;
    const bone = g?.parent;
    if (!g || !bone || !inner.current) return;
    boneTurn(bone, sceneOf(bone), TURN);
    AXIS.copy(UP).applyQuaternion(TURN);
    place?.(inner.current, AXIS);
    g.quaternion.copy(TURN.invert());
  }, [place]);
  useFrame(() => {
    const g = outer.current;
    if (!g?.parent) return;
    g.parent.getWorldScale(SCALE);
    g.scale.set(1 / SCALE.x, 1 / SCALE.y, 1 / SCALE.z);
  });
  return (
    <group ref={outer}>
      <group ref={inner}>{children}</group>
    </group>
  );
}

function Helmet() {
  return (
    <Framed>
      <group position={[0, 0.11, 0.005]}>
        <mesh geometry={GEO.dome} material={BRONZE} scale={[1, 1.1, 1.18]} castShadow />
        <mesh geometry={GEO.neckGuard} material={BRONZE} position={[0, -0.075, -0.02]} castShadow />
        <mesh geometry={GEO.cheek} material={BRONZE} position={[0.115, -0.045, 0.085]} castShadow />
        <mesh geometry={GEO.cheek} material={BRONZE} position={[-0.115, -0.045, 0.085]} castShadow />
        <mesh geometry={GEO.brow} material={BRONZE} position={[0, 0.03, 0.13]} castShadow />
        <mesh geometry={GEO.nose} material={BRONZE} position={[0, -0.03, 0.135]} castShadow />
        <mesh geometry={GEO.crest} material={CRIMSON} position={[0, 0.07, 0.0]} castShadow />
      </group>
    </Framed>
  );
}

function Cuirass() {
  return (
    <Framed>
      <mesh geometry={GEO.cuirass} material={BRONZE} position={[0, 0.04, 0.0]} scale={[1.2, 1, 0.78]} castShadow />
    </Framed>
  );
}

function Skirt() {
  return (
    <Framed>
      <mesh geometry={GEO.skirt} material={CRIMSON} position={[0, -0.1, 0]} scale={[1.05, 1, 0.9]} castShadow />
      <mesh geometry={GEO.strap} material={LEATHER} position={[0, 0.05, 0]} scale={[2.4, 1, 1.7]} />
    </Framed>
  );
}

function Greave() {
  return (
    <Framed>
      <mesh geometry={GEO.greave} material={BRONZE} position={[0, -0.2, 0.012]} scale={[1, 1, 1.1]} castShadow />
    </Framed>
  );
}

function Cape() {
  const sway = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (sway.current) sway.current.rotation.x = 0.1 + Math.sin(clock.elapsedTime * 1.6) * 0.03;
  });
  return (
    <Framed>
      <group ref={sway} position={[0, 0.3, -0.135]}>
        <mesh geometry={GEO.cape} material={CRIMSON} castShadow />
      </group>
    </Framed>
  );
}

/** A round bronze shield on the left forearm, face to the front whichever way the arm is bent. */
function Shield() {
  const place = (inner: Group, along: Vector3): void => {
    inner.position.copy(along).multiplyScalar(0.16);
    inner.position.z += 0.085;
  };
  return (
    <Framed place={place}>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh geometry={GEO.disc} material={BRONZE} castShadow />
        <mesh geometry={GEO.emblem} material={CRIMSON} position={[0, 0.005, 0]} />
      </group>
      <mesh geometry={GEO.rim} material={BRONZE} castShadow />
      <mesh geometry={GEO.boss} material={BRONZE} position={[0, 0, 0.04]} scale={[1, 1, 0.6]} />
    </Framed>
  );
}

const SPEAR_MOVES: ReadonlySet<string> = new Set(["spear_thrust", "overhead_strike", "stake_thrust"]);
const SPEAR_TAIL = 0.25;
const SPEAR_STRIKE = { seconds: 0.7, hit: 0.4 };

/** The spear along the right fist, shown for the length of a spear move, so the fist stays free for punches. */
function Spear() {
  const group = useRef<Group>(null);
  const place = (inner: Group, along: Vector3): void => {
    inner.quaternion.setFromUnitVectors(UP, along);
  };
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const phase = battle.state?.phase;
    const finisher = phase?.kind === "finisher";
    const since = nowSeconds() - battle.struckAt;
    g.visible = finisher || (SPEAR_MOVES.has(battle.struckMove) && since < strikeWindow(SPEAR_STRIKE) + SPEAR_TAIL);
    // Whatever the wrist does, the spear points at the giant, a little up: aim it in the model's own frame.
    const parent = g.parent;
    if (!g.visible || !parent) return;
    sceneOf(g).getWorldQuaternion(AIM).multiply(TILT);
    parent.getWorldQuaternion(TURN).invert();
    g.quaternion.copy(TURN.multiply(AIM));
  });
  return (
    <Framed place={place}>
      <group ref={group} visible={false}>
        <mesh geometry={GEO.shaft} material={WOOD} position={[0, 0.45, 0]} castShadow />
        <mesh geometry={GEO.tip} material={BRONZE} position={[0, 1.63, 0]} castShadow />
        <mesh geometry={GEO.butt} material={BRONZE} position={[0, -0.65, 0]} rotation={[Math.PI, 0, 0]} />
      </group>
    </Framed>
  );
}

const LEAN = 0.42;

/** No side-step clip in the pack: while a dodge key is held the whole body leans that way about the feet. */
function Lean() {
  const root = useRef<Group>(null);
  useFrame((_, delta) => {
    const bone = root.current?.parent;
    if (!bone) return;
    const scene = sceneOf(bone);
    const side = (battle.held.has("dodge_right") ? 1 : 0) - (battle.held.has("dodge_left") ? 1 : 0);
    scene.rotation.z = MathUtils.damp(scene.rotation.z, side * LEAN, 12, Math.min(delta, 0.05));
  });
  return <group ref={root} />;
}

// Node names as three.js sanitizes them (the dots of the Blender bone names are dropped).
export const WARRIOR_ANCHORS: Readonly<Record<string, ReactNode>> = {
  "DEF-head": <Helmet />,
  "DEF-spine002": (
    <>
      <Cuirass />
      <Cape />
    </>
  ),
  "DEF-hips": (
    <>
      <Skirt />
      <Lean />
    </>
  ),
  "DEF-shinL": <Greave />,
  "DEF-shinR": <Greave />,
  "DEF-forearmL": <Shield />,
  "DEF-handR": <Spear />,
};
