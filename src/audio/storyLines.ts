// Lines spoken by Homer (the narrator) and by the monsters. Clips sit beside Athena's in public/audio/athena/<id>.mp3
// and are spoken through the same voice, so a story line and a coaching line are never heard together.

export interface StoryLine {
  readonly id: string;
  readonly speaker: "homer" | "monster";
  /** When the line is meant to play, for whoever wires or re-records it. */
  readonly when: string;
  readonly text: string;
}

export const STORY_LINES: readonly StoryLine[] = [
  { id: "homer_title", speaker: "homer", when: "The title screen", text: "Sing, Muse, of the man who fought his way home to Ithaca." },
  {
    id: "homer_intro_polyphemus",
    speaker: "homer",
    when: "Before the Polyphemus fight",
    text: "They came to the land of the Cyclopes, who know no law. And in his cave the giant Polyphemus rolled a great stone across the door.",
  },
  { id: "homer_win", speaker: "homer", when: "A fight is won", text: "So the monster fell, and the long road home lay open once more." },
  { id: "homer_loss", speaker: "homer", when: "A fight is lost", text: "But the gods are patient, and so is the sea. Rise, and fight again." },
  { id: "taunt_polyphemus_1", speaker: "monster", when: "Polyphemus taunts the player", text: "Nobody? I will eat Nobody last!" },
  { id: "taunt_polyphemus_2", speaker: "monster", when: "Polyphemus taunts the player", text: "My father Poseidon will hear of this." },
  { id: "taunt_polyphemus_3", speaker: "monster", when: "Polyphemus taunts the player", text: "Strangers, the door is stone. You leave when I am fed." },
  { id: "taunt_polyphemus_4", speaker: "monster", when: "Polyphemus is blinded", text: "Nobody is killing me! Nobody!" },
];

export interface TitleLine {
  readonly id: string;
  readonly text: string;
}

/**
 * Homer's lines for the main menu's Story button, one picked each click. Kept apart from STORY_LINES on purpose: only
 * `homer_title` has a clip so far, and the others are spoken once their mp3 is in public/audio/athena/ and listed in its
 * index.json. Until then the voice skips them and the first one plays.
 */
export const TITLE_LINES: readonly TitleLine[] = [
  { id: "homer_title", text: "Sing, Muse, of the man who fought his way home to Ithaca." },
  { id: "homer_title_2", text: "Tell me, Muse, of the wanderer, and of the monsters that stood between him and home." },
  { id: "homer_title_3", text: "Ten years of war lay behind him, and still the sea would not let him rest." },
  { id: "homer_title_4", text: "Come, stranger. The road to Ithaca is long, and every mile of it must be won." },
  { id: "homer_title_5", text: "The gods have set a hard road before you. Walk it, and be remembered." },
  { id: "homer_title_6", text: "Rosy-fingered Dawn has risen, and the wine-dark sea is waiting." },
  { id: "homer_title_7", text: "Sing in me, Muse, of cunning Odysseus, who would not be kept from his own door." },
];

/** A taunt for this enemy, or null when it has none recorded. `random` is 0..1. */
export function tauntFor(enemyId: string, random: () => number): string | null {
  const taunts = STORY_LINES.filter((line) => line.id.startsWith(`taunt_${enemyId}_`));
  return taunts[Math.floor(random() * taunts.length)]?.id ?? null;
}
