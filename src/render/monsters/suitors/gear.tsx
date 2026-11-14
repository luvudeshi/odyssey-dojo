// Greek gear built in code, in the mannequin's own units (a figure is 1.83 units tall). Each piece is parented to a bone
// through BoneMount and wrapped in a scale by the caller, so one set of shapes fits Antinous and the smaller suitors.
import type { Palette } from "./look";

function Flat({ color, metal = 0, rough = 0.85, emissive = "#000000", glow = 0 }: { color: string; metal?: number; rough?: number; emissive?: string; glow?: number }) {
  return <meshStandardMaterial color={color} flatShading metalness={metal} roughness={rough} emissive={emissive} emissiveIntensity={glow} />;
}

/** Crested bronze helm, origin at the Head bone. `plume` scales the crest. */
export function Helm({ palette, plume, metal }: { palette: Palette; plume: number; metal: string }) {
  return (
    <group>
      <mesh position={[0, 0.12, 0]} castShadow>
        <sphereGeometry args={[0.158, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.66]} />
        <Flat color={metal} metal={0.35} rough={0.5} />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[s * 0.118, 0.03, 0.035]}>
          <boxGeometry args={[0.03, 0.17, 0.17]} />
          <Flat color={metal} metal={0.35} rough={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.07, 0.155]}>
        <boxGeometry args={[0.03, 0.15, 0.025]} />
        <Flat color={metal} metal={0.35} rough={0.5} />
      </mesh>
      <mesh position={[0, 0.275 + 0.04 * plume, -0.02]} scale={[1, plume, 1]} castShadow>
        <boxGeometry args={[0.035, 0.15, 0.36]} />
        <Flat color={palette.cloth} />
      </mesh>
      <mesh position={[0, 0.345 + 0.075 * plume, -0.02]} scale={[1, plume, 1]}>
        <boxGeometry args={[0.04, 0.03, 0.38]} />
        <Flat color={palette.trim} metal={0.3} rough={0.5} />
      </mesh>
    </group>
  );
}

/** Tunic over the torso, plus a gold breastplate when `armour` is set. Origin at spine_03. */
export function Cuirass({ palette, armour }: { palette: Palette; armour: boolean }) {
  return (
    <group>
      <mesh position={[0, -0.04, 0]} scale={[1.1, 1, 0.72]} castShadow>
        <cylinderGeometry args={[0.158, 0.135, 0.46, 8]} />
        <meshStandardMaterial color={palette.cloth} flatShading roughness={0.9} />
      </mesh>
      {armour && <group>
      <mesh position={[0, -0.02, 0]} scale={[1.18, 1, 0.78]} castShadow>
        <cylinderGeometry args={[0.165, 0.14, 0.42, 8]} />
        <Flat color={palette.trim} metal={0.4} rough={0.45} />
      </mesh>
      <mesh position={[0, -0.2, 0]} scale={[1.18, 1, 0.8]}>
        <cylinderGeometry args={[0.145, 0.145, 0.05, 8]} />
        <Flat color={palette.cloth} />
      </mesh>
      </group>}
    </group>
  );
}

/** A tunic skirt hanging from the pelvis. */
export function Skirt({ palette }: { palette: Palette }) {
  return (
    <group>
      <mesh position={[0, -0.2, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.285, 0.4, 8, 1, true]} />
        <meshStandardMaterial color={palette.cloth} flatShading roughness={0.9} side={2} />
      </mesh>
      <mesh position={[0, -0.395, 0]}>
        <cylinderGeometry args={[0.288, 0.288, 0.03, 8, 1, true]} />
        <meshStandardMaterial color={palette.trim} flatShading roughness={0.6} metalness={0.3} side={2} />
      </mesh>
    </group>
  );
}

