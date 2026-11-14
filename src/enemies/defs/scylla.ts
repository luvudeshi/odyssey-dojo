import type { EnemySpec } from "../../core/types";

export const enemy: EnemySpec = {
  id: "scylla",
  name: "Scylla",
  title: "Six Heads Above the Strait",
  order: 2,
  place: "The strait, under the cliff of Scylla",
  book: 12,
  hp: 110,
  strikeWindowMs: 2200,
  attacks: [
    { id: "head_left", name: "Head strike", telegraphMs: 1300, damage: 12, counter: "dodge_right" },
    { id: "head_right", name: "Head strike", telegraphMs: 1300, damage: 12, counter: "dodge_left" },
    { id: "head_high", name: "Lunge", telegraphMs: 1200, damage: 14, counter: "duck" },
    { id: "head_center", name: "Snap", telegraphMs: 1100, damage: 14, counter: "block" },
  ],
  weakSpots: [
    { id: "neck", label: "an outstretched neck", position: [0.8, 3, 0.8], moves: ["hook", "overhead_strike"] },
    { id: "jaw", label: "a snapping jaw", position: [-0.6, 3.6, 1], moves: ["jab", "cross", "spear_thrust"] },
  ],
  taunts: ["Six of your crew. That is the toll."],
};
