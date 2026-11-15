// The six gods a player can be revealed as: who they are in the Odyssey, their colour, power, epithets and rivals.

export const GOD_IDS = ["zeus", "poseidon", "athena", "hermes", "artemis", "apollo"] as const;

export type GodId = (typeof GOD_IDS)[number];

export interface GodDef {
  readonly id: GodId;
  readonly name: string;
  /** A short title, e.g. "Lord of the sky and the thunderbolt". */
  readonly domain: string;
  /** One sentence on what this god does in Homer's Odyssey. */
  readonly odyssey: string;
  /** Hex colour that reads on the game's dark purple background. */
  readonly accent: string;
  readonly power: {
    /** What the screen shouts when the power fires. */
    readonly name: string;
    /** Id of the move in src/moves/defs that triggers it. */
    readonly moveId: string;
    /** One line telling the player the gesture. */
    readonly blurb: string;
  };
  /** Homeric titles of the god. They describe the god, never the player: show one as "<God>, <epithet>". */
  readonly epithets: readonly [string, ...string[]];
  /**
   * Gods Homer shows this one quarrelling or competing with, best attested first. Never Athena, whoever the god is:
   * she coaches the player through every fight, so she cannot also be the one who sends the monsters.
   */
  readonly rivals: readonly [GodId, ...GodId[]];
}

