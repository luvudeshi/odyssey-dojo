// What goes on the head: crested helmets, hair, beards, the three-pronged crown and the laurel wreath.
// Sizes are metres in the Head bone's rest frame (+x the hero's left, +y up, +z forward), the same frame as the
// spartan's helmet: the skull's centre is about 0.135 above the bone.
import { Cloth, Metal } from "./materials";

const SKULL_Y = 0.135;

interface CrestProps {
  readonly color: string;
  /** Gap between the dome and the crest, filled by a stalk. */
  readonly lift: number;
  readonly height: number;
  readonly thick: number;
  /** Length of the horsehair tail down the back; 0 for none. */
  readonly tail: number;
}

function Crest({ color, lift, height, thick, tail }: CrestProps) {
  return (
    <group position={[0, 0.1 + lift, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[thick, height, 0.28]} />
        <Cloth color={color} />
      </mesh>
      <mesh position={[0, height * 0.32, -0.17]} rotation={[0.5, 0, 0]} castShadow>
        <boxGeometry args={[thick, height, 0.14]} />
        <Cloth color={color} />
      </mesh>
      {tail > 0 && (
        <mesh position={[0, -tail / 2 + 0.02, -0.235]} rotation={[0.1, 0, 0]} castShadow>
          <boxGeometry args={[thick, tail, 0.05]} />
          <Cloth color={color} />
        </mesh>
      )}
    </group>
  );
}

export interface HelmetProps extends CrestProps {
  readonly metal: string;
  readonly trim: string;
  /** A stalk colour, when the crest is lifted off the dome. */
  readonly stalk?: string;
}

/** The spartan's Corinthian helmet shape with its colours and crest as props. */
export function CrestedHelmet({ metal, trim, stalk, ...crest }: HelmetProps) {
  return (
    <group position={[0, SKULL_Y, 0.01]}>
      <mesh scale={[1, 1.02, 1.08]} castShadow>
        <icosahedronGeometry args={[0.135, 1]} />
        <Metal color={metal} />
      </mesh>
      {[0.085, -0.085].map((x) => (
        <mesh key={x} position={[x, -0.07, 0.07]} scale={[0.5, 1.6, 1.2]}>
          <boxGeometry args={[0.05, 0.1, 0.08]} />
          <Metal color={trim} />
        </mesh>
      ))}
      <mesh position={[0, -0.02, 0.135]}>
        <boxGeometry args={[0.03, 0.12, 0.03]} />
        <Metal color={metal} />
      </mesh>
      {crest.lift > 0 && (
        <mesh position={[0, 0.12 + crest.lift / 2, 0]}>
          <boxGeometry args={[0.03, crest.lift + 0.04, 0.05]} />
          <Metal color={stalk ?? trim} />
        </mesh>
      )}
      <Crest {...crest} />
    </group>
  );
}

/** A cap of hair over the top and back of the skull, and a fall of it down the neck. */
export function Hair({ color }: { color: string }) {
  return (
    <group position={[0, SKULL_Y, 0]}>
      <mesh position={[0, 0.025, -0.03]} scale={[1.02, 0.98, 1.02]} castShadow>
        <icosahedronGeometry args={[0.125, 1]} />
        <Cloth color={color} />
      </mesh>
      <mesh position={[0, -0.1, -0.1]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.2, 0.2, 0.07]} />
        <Cloth color={color} />
      </mesh>
    </group>
  );
}

/** Two sizes: `length` about 0.14 for a short beard, about 0.3 for one down to the chest. */
export function Beard({ color, length }: { color: string; length: number }) {
  return (
    <group position={[0, SKULL_Y, 0]}>
      <mesh position={[0, -0.075, 0.06]}>
        <boxGeometry args={[0.18, 0.06, 0.11]} />
        <Cloth color={color} />
      </mesh>
      <mesh position={[0, -0.08 - length / 2, 0.09]} rotation={[Math.PI - 0.12, 0, 0]} scale={[1, 1, 0.7]} castShadow>
        <coneGeometry args={[0.085, length, 5]} />
        <Cloth color={color} />
      </mesh>
    </group>
  );
}

const CROWN_POINTS = 8;

/** A band with three tall prongs over the brow (the trident again) and five low points round the back. */
export function TridentCrown({ color }: { color: string }) {
  return (
    <group position={[0, SKULL_Y + 0.085, -0.015]}>
      <mesh>
        <cylinderGeometry args={[0.108, 0.112, 0.04, 10, 1, true]} />
        <Metal color={color} />
      </mesh>
      {Array.from({ length: CROWN_POINTS }, (_, i) => {
        const angle = (i / CROWN_POINTS) * Math.PI * 2;
        const front = i === 0 || i === 1 || i === CROWN_POINTS - 1;
        const height = i === 0 ? 0.17 : front ? 0.13 : 0.05;
        return (
          <mesh key={i} position={[Math.sin(angle) * 0.108, 0.02 + height / 2, Math.cos(angle) * 0.108]} castShadow>
            <coneGeometry args={[0.02, height, 4]} />
            <Metal color={color} />
          </mesh>
        );
      })}
    </group>
  );
}

const LEAVES = 6;

/** A thin band with leaves down both sides, open at the brow. */
export function LaurelWreath({ color }: { color: string }) {
  return (
    <group position={[0, SKULL_Y + 0.07, -0.015]} rotation={[0.22, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[0.122, 0.122, 0.02, 10, 1, true]} />
        <Metal color={color} />
      </mesh>
      {[1, -1].flatMap((side) =>
        Array.from({ length: LEAVES }, (_, i) => {
          // From just beside the brow round to the nape, each leaf leaning forward and out.
          const angle = side * (0.45 + (i / (LEAVES - 1)) * 2.3);
          return (
            <mesh key={side * (i + 1)} position={[Math.sin(angle) * 0.128, 0.025, Math.cos(angle) * 0.128]} rotation={[0.5, angle, side * -0.5]}>
              <coneGeometry args={[0.024, 0.085, 3]} />
              <Metal color={color} />
            </mesh>
          );
        }),
      )}
    </group>
  );
}
