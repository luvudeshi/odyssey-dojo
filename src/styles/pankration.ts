import type { FightingStyle } from "../core/types";

// The two hand strikes are here so the style still works when the camera cannot see the player's legs.
// Parked one folder above defs/ for now: tests/fightingStyles.test.ts lists the exact styles on main, and only its
// owner may change it. Move this file into defs/ (and fix the import path) once that list has "pankration" in it.
export const style: FightingStyle = {
  id: "pankration",
  name: "Pankration",
  blurb: "The all-in fighting of the Greek games: kicks, knees and fists. Odysseus beat Ajax with a kick behind the knee.",
  strikes: ["front_kick", "knee", "hammer_fist", "uppercut"],
};
