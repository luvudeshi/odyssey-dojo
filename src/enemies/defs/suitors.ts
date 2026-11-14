import type { EnemySpec } from "../../core/types";

// Book 22, with the insults of Books 17 to 20. Home at last, Odysseus strings his bow and turns it on the
// suitors who ate his house bare: Antinous first, then Eurymachus, who draws his sword and rushes him.
// The ox-hoof is thrown by Ctesippus in Book 20, and Odysseus ducks it.
// The last fight: the most health and the fastest warnings. Data only: no 3D model yet.
export const enemy: EnemySpec = {
  id: "suitors",
  name: "The Suitors",
  title: "Antinous and the Men Who Ate the House Bare",
  order: 4,
  place: "The great hall, Ithaca",
  book: 22,
  hp: 520,
  strikeWindowMs: 2000,
  attacks: [
    { id: "spear_left", name: "Thrown spear", telegraphMs: 1400, damage: 11, counter: "dodge_right" },
    { id: "spear_right", name: "Thrown spear", telegraphMs: 1400, damage: 11, counter: "dodge_left" },
    { id: "ox_hoof", name: "Flung ox-hoof", telegraphMs: 1500, damage: 10, counter: "duck" },
    { id: "sword_rush", name: "Sword rush", telegraphMs: 1600, damage: 15, counter: "block" },
  ],
  phases: [
    // They still think you are a beggar: scraps from the table.
    { name: "The Beggar at the Door", belowHp: 1, attackIds: ["ox_hoof", "spear_left"], telegraphScale: 1.15 },
    // Antinous is down and Eurymachus comes on with his sword.
    {
      name: "Eurymachus",
      belowHp: 0.7,
      attackIds: ["sword_rush", "ox_hoof", "spear_left", "spear_right"],
      telegraphScale: 0.9,
    },
    // Armed from the storeroom, six spears at a time.
    { name: "The Volley", belowHp: 0.35, attackIds: ["spear_left", "spear_right", "sword_rush"], telegraphScale: 0.72 },
  ],
  weakSpots: [
    { id: "throat", label: "the throat of Antinous", position: [0, 3.1, 0.8], moves: ["jab", "cross", "spear_thrust", "reverse_punch", "chain_punch", "double_palm"] },
    { id: "chest", label: "an unguarded chest", position: [-0.7, 2.4, 0.9], moves: ["hook", "cross", "spear_thrust", "uppercut", "reverse_punch", "double_palm"] },
    { id: "helm", label: "a raised helm", position: [0.8, 3.4, 0.7], moves: ["overhead_strike", "hook", "knife_hand", "hammer_fist", "rising_palm"] },
  ],
  taunts: [
    "Stand off from my table, beggar, or you will be sorry you came.",
    "Stranger, you have shot your last. The vultures will have you here.",
    "It was Antinous who led us. Spare your own people and we will pay it all back.",
    "Friends, draw your swords and hold the tables up against his arrows!",
  ],
};
