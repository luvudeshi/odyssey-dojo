// The figure from Greek myth who best stands for each fighting style. Where possible it is someone Homer names in
// the Odyssey. Plain data keyed by style id, so the style screen and the player's 3D figure can use it with no
// contract change. Each style's own `blurb` names its figure too (tests/styleHeroes.test.ts keeps them in step).

export interface StyleHero {
  readonly name: string;
  /** A short title to show under the name. */
  readonly epithet: string;
  /** Why this figure stands for this way of fighting, in one line. */
  readonly why: string;
  /** Where the story comes from. */
  readonly source: string;
  /** How to dress the player's figure, in one line. */
  readonly look: string;
  /** Main and accent colour for that figure, as #rrggbb. */
  readonly colors: readonly [main: string, accent: string];
}

export const HEROES: Readonly<Record<string, StyleHero>> = {
  boxer: {
    name: "Polydeuces",
    epithet: "Good with his fists",
    why: "Boxing was his art. He beat Amycus, a giant king who killed every stranger he boxed, by skill against size.",
    source: "Odyssey 11.300 names him the boxer; the fight with Amycus is in the voyage of the Argo",
    look: "Bare-chested, with leather thongs wrapped round both fists and forearms",
    colors: ["#c9a36b", "#f2e6c9"],
  },
  hoplite: {
    name: "Achilles",
    epithet: "Best of the Greeks at Troy",
    why: "Spear and shield at their best: his ash spear was too heavy for any other Greek, and a god forged his shield.",
    source: "The Iliad; Odysseus meets his shade in Odyssey 11",
    look: "Crested bronze helmet, round shield on the left arm, long ash spear",
    colors: ["#b8792b", "#a01c1c"],
  },
  karate: {
    name: "Heracles",
    epithet: "Slayer of the Nemean lion",
    why: "Karate means empty hand. No arrow could pierce the Nemean lion, so he beat it with his bare hands.",
    source: "The first labour of Heracles; Odysseus meets his shade in Odyssey 11",
    look: "The lion's skin over head and shoulders, bare hands",
    colors: ["#c79a3e", "#5a3b1c"],
  },
  kung_fu: {
    name: "Proteus",
    epithet: "The Old Man of the Sea",
    why: "He fights by changing shape, from lion to serpent to leopard to running water, as kung fu moves through its animal forms.",
    source: "Odyssey 4: Menelaus wrestles him on the beach at Pharos",
    look: "An old man of the sea: long beard, sea-green robe hung with weed",
    colors: ["#2f8f83", "#d9efe6"],
  },
  pankration: {
    name: "Theseus",
    epithet: "Slayer of the Minotaur",
    why: "Later Greeks said he invented pankration, striking and grappling together, to beat the Minotaur.",
    source: "Ancient commentators on Pindar; Homer names him in Odyssey 11",
    look: "A young Athenian in a short tunic, bare fists and bare feet",
    colors: ["#2c4f8f", "#e8d9a8"],
  },
};

/** The figure for a style, or undefined for a style that has none yet. */
export function heroFor(styleId: string): StyleHero | undefined {
  return HEROES[styleId];
}