/** A cloak hanging down the back from the shoulders. */
export function Cloak({ palette }: { palette: Palette }) {
  return (
    <group position={[0, -0.42, -0.17]} rotation={[0.06, 0, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.46, 0.95, 0.03]} />
        <meshStandardMaterial color={palette.cloth} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.47, 0.004]}>
        <boxGeometry args={[0.47, 0.05, 0.035]} />
        <Flat color={palette.trim} metal={0.3} rough={0.5} />
      </mesh>
    </group>
  );
}

export function Pauldron({ palette }: { palette: Palette }) {
  return (
    <mesh scale={[1, 0.8, 1]} castShadow>
      <sphereGeometry args={[0.1, 7, 6]} />
      <Flat color={palette.trim} metal={0.4} rough={0.45} />
    </mesh>
  );
}

/** A spear gripped at the origin and pointing along +y, tip glowing while it is being raised to throw. */
export function Spear({ glow }: { glow: number }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.014, 1.9, 5]} />
        <Flat color="#7a5530" />
      </mesh>
      <mesh position={[0, 1.58, 0]} castShadow>
        <coneGeometry args={[0.045, 0.26, 5]} />
        <Flat color="#e8e2d0" metal={0.4} rough={0.35} emissive="#ffb347" glow={glow * 3} />
      </mesh>
    </group>
  );
}

/** A sword gripped at the origin with the blade along +y. */
export function Sword({ palette }: { palette: Palette }) {
  return (
    <group>
      <mesh position={[0, 0.34, 0]} castShadow>
        <boxGeometry args={[0.055, 0.62, 0.012]} />
        <Flat color="#d9dde2" metal={0.6} rough={0.3} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.2, 0.03, 0.04]} />
        <Flat color={palette.trim} metal={0.4} rough={0.4} />
      </mesh>
    </group>
  );
}

/** A flung ox hoof: the shin bone with the dark hoof at the end, held at the bone's thin end. */
export function Hoof() {
  return (
    <group>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.035, 0.05, 0.4, 6]} />
        <Flat color="#c9a679" />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.07, 0.085, 0.13, 6]} />
        <Flat color="#2d1d14" />
      </mesh>
    </group>
  );
}

/** A golden cup held in the left hand. */
export function Cup({ palette }: { palette: Palette }) {
  return (
    <group position={[0, 0.02, 0.07]}>
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.07, 0.04, 0.1, 7]} />
        <Flat color={palette.trim} metal={0.5} rough={0.35} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.012, 0.012, 0.06, 5]} />
        <Flat color={palette.trim} metal={0.5} rough={0.35} />
      </mesh>
    </group>
  );
}

/** A round shield facing the hero, gold rim and a purple field. */
export function RoundShield({ palette }: { palette: Palette }) {
  return (
    <group position={[0.1, 0.02, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.05, 12]} />
        <Flat color={palette.cloth} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.04, 8]} />
        <Flat color={palette.trim} metal={0.5} rough={0.4} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.3, 0.025, 5, 14]} />
        <Flat color={palette.trim} metal={0.5} rough={0.4} />
      </mesh>
    </group>
  );
}

/** A feast table dragged up and held on its edge as a shield. */
export function TableShield() {
  return (
    <group position={[0, 0.05, 0.2]}>
      <mesh castShadow>
        <boxGeometry args={[0.95, 0.62, 0.06]} />
        <Flat color="#7b4d2a" />
      </mesh>
      <mesh position={[0, 0.22, 0.04]}>
        <boxGeometry args={[0.95, 0.06, 0.04]} />
        <Flat color="#5a371d" />
      </mesh>
      <mesh position={[0, -0.22, 0.04]}>
        <boxGeometry args={[0.95, 0.06, 0.04]} />
        <Flat color="#5a371d" />
      </mesh>
      {([-0.36, 0.36] as const).map((x) => (
        <mesh key={x} position={[x, 0, -0.17]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.32, 6]} />
          <Flat color="#5a371d" />
        </mesh>
      ))}
    </group>
  );
}