// Homer's Apollo is not the sun (that is Helios, a god of his own) and his Artemis is not the moon. Only the two
// power names, which are fixed, say otherwise: keep the rest of the copy Homeric.
export const GODS: Readonly<Record<GodId, GodDef>> = {
  zeus: {
    id: "zeus",
    name: "Zeus",
    domain: "Lord of the sky and the thunderbolt",
    odyssey:
      "Zeus sends the eagles and thunderclaps that promise Odysseus his revenge, splits his ship with a thunderbolt after the crew eat the cattle of the Sun, and at the end commands peace on Ithaca.",
    accent: "#ffe45c",
    power: {
      name: "THUNDERBOLT",
      moveId: "thunderbolt",
      blurb: "Raise one hand high, then throw it down",
    },
    epithets: [
      "cloud-gatherer",
      "loud-thundering",
      "aegis-bearing",
      "far-sounding, wide-seeing",
      "who delights in the thunderbolt",
      "counsellor most high",
    ],
    // Poseidon: Iliad 15.158-217, he rages at Zeus's order to leave the battle ("we are three brothers, equal in
    // honour"), and Odyssey 13.125-158, he protests to Zeus about the Phaeacians.
    // (Athena defies him too, Iliad 8.350-437, but she is the player's coach and is left out of every list.)
    rivals: ["poseidon"],
  },
  poseidon: {
    id: "poseidon",
    name: "Poseidon",
    domain: "Earth-shaker, lord of the grey sea",
    odyssey:
      "Poseidon, father of the Cyclops Polyphemus, hounds Odysseus across the sea for blinding his son and smashes his raft within sight of the Phaeacians' shore.",
    accent: "#3fd0e0",
    power: {
      name: "TRIDENT SWEEP",
      moveId: "trident_sweep",
      blurb: "Sweep both arms across in front of you",
    },
    epithets: [
      "earth-shaker",
      "holder of the earth",
      "wide-ruling",
      "loud-crashing",
      "who rules the grey salt sea",
      "glorious shaker of the land",
    ],
    // Zeus: Iliad 15.158-217, as above. In the Odyssey Zeus is also the other god who wrecks Odysseus at sea, with
    // the thunderbolt that splits his ship after the cattle of the Sun (12.403-419).
    // Apollo: Iliad 21.435-469, Poseidon challenges him to fight in the battle of the gods.
    // (His great quarrel is with Athena, over Odysseus: Odyssey 6.328-331 and 13.341-343. She is left out as above.)
    rivals: ["zeus", "apollo"],
  },
  athena: {
    id: "athena",
    name: "Athena",
    domain: "Goddess of craft, counsel and the well-fought war",
    odyssey:
      "Athena watches over Odysseus and Telemachus from first book to last, often disguised as the old friend Mentor, and stands beside Odysseus when he fights the suitors.",
    accent: "#cfd8e6",
    power: {
      name: "AEGIS PUSH",
      moveId: "aegis_push",
      blurb: "Push both palms straight forward",
    },
    epithets: [
      "grey-eyed, unyielding",
      "driver of the spoil",
      "rouser of armies",
      "guardian of the city",
      "rich in counsel",
      "unwearied",
    ],
    // Poseidon: Odyssey 6.328-331 and 13.341-343, as above.
    // Apollo: Iliad 23.382-400, the chariot race: he knocks the whip from Diomedes' hand, she hands it back and
    // breaks his favourite's yoke. Also Iliad 7.17-42, where they back opposite armies.
    // Zeus: Iliad 8.350-437 and 1.399-400, as above.
    rivals: ["poseidon", "apollo", "zeus"],
  },
  hermes: {
    id: "hermes",
    name: "Hermes",
    domain: "Messenger of the gods, guide of travellers and souls",
    odyssey:
      "Hermes hands Odysseus the herb moly that defeats Circe's magic, carries Zeus's order to Calypso to let him sail, and leads the ghosts of the suitors down to Hades.",
    accent: "#ff8f70",
    power: {
      name: "SWIFT DASH",
      moveId: "swift_dash",
      blurb: "Side-step fast, left or right",
    },
    epithets: [
      "slayer of Argus",
      "guide and messenger",
      "of the golden wand",
      "giver of good things",
      "the luck-bringer",
      "the gracious helper",
    ],
    // Hermes has no real feud in the Iliad or the Odyssey; this is the nearest Homer gives.
    // Apollo: Iliad 20.31-40, they take opposite sides at Troy; Odyssey 8.334-342, Apollo baits him in front of the
    // gods. (Their famous quarrel over the stolen cattle is in the Homeric Hymn to Hermes, not in Homer.)
    rivals: ["apollo"],
  },
  artemis: {
    id: "artemis",
    name: "Artemis",
    domain: "Huntress of the wild hills, mistress of beasts",
    odyssey:
      "Artemis is the huntress Odysseus likens Nausicaa to when he first sees her, and the goddess Penelope begs for a swift, gentle arrow rather than marriage to a suitor.",
    accent: "#8fe8a4",
    power: {
      name: "MOON ARROW",
      moveId: "moon_arrow",
      blurb: "Draw a bow back to your shoulder, then let go",
    },
    epithets: [
      "arrow-pouring",
      "of the golden shaft",
      "of the loud chase",
      "golden-throned",
      "of the golden reins",
      "the holy archer",
    ],
    // Apollo: Iliad 21.470-477, she scolds her brother to his face for backing down from Poseidon. Homer shows her
    // in no direct quarrel with any other god on this list.
    rivals: ["apollo"],
  },
  apollo: {
    id: "apollo",
    name: "Apollo",
    domain: "Far-shooter, lord of the silver bow and the lyre",
    odyssey:
      "Apollo is the archer god on whose feast day Odysseus strings the great bow, and the one Odysseus calls on for glory as he turns it on the suitors.",
    accent: "#ff9f2e",
    power: {
      name: "SUN BURST",
      moveId: "sun_burst",
      blurb: "Fling both arms out wide",
    },
    epithets: [
      "far-shooter",
      "who works from afar",
      "of the silver bow",
      "famed for the bow",
      "Phoebus, the bright one",
      "of the golden sword",
    ],
    // Poseidon: Iliad 21.435-469, Poseidon calls him out in the battle of the gods and he declines.
    // Artemis: Iliad 21.470-477, as above.
    // (Athena crosses him in the chariot race, Iliad 23.382-400. She is left out as above.)
    rivals: ["poseidon", "artemis"],
  },
};
