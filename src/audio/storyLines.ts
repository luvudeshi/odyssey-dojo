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

/** A taunt for this enemy, or null when it has none recorded. `random` is 0..1. */
export function tauntFor(enemyId: string, random: () => number): string | null {
  const taunts = STORY_LINES.filter((line) => line.id.startsWith(`taunt_${enemyId}_`));
  return taunts[Math.floor(random() * taunts.length)]?.id ?? null;
}
