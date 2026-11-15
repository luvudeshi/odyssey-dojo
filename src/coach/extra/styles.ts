// Styles for the Training Dojo only. The game's own styles are in src/styles/defs; these are not added to them,
// so the fights never ask for a move from here. A list may mix the game's moves with the extra moves in ./moves.
// Most ids are strikes; high_block and low_block are defends, trained in the same way.

/** A style the Dojo offers: its name, one line (at most 70 characters), and the moves it trains, in order. */
export interface DojoStyleDef {
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly strikes: readonly string[];
}

export const EXTRA_STYLES: readonly DojoStyleDef[] = [
  {
    id: "taekwondo_kicks",
    name: "Taekwondo kicks",
    line: "Kicks first: keep people at leg length, where hands cannot reach.",
    strikes: ["front_kick", "roundhouse_kick", "side_kick", "low_kick", "knee"],
  },
  {
    id: "self_defense",
    name: "Self-defense basics",
    line: "Plain moves for getting free and getting away.",
    strikes: ["palm_heel", "elbow_strike", "knee", "hammer_fist", "wrist_release", "low_kick", "high_block"],
  },
  {
    id: "muay_thai",
    name: "Muay Thai",
    line: "Elbows, knees and low kicks for when someone is close.",
    strikes: ["elbow_strike", "knee", "low_kick", "roundhouse_kick", "front_kick", "jab", "cross"],
  },
  {
    id: "karate_basics",
    name: "Karate basics",
    line: "High and low blocks with karate kicks and hand strikes.",
    strikes: ["reverse_punch", "knife_hand", "front_kick", "side_kick", "high_block", "low_block"],
  },
];
