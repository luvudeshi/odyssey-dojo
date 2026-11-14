import type { FightingStyle } from "../../core/types";

// The two hand strikes are here so the style still works when the camera cannot see the player's legs.
export const style: FightingStyle = {
  id: "pankration",
  name: "Pankration",
  blurb: "The way of Theseus, said to have invented pankration to beat the Minotaur: kicks, knees and fists together.",
  strikes: ["front_kick", "knee", "hammer_fist", "uppercut"],
};
