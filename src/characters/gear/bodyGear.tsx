// What goes on the trunk and legs: cuirasses, the tunic, the aegis, cloaks, the himation, kilts, greaves and a sword.
// Sizes are metres in the bone's rest frame (+x the hero's left, +y up, +z forward). Torso pieces hang on spine_03
// (the shoulders are about 0.15 above it, the back is at z -0.14), kilts on the pelvis, greaves on each calf.
import { LEATHER } from "../../render/hero/gear/spartanGear";
import { Cloth, Matte, Metal } from "./materials";

/** The spine bone runs up the back of the chest, so a piece centred on it leaves the chest bare: these sit forward. */
const TORSO: readonly [number, number, number] = [0, -0.1, 0.04];
/** Front-to-back squash of a round torso piece. */
const DEEP = 0.82;

function Shoulders({ color }: { color: string }) {
  return (
    <>
      {[0.11, -0.11].map((x) => (
        <mesh key={x} position={[x, 0.25, 0]}>
          <boxGeometry args={[0.1, 0.05, 0.17]} />
          <Metal color={color} />
        </mesh>
      ))}
    </>
  );
}

function Belt({ color }: { color: string }) {
  return (
    <mesh position={[0, -0.22, 0]} scale={[1, 1, DEEP + 0.04]}>
      <cylinderGeometry args={[0.16, 0.16, 0.05, 8]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
  );
}

/** The spartan's cuirass shape with its colours as props. */
export function PlainCuirass({ metal, trim, belt = LEATHER }: { metal: string; trim: string; belt?: string }) {
  return (
    <group position={TORSO}>
      <mesh scale={[1, 1, DEEP]} castShadow>
        <cylinderGeometry args={[0.2, 0.15, 0.46, 8]} />
        <Metal color={metal} />
      </mesh>
      <Shoulders color={trim} />
      <Belt color={belt} />
    </group>
  );
}

const SCALE_ROWS = 5;

/** Fish scales: overlapping rows, each flaring out over the one below, turned half a facet and in two colours. */
export function ScaleCuirass({ metal, trim, belt }: { metal: string; trim: string; belt: string }) {
  return (
    <group position={TORSO}>
      <mesh scale={[1, 1, DEEP]}>
        <cylinderGeometry args={[0.19, 0.145, 0.46, 8]} />
        <Metal color={trim} />
      </mesh>
      {Array.from({ length: SCALE_ROWS }, (_, i) => {
        const radius = 0.2 - i * 0.011;
        return (
          <mesh key={i} position={[0, 0.175 - i * 0.092, 0]} rotation={[0, (i * Math.PI) / 10, 0]} scale={[1, 1, DEEP]} castShadow>
            <cylinderGeometry args={[radius - 0.004, radius + 0.022, 0.115, 10, 1, true]} />
            <Metal color={i % 2 === 0 ? metal : trim} />
          </mesh>
        );
      })}
      <Shoulders color={metal} />
      <Belt color={belt} />
    </group>
  );
}

/** A belted cloth tunic over the chest, where the others wear a cuirass. */
export function Tunic({ cloth, belt }: { cloth: string; belt: string }) {
  return (
    <group position={TORSO}>
      <mesh scale={[1, 1, DEEP]} castShadow>
        <cylinderGeometry args={[0.195, 0.155, 0.46, 8]} />
        <Cloth color={cloth} />
      </mesh>
      <mesh position={[0, -0.2, 0]} scale={[1, 1, DEEP + 0.04]}>
        <cylinderGeometry args={[0.165, 0.165, 0.045, 8]} />
        <Metal color={belt} />
      </mesh>
    </group>
  );
}

/** Athena's aegis: a short scaled mantle over the shoulders with a gold hem and the gorgon's face on the chest. */
export function Aegis({ cloth, hem, face }: { cloth: string; hem: string; face: string }) {
  return (
    <group position={[0, 0.075, 0.04]}>
      <mesh scale={[1, 1, 0.86]} castShadow>
        <cylinderGeometry args={[0.13, 0.275, 0.22, 8, 1, true]} />
        <Cloth color={cloth} />
      </mesh>
      <mesh position={[0, -0.11, 0]} scale={[1, 1, 0.86]}>
        <cylinderGeometry args={[0.276, 0.285, 0.028, 8, 1, true]} />
        <Metal color={hem} />
      </mesh>
      <group position={[0, -0.035, 0.2]} rotation={[-0.5, 0, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.02, 8]} />
          <Metal color={hem} />
        </mesh>
        <mesh position={[0, 0, 0.012]} scale={[1, 1, 0.45]}>
          <icosahedronGeometry args={[0.042, 0]} />
          <Matte color={face} />
        </mesh>
      </group>
    </group>
  );
}

/** A cloak down the back from a bar across the shoulders. The spartan's cape with colour, length and width as props. */
export function Cloak({ color, clasp, length, width = 0.4 }: { color: string; clasp: string; length: number; width?: number }) {
  return (
    <group position={[0, 0.12, -0.14]} rotation={[-0.08, 0, 0]}>
      <mesh position={[0, 0.03 - length / 2, 0]} castShadow>
        <boxGeometry args={[width, length, 0.02]} />
        <Cloth color={color} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[width + 0.04, 0.06, 0.05]} />
        <Metal color={clasp} />
      </mesh>
    </group>
  );
}

