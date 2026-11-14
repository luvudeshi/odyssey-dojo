import type { EnemySpec } from "../../core/types";

// Book 10. Circe turns the crew to swine with a drugged cup and a touch of her wand; the herb moly, a gift
// from Hermes, keeps Odysseus himself, and he rushes her with his sword drawn. Data only: no 3D model yet.
export const enemy: EnemySpec = {
  id: "circe",
  name: "Circe",
  title: "The Witch of Aeaea",
  // Between Polyphemus (1) and Scylla (2), whose numbers this file may not change.
  order: 1.4,
  place: "Aeaea, the island of Circe",
  book: 10,
  hp: 360,
  strikeWindowMs: 2400,
  attacks: [
    { id: "wand_left", name: "Wand stroke", telegraphMs: 1600, damage: 9, counter: "dodge_right" },
    { id: "wand_right", name: "Wand stroke", telegraphMs: 1600, damage: 9, counter: "dodge_left" },
    { id: "cup", name: "Flung cup", telegraphMs: 1700, damage: 10, counter: "duck" },
    { id: "spell", name: "Spell of swine", telegraphMs: 1900, damage: 13, counter: "block", weight: 0.7 },
  ],
  phases: [
    // She plays the host: slow, sweet, one cup at a time.
    { name: "The Welcome", belowHp: 1, attackIds: ["cup", "wand_left"], telegraphScale: 1.2 },
    // The wand comes out.
    { name: "The Wand", belowHp: 0.66, attackIds: ["wand_left", "wand_right", "cup"], telegraphScale: 1 },
    // The drug has failed and she knows who you are.
    { name: "Unmasked", belowHp: 0.3, attackIds: ["wand_left", "wand_right", "cup", "spell"], telegraphScale: 0.75 },
  ],
  weakSpots: [
    { id: "wand_hand", label: "her wand hand", position: [0.9, 2.6, 0.7], moves: ["hook", "cross", "overhead_strike", "knife_hand", "hammer_fist", "chain_punch"] },
    { id: "guard", label: "her open guard", position: [0, 2.2, 0.8], moves: ["jab", "cross", "spear_thrust", "reverse_punch", "chain_punch", "double_palm", "front_kick", "knee", "uppercut"] },
  ],
  taunts: [
    "Drink, stranger. You have come a long way.",
    "To the sty with you. Lie down with your friends.",
    "No man has ever tasted this and kept his mind.",
    "You are Odysseus. Hermes told me you would come.",
  ],
};
