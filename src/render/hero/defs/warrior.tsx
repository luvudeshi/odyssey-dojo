// Candidate "warrior": the Quaternius Universal Animation Library mannequin (CC0), an adult-proportioned low-poly body
// with real combat clips, dressed in code as a Greek hoplite (see ../gear/warriorGear.tsx).
import { Color } from "three";
import type { Material } from "three";
import type { HeroCandidate } from "../candidates";
import { WARRIOR_ANCHORS } from "../gear/warriorGear";

const SKIN = new Color("#a86e44");
const LEATHER = new Color("#4a2f1c");

/** The pack ships an orange body and purple joints. Skin and dark leather, flat-shaded, sit with the dusk cave. */
export function warriorMaterial(material: Material): void {
  const m = material as Material & { color?: Color; metalness?: number; roughness?: number; flatShading?: boolean };
  m.color?.copy(m.name === "M_Joints" ? LEATHER : SKIN);
  if (m.metalness !== undefined) m.metalness = 0;
  if (m.roughness !== undefined) m.roughness = 0.9;
  m.flatShading = true;
  m.needsUpdate = true;
}

export const candidate: HeroCandidate = {
  id: "warrior",
  url: "/models/hero/warrior.glb",
  // Bones span about 1.63 m (toe to the top of the neck); with the helmet the figure stands about 1.8 m.
  fit: { targetHeight: 1.63, rotationY: Math.PI, offset: [0, 0, 0.8] },
  tweakMaterial: warriorMaterial,
  anchors: WARRIOR_ANCHORS,
  rig: {
    idle: "Sword_Idle",
    poses: {
      block: ["Guard_Hold"],
      duck: ["Crouch_Idle_Loop"],
      dodgeLeft: ["Walk_Loop"],
      dodgeRight: ["Walk_Loop"],
      punch: ["Punch_Jab"],
      thrust: ["Punch_Cross"],
      hurt: ["Hit_Chest"],
      victory: ["Dance_Loop"],
      defeat: ["Death01"],
    },
    byMove: { cross: "Punch_Cross", hook: "Sword_Attack", uppercut: "Punch_Cross", overhead_strike: "Sword_Attack" },
    punch: { seconds: 0.6, hit: 0.4 },
    thrust: { seconds: 0.7, hit: 0.4 },
    hurt: { seconds: 0.4 },
  },
};
