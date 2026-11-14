import type { EnemySpec } from "../../core/types";

export const enemy: EnemySpec = {
  id: "polyphemus",
  name: "Polyphemus",
  title: "The Cyclops of the Cave",
  order: 1,
  hp: 90,
  strikeWindowMs: 2600,
  attacks: [
    { id: "club_left", name: "Club swing", telegraphMs: 1800, damage: 15, counter: "dodge_right" },
    { id: "club_right", name: "Club swing", telegraphMs: 1800, damage: 15, counter: "dodge_left" },
    { id: "grab", name: "Grab", telegraphMs: 1600, damage: 20, counter: "duck" },
    { id: "boulder", name: "Boulder throw", telegraphMs: 2000, damage: 18, counter: "block" },
  ],
  weakSpots: [
    { id: "eye", label: "his one eye", position: [0, 4.1, 0.95], moves: ["jab", "cross", "overhead_strike"] },
    { id: "gut", label: "his gut", position: [0, 2, 1.1], moves: ["hook", "cross", "spear_thrust"] },
  ],
  finisher: "stake_thrust",
  taunts: ["Nobody? I will eat Nobody last!", "My father Poseidon will hear of this."],
};
