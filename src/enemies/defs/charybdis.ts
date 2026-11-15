import type { EnemySpec } from "../../core/types";

// Book 12. Three times a day Charybdis drinks the strait down to the black sand and spews it back.
// Odysseus, alone on the wreck of his ship, hangs from the fig tree above her until she gives his timbers up.
// Data only: no 3D model yet.
export const enemy: EnemySpec = {
  id: "charybdis",
  name: "Charybdis",
  title: "The Whirlpool Under the Fig Tree",
  order: 3,
  place: "The strait, beneath the fig tree",
  book: 12,
  hp: 330,
  strikeWindowMs: 2200,
  attacks: [
    { id: "surge_left", name: "Breaking wave", telegraphMs: 1500, damage: 4, counter: "dodge_right" },
    { id: "surge_right", name: "Breaking wave", telegraphMs: 1500, damage: 4, counter: "dodge_left" },
    { id: "spout", name: "Spout", telegraphMs: 1500, damage: 4, counter: "duck" },
    { id: "undertow", name: "Undertow", telegraphMs: 1800, damage: 6, counter: "block" },
  ],
  phases: [
    // She drinks: the water drags at you.
    { name: "The Swallow", belowHp: 1, attackIds: ["undertow", "surge_left", "surge_right"], telegraphScale: 1.1 },
    // She spews: it all comes back at once, boiling like a cauldron.
    { name: "The Spew", belowHp: 0.66, attackIds: ["spout", "surge_left", "surge_right"], telegraphScale: 0.9 },
    // Hanging on above her like a bat, with nowhere to plant your feet.
    {
      name: "The Fig Tree",
      belowHp: 0.3,
      attackIds: ["undertow", "spout", "surge_left", "surge_right"],
      telegraphScale: 0.7,
    },
  ],
  weakSpots: [
    { id: "maw", label: "the throat of the whirlpool", position: [0, 1.4, 0.2], moves: ["overhead_strike", "cross", "hook", "hammer_fist", "knife_hand", "double_palm", "front_kick"] },
    { id: "crest", label: "the crest of the wave", position: [0.3, 3.2, 1.6], moves: ["jab", "cross", "spear_thrust", "reverse_punch", "chain_punch", "double_palm", "uppercut"] },
  ],
  // He does not fight the whirlpool. The sea lifts him and he reaches up and catches the fig tree: one hand driven up.
  finisher: "rising_palm",
  taunts: [
    "Three times a day she drinks the sea, and three times gives it back.",
    "Not even the Earth-shaker could pull you out of there.",
    "Hold to the fig tree. Hold until she gives your timbers back.",
  ],
};
