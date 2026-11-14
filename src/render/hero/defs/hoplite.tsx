// Hero candidate "hoplite": the Quaternius Adventurer (CC0) dressed as a Greek hoplite. The backpack is gone from the file,
// the clothes are recoloured (linen tunic, crimson trim, bare legs, leather sandals) and the bronze gear is code-built.
// The left arm is baked into a shield guard in the clips that need it (see docs/models/hero-hoplite.md).
import type { Material, Mesh, Object3D } from "three";
import type { HeroCandidate } from "../candidates";
import { Cape, Cuirass, Greave, Helmet, Shield, Skirt, Spear } from "../gear/hopliteGear";

const A = "CharacterArmature|";
const PUNCH = { seconds: 0.5, hit: 0.4 };
const THRUST = { seconds: 0.6, hit: 0.4 };

/** Colour by material name (each primitive is its own mesh, so the mesh name is not used); the legs take the skin colour so the trousers read as bare legs. */
const PAINT: Readonly<Record<string, string>> = {
  Green: "#efe6d2",
  LightGreen: "#b02a35",
  Black: "#5a3a20",
  Grey: "#7a5532",
  Hair: "#2a1a10",
};

function isMesh(node: Object3D): node is Mesh {
  return (node as { isMesh?: boolean }).isMesh === true;
}

function prepare(root: Object3D): void {
  let skin: { r: number; g: number; b: number } | null = null;
  root.traverse((node) => {
    if (node.name === "Backpack") node.visible = false;
    if (!isMesh(node)) return;
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
      const c = (m as Material & { color?: { set: (hex: string) => void; r: number; g: number; b: number } }).color;
      if (!c) continue;
      if (node.name.startsWith("Adventurer_Body") && m.name === "Skin") skin = c;
      const hex = PAINT[m.name];
      if (hex) c.set(hex);
    }
  });
  root.traverse((node) => {
    if (!isMesh(node) || !node.name.startsWith("Adventurer_Legs") || !skin) return;
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
      const c = (m as Material & { color?: { r: number; g: number; b: number } }).color;
      if (c) Object.assign(c, { r: skin.r, g: skin.g, b: skin.b });
    }
  });
}

function tweakMaterial(material: Material): void {
  const m = material as Material & { metalness?: number; roughness?: number; flatShading?: boolean };
  if (m.metalness !== undefined) m.metalness = 0;
  if (m.roughness !== undefined) m.roughness = 1;
  m.flatShading = true;
  m.needsUpdate = true;
}

export const candidate: HeroCandidate = {
  id: "hoplite",
  url: "/models/hero/hoplite.glb",
  fit: { targetHeight: 1.55, rotationY: Math.PI },
  prepare,
  tweakMaterial,
  rig: {
    idle: `${A}Idle_Sword`,
    poses: {
      block: [`${A}Idle_Neutral`], // no guard clip: the shield-arm guard is baked in and the gear raises the shield
      duck: [`${A}Idle_Neutral`], // Roll has root motion, so a still stance is squashed instead
      dodgeLeft: [`${A}Run_Left`],
      dodgeRight: [`${A}Run_Right`],
      punch: [`${A}Punch_Right`],
      thrust: [`${A}Punch_Right`], // the arm reaches out and the spear follows it
      hurt: [`${A}HitRecieve`],
      victory: [`${A}Wave`],
      defeat: [`${A}Death`],
    },
    byMove: { hook: `${A}Punch_Left`, uppercut: `${A}Kick_Right`, hammer_fist: `${A}Kick_Left` },
    punch: PUNCH,
    thrust: THRUST,
    hurt: { seconds: 0.5 },
    duck: { squash: 0.75 },
  },
  anchors: {
    Head: <Helmet />,
    Chest: <><Cuirass /><Cape /></>,
    Hips: <Skirt />,
    LowerLegL: <Greave />,
    LowerLegR: <Greave />,
    WristL: <Shield />,
    WristR: <Spear punch={PUNCH} thrust={THRUST} />,
  },
};
