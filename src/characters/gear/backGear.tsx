// What a character carries: Poseidon's trident, Zeus's thunderbolt, Athena's owl shield, Achilles's shield.
// All of it rides on the back (spine_03 rest frame, back at z -0.14), never in a hand: the fists punch and block,
// and the right hand is where the stake appears (src/render/hero/gearRule.ts).
// The long pieces lean over the hero's right shoulder.
import { ExtrudeGeometry, Shape } from "three";
import { WOOD } from "../../render/hero/gear/spartanGear";
import { Glow, Matte, Metal } from "./materials";

const PRONGS: readonly (readonly [x: number, length: number])[] = [[-0.11, 0.22], [0, 0.3], [0.11, 0.22]];

/** Slung across the back, the three prongs standing above the right shoulder. */
export function SlungTrident({ metal, shaft = WOOD }: { metal: string; shaft?: string }) {
  return (
    <group position={[0.1, -0.12, -0.2]} rotation={[0, 0, 0.42]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.018, 0.018, 1.3, 6]} />
        <meshStandardMaterial color={shaft} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <boxGeometry args={[0.27, 0.035, 0.035]} />
        <Metal color={metal} />
      </mesh>
      {PRONGS.map(([x, length]) => (
        <group key={x} position={[x, 0.66, 0]}>
          <mesh position={[0, length / 2, 0]} castShadow>
            <cylinderGeometry args={[0.013, 0.013, length, 4]} />
            <Metal color={metal} />
          </mesh>
          <mesh position={[0, length + 0.045, 0]}>
            <coneGeometry args={[0.032, 0.11, 4]} />
            <Metal color={metal} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** One flat zig-zag, cut once for every Zeus on screen. */
const BOLT = (() => {
  const outline: readonly (readonly [number, number])[] = [
    [0.05, 0.46], [-0.12, 0.0], [-0.02, 0.0], [-0.09, -0.46], [0.13, 0.08], [0.03, 0.08], [0.16, 0.46],
  ];
  const shape = new Shape();
  outline.forEach(([x, y], i) => { if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y); });
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
  geometry.translate(-0.02, 0, -0.02);
  return geometry;
})();

/** A gold thunderbolt across the back, over the himation. */
export function Thunderbolt({ color }: { color: string }) {
  return (
    <mesh geometry={BOLT} position={[0, -0.08, -0.215]} rotation={[-0.05, 0, 0.38]} scale={1.12} castShadow>
      <Glow color={color} />
    </mesh>
  );
}

interface ShieldProps {
  readonly face: string;
  readonly rim: string;
  readonly boss?: string;
}

/** The spartan's back shield (same place, same size) with its colours as props: a rim ring round a face. */
function ShieldDisc({ face, rim }: ShieldProps) {
  return (
    <>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.27, 0.27, 0.05, 14]} />
        <Matte color={rim} />
      </mesh>
      <mesh position={[0, 0, -0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.235, 0.03, 14]} />
        <Matte color={face} />
      </mesh>
    </>
  );
}

export function RoundShield({ face, rim, boss }: ShieldProps) {
  return (
    <group position={[0, -0.06, -0.19]} rotation={[0.08, 0, 0]}>
      <ShieldDisc face={face} rim={rim} />
      <mesh position={[0, 0, -0.06]}>
        <icosahedronGeometry args={[0.06, 0]} />
        <Matte color={boss ?? rim} />
      </mesh>
    </group>
  );
}

/** Athena's shield: an owl, face on, in place of the boss. Body, two round eyes, a beak and two ear tufts. */
export function OwlShield({ face, rim, owl, eyes }: ShieldProps & { owl: string; eyes: string }) {
  return (
    <group position={[0, -0.06, -0.19]} rotation={[0.08, 0, 0]}>
      <ShieldDisc face={face} rim={rim} />
      <group position={[0, -0.01, -0.05]}>
        <mesh position={[0, -0.03, 0]} scale={[0.95, 1.2, 0.3]}>
          <icosahedronGeometry args={[0.1, 0]} />
          <Matte color={owl} />
        </mesh>
        {[0.045, -0.045].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.05, -0.028]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.012, 8]} />
              <Matte color={eyes} />
            </mesh>
            <mesh position={[x, 0.05, -0.037]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.016, 0.016, 0.01, 6]} />
              <Matte color={owl} />
            </mesh>
            <mesh position={[x * 1.6, 0.12, -0.005]} rotation={[0, 0, x > 0 ? -0.4 : 0.4]}>
              <coneGeometry args={[0.025, 0.07, 3]} />
              <Matte color={owl} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.005, -0.035]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.018, 0.05, 3]} />
          <Matte color={eyes} />
        </mesh>
      </group>
    </group>
  );
}
