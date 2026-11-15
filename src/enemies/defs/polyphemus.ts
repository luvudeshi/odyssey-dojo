import type { EnemySpec } from "../../core/types";

// Pacing (issue #127): this is the first fight, and often the only one a new player gets, so it is tuned to be won.
// A beginner who defends half his attacks wins most fights in under 90 seconds; a good player still needs 30.
// tests/balance/balance.test.ts holds those numbers. Health sets the length, damage sets who wins, and the phases
// set how it feels. The four attack ids are the ones his 3D model animates.
export const enemy: EnemySpec = {
  id: "polyphemus",
  name: "Polyphemus",
  title: "The Cyclops of the Cave",
  order: 1,
  place: "The land of the Cyclopes",
  book: 9,
  hp: 162,
  strikeWindowMs: 2600,
  attacks: [
    { id: "club_left", name: "Club swing", telegraphMs: 1800, damage: 5, counter: "dodge_right" },
    { id: "club_right", name: "Club swing", telegraphMs: 1800, damage: 5, counter: "dodge_left" },
    { id: "grab", name: "Grasping hand", telegraphMs: 1700, damage: 4, counter: "block" },
    { id: "boulder", name: "Boulder throw", telegraphMs: 2000, damage: 6, counter: "duck" },
  ],
  phases: [
    // He is slow and sure of himself: long warnings, and no ducking yet.
    { name: "The Cave", belowHp: 1, attackIds: ["club_left", "club_right", "grab"], telegraphScale: 1.25 },
    // Angry now: everything he has, a little faster, and boulders to duck under.
    { name: "The Club", belowHp: 0.66, attackIds: ["club_left", "club_right", "grab", "boulder"], telegraphScale: 0.95 },
    // Blinded, he cannot aim a grab: fast wild swings, and boulders hurled at the sound of you.
    { name: "Blinded", belowHp: 0.3, attackIds: ["club_left", "club_right", "boulder"], telegraphScale: 0.65 },
  ],
  weakSpots: [
    { id: "eye", label: "his one eye", position: [0, 3.7, 1.18], moves: ["jab", "cross", "overhead_strike", "reverse_punch", "hammer_fist", "rising_palm"] },
    { id: "gut", label: "his gut", position: [0, 1.9, 0.92], moves: ["hook", "cross", "spear_thrust", "uppercut", "reverse_punch", "double_palm", "front_kick", "knee"] },
  ],
  finisher: "stake_thrust",
  taunts: [
    "Nobody? I will eat Nobody last!",
    "My father Poseidon will hear of this.",
    "Strangers, the door is stone. You leave when I am fed.",
    "Nobody is killing me! Nobody!",
  ],
};
