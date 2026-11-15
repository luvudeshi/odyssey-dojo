// Hero candidate "spartan": Quaternius's Universal Animation Library mannequin (CC0), flat-shaded and dressed as a
// hoplite with code-built gear (see ../gear/spartanGear.tsx). Adult proportions (head about 1/7.5 of the height).
import type { Material } from "three";
import { Color } from "three";
import type { HeroCandidate } from "../candidates";
import { SPARTAN_ANCHORS } from "../gear/anchors";
import { TIMING } from "../gear/timing";

const SKIN = new Color("#b87a52");
const JOINT = new Color("#8a5636");

/** The pack's mannequin is smooth and shiny; push it to matte bronze skin, faceted like the giant. */
function tweak(material: Material): void {
  const m = material as Material & { color?: Color; metalness?: number; roughness?: number; flatShading?: boolean };
  m.color?.copy(material.name === "M_Joints" ? JOINT : SKIN);
  if (m.metalness !== undefined) m.metalness = 0;
  if (m.roughness !== undefined) m.roughness = 1;
  m.flatShading = true;
  m.needsUpdate = true;
}

export const candidate: HeroCandidate = {
  id: "spartan",
  url: "/models/hero/spartan.glb",
  // targetHeight is the bone box (head bone to sole), 1.544 m, which renders the 1.83 m mesh at 1.8 m.
  // offset z (inside the turned group, so +z is away from the camera) steps the whole figure back from the camera so the feet and a crouch stay inside the frame.
  fit: { targetHeight: 1.544, rotationY: Math.PI, offset: [0, 0, 0.8] },
  tweakMaterial: tweak,
  anchors: SPARTAN_ANCHORS,
  rig: {
    idle: "Guard_Idle",
    poses: {
      block: ["Guard_Block"],
      duck: ["Crouch_Idle_Loop"],
      dodgeLeft: ["Dodge_L"],
      dodgeRight: ["Dodge_R"],
      punch: ["Punch_Jab"],
      thrust: ["Sword_Regular_B"],
      hurt: ["Hurt"],
      victory: ["Victory"],
      defeat: ["Death01"],
    },
    byMove: { cross: "Punch_Cross", hook: "Melee_Hook", overhead_strike: "Sword_Regular_A" },
    ...TIMING,
  },
};