/** A himation: a cloth down the back to the hips (the long kilt carries the white on down), bunched on the left
 * shoulder and drawn across the chest. Kept short: a stiff board to the calves swings far off a crouching body. */
export function Himation({ cloth, clasp }: { cloth: string; clasp: string }) {
  return (
    <>
      <mesh position={[0, -0.17, -0.15]} rotation={[-0.03, 0, 0]} castShadow>
        <boxGeometry args={[0.44, 0.64, 0.025]} />
        <Cloth color={cloth} />
      </mesh>
      <mesh position={[0.13, 0.165, 0.02]} castShadow>
        <boxGeometry args={[0.17, 0.07, 0.36]} />
        <Cloth color={cloth} />
      </mesh>
      {/* from the left shoulder down to the right hip */}
      <mesh position={[0, -0.06, 0.2]} rotation={[0.08, 0, -0.52]}>
        <boxGeometry args={[0.13, 0.56, 0.03]} />
        <Cloth color={cloth} />
      </mesh>
      <mesh position={[0.13, 0.15, 0.2]}>
        <icosahedronGeometry args={[0.035, 0]} />
        <Metal color={clasp} />
      </mesh>
    </>
  );
}

/** The spartan's chiton with colour and length as props; `length` 0.32 is his. */
export function Kilt({ color, length = 0.32, hem }: { color: string; length?: number; hem?: string }) {
  const flare = 0.27 + (length - 0.32) * 0.18;
  return (
    <group position={[0, -0.01 - length / 2, 0]} scale={[1, 1, 0.82]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.17, flare, length, 8, 1, true]} />
        <Cloth color={color} />
      </mesh>
      {hem !== undefined && (
        <mesh position={[0, -length / 2 + 0.015, 0]}>
          <cylinderGeometry args={[flare - 0.006, flare + 0.004, 0.03, 8, 1, true]} />
          <Cloth color={hem} />
        </mesh>
      )}
    </group>
  );
}

/** The spartan's greave with its colour as a prop. */
export function PlainGreave({ color }: { color: string }) {
  return (
    <mesh position={[0, -0.21, 0.015]} castShadow>
      <cylinderGeometry args={[0.058, 0.042, 0.34, 6]} />
      <Metal color={color} />
    </mesh>
  );
}

/** A short sword in its scabbard on the left hip, clear of both fists. */
export function HipSword({ scabbard, hilt }: { scabbard: string; hilt: string }) {
  return (
    <group position={[0.2, -0.04, -0.03]} rotation={[0.7, 0, 0.12]}>
      <mesh position={[0, -0.16, 0]} castShadow>
        <boxGeometry args={[0.05, 0.34, 0.025]} />
        <Matte color={scabbard} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.11, 0.025, 0.035]} />
        <Metal color={hilt} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.016, 0.016, 0.1, 5]} />
        <Metal color={hilt} />
      </mesh>
    </group>
  );
}
