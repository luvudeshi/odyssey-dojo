import type { EnemySpec } from "../../core/types";

// Book 12. The Sirens sing from a meadow heaped with the bones of men who stopped to listen. The crew row past
// with wax in their ears; Odysseus hears the song tied to the mast. Blocking is covering your ears.
// Data only: no 3D model yet.
export const enemy: EnemySpec = {
  id: "sirens",
  name: "The Sirens",
  title: "Singers of the Meadow of Bones",
  // Between Circe (1.4) and Scylla (2), whose numbers this file may not change.
  order: 1.7,
  place: "The meadow of the Sirens",
  book: 12,
  hp: 370,
  strikeWindowMs: 2300,
  attacks: [
    { id: "song", name: "The song", telegraphMs: 1900, damage: 8, counter: "block" },
    { id: "swoop_left", name: "Swoop", telegraphMs: 1500, damage: 6, counter: "dodge_right" },
    { id: "swoop_right", name: "Swoop", telegraphMs: 1500, damage: 6, counter: "dodge_left" },
    { id: "talons", name: "Talon dive", telegraphMs: 1500, damage: 7, counter: "duck" },
  ],
  phases: [
    // The wind drops and the sea goes flat. Only the song, and it is slow.
    { name: "The Calm", belowHp: 1, attackIds: ["song"], telegraphScale: 1.2 },
    // They leave the meadow to fetch you.
    { name: "The Song", belowHp: 0.7, attackIds: ["song", "swoop_left", "swoop_right"], telegraphScale: 1 },
    // Close enough to see what the meadow is made of.
    {
      name: "The Meadow of Bones",
      belowHp: 0.35,
      attackIds: ["song", "swoop_left", "swoop_right", "talons"],
      telegraphScale: 0.75,
    },
  ],
  weakSpots: [
    { id: "throat", label: "a singing throat", position: [0, 3.26, 0.6], moves: ["jab", "cross", "spear_thrust", "reverse_punch", "chain_punch", "double_palm", "front_kick", "uppercut"] },
    { id: "wing", label: "an open wing", position: [-1.5, 3.05, 0.5], moves: ["hook", "overhead_strike", "knife_hand", "hammer_fist", "rising_palm"] },
  ],
  taunts: [
    "Come closer, Odysseus, pride of the Achaeans. Stay your ship and hear us.",
    "No one rows past until he has heard the sweetness of our song.",
    "We know all that was suffered at Troy. We know everything that happens on the earth.",
  ],
};
