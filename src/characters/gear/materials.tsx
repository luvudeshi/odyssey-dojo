// The three surfaces every character piece is made of. Metal is the spartan's own bronze material with another colour.
import { Bronze } from "../../render/hero/gear/spartanGear";

export const Metal = Bronze;

/** Double-sided, so an open kilt or a thin cloak shows from inside too. */
export function Cloth({ color }: { color: string }) {
  return <meshStandardMaterial color={color} roughness={1} flatShading side={2} />;
}

/** Duller than armour: a big flat disc of shiny metal blows out to white under the sun (see carriedGear's shield). */
export function Matte({ color }: { color: string }) {
  return <meshStandardMaterial color={color} metalness={0.25} roughness={0.85} flatShading />;
}

/** Lit from inside, for the thunderbolt. */
export function Glow({ color }: { color: string }) {
  return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} metalness={0.3} roughness={0.5} flatShading />;
}
