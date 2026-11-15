// What each enemy attack stands for in real life: one calm line, at most 60 characters, per attack.
// Keyed by enemy id and then attack id, because two enemies may reuse an attack id with a different meaning.
// Sources and notes for every line are in docs/situations.md; tests/situations.test.ts keeps the two in step.
// Data only: nothing here is shown in the game until a screen asks for it.

export const SITUATION_MAX_LENGTH = 60;

export const SITUATIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  polyphemus: {
    club_left: "A wide swing from the side",
    club_right: "A wide swing from the side",
    grab: "Someone grabs for you",
    boulder: "Something thrown at your head",
  },
  circe: {
    wand_left: "Someone swings at you with something in their hand",
    wand_right: "Someone swings at you with something in their hand",
    cup: "A cup or bottle thrown your way",
    spell: "Pressure with words, not hands: keep your guard up",
  },
  sirens: {
    song: "Being talked into staying: keep your guard, keep moving",
    swoop_left: "Someone rushes at you from one side",
    swoop_right: "Someone rushes at you from one side",
    talons: "A grab or a swipe at head height",
  },
  scylla: {
    head_left: "A sudden lunge at you from one side",
    head_right: "A sudden lunge at you from one side",
    head_high: "A fast swing at head height",
    head_center: "A strike from close in, too near to step away from",
  },
  charybdis: {
    surge_left: "Something big coming straight at you: step aside",
    surge_right: "Something big coming straight at you: step aside",
    spout: "Something flying at head height: drop under it",
    undertow: "Being pulled off balance: set your feet, guard up",
  },
  suitors: {
    spear_left: "Something thrown straight at you",
    spear_right: "Something thrown straight at you",
    ox_hoof: "An object flung at your head from across a room",
    sword_rush: "Someone charges at you with no room to step away",
  },
};

/** The real situation an enemy's attack stands for, or null when the pair is not known. Never throws. */
export function situationFor(enemyId: string, attackId: string): string | null {
  if (!Object.hasOwn(SITUATIONS, enemyId)) return null;
  const lines = SITUATIONS[enemyId];
  if (lines === undefined || !Object.hasOwn(lines, attackId)) return null;
  return lines[attackId] ?? null;
}
