import type { EnemySpec } from "../../core/types";

export const enemy: EnemySpec = {
  id: "scylla",
  name: "Scylla",
  title: "Six Heads Above the Strait",
  order: 2,
  place: "The strait, under the cliff of Scylla",
  book: 12,
  hp: 360,
  strikeWindowMs: 2200,
  attacks: [
    { id: "head_left", name: "Head strike", telegraphMs: 1300, damage: 8, counter: "dodge_right" },
    { id: "head_right", name: "Head strike", telegraphMs: 1300, damage: 8, counter: "dodge_left" },
    { id: "head_high", name: "Lunge", telegraphMs: 1200, damage: 9, counter: "duck" },
    { id: "head_center", name: "Snap", telegraphMs: 1100, damage: 10, counter: "block" },
  ],
  phases: [
    // The ship enters the strait hugging her cliff. One head at a time looks down.
    { name: "The Strait", belowHp: 1, attackIds: ["head_left", "head_right"], telegraphScale: 1.15 },
    // She has smelled the crew: heads from every side.
    { name: "Six Heads", belowHp: 0.66, attackIds: ["head_left", "head_right", "head_high"], telegraphScale: 1 },
    // Each head wants its man before the ship is through.
    {
      name: "The Toll",
      belowHp: 0.3,
      attackIds: ["head_left", "head_right", "head_high", "head_center"],
      telegraphScale: 0.92,
    },
  ],
  weakSpots: [
    { id: "neck", label: "an outstretched neck", position: [1.34, 3.06, 1.12], moves: ["hook", "overhead_strike", "knife_hand", "hammer_fist", "rising_palm"] },
    { id: "jaw", label: "a snapping jaw", position: [-0.69, 3.53, 1.28], moves: ["jab", "cross", "spear_thrust", "reverse_punch", "chain_punch", "double_palm", "front_kick", "uppercut"] },
  ],
  taunts: ["Six of your crew. That is the toll."],
};
