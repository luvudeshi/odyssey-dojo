import type { FightingStyle } from "../../core/types";

// The two hand strikes are here so the style still works when the camera cannot see the player's legs.
export const style: FightingStyle = {
  id: "taekwondo",
  name: "Taekwondo",
  blurb: "The way of Achilles, whom Homer calls swift-footed. Taekwondo is known for fast kicks that keep an attacker at leg length.",
  strikes: ["front_kick", "knee", "hammer_fist", "uppercut"],
};
