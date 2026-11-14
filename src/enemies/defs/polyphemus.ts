import type { EnemySpec } from "../../core/types";

// Pacing: a player who gets most prompts right should take 90 to 150 seconds (tests/content.test.ts checks this).
// Health sets the length; the phases set how it feels. The four attack ids are the ones his 3D model animates.
export const enemy: EnemySpec = {
  id: "polyphemus",
  name: "Polyphemus",
  title: "The Cyclops of the Cave",
  order: 1,
  place: "The land of the Cyclopes",
  book: 9,
  hp: 400,
  strikeWindowMs: 2600,
  attacks: [
    { id: "club_left", name: "Club swing", telegraphMs: 1800, damage: 7, counter: "dodge_right" },
    { id: "club_right", name: "Club swing", telegraphMs: 1800, damage: 7, counter: "dodge_left" },
    { id: "grab", name: "Grasping hand", telegraphMs: 1700, damage: 8, counter: "block" },
    { id: "boulder", name: "Boulder throw", telegraphMs: 2000, damage: 10, counter: "duck" },
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
    { id: "eye", label: "his one eye", position: [0, 4.1, 0.95], moves: ["jab", "cross", "overhead_strike", "reverse_punch", "hammer_fist", "rising_palm"] },
    { id: "gut", label: "his gut", position: [0, 2, 1.1], moves: ["hook", "cross", "spear_thrust", "uppercut", "reverse_punch", "double_palm", "front_kick", "knee"] },
  ],
  finisher: "stake_thrust",
  taunts: [
    "Nobody? I will eat Nobody last!",
    "My father Poseidon will hear of this.",
    "Strangers, the door is stone. You leave when I am fed.",
    "Nobody is killing me! Nobody!",
  ],
};
