// Homer's line before and after every stop of the quest, his closing line for the homecoming, and each monster's spoken taunts.
// docs/narration-lines.md mirrors this script and a test keeps the two equal. Clips are named after the line id, so ids must never change.
// Polyphemus's opening line and his taunts were recorded first: they stay in storyLines.ts and public/audio/athena/.
// This file adds the rest and looks across both. It is plain data, so the clip tool in server/tools can read it too.
import { clipUrl } from "./athenaLines";
import { STORY_LINES } from "./storyLines";
import type { StoryLine } from "./storyLines";

/** The stops in the order the game plays them. A test fails if the enemy files disagree. */
export const QUEST_ORDER = ["polyphemus", "circe", "sirens", "scylla", "charybdis", "suitors"] as const;

export type NarrationMoment = "before" | "after";

export interface QuestLine extends StoryLine {
  /** The stop this line belongs to. */
  readonly enemyId: string;
}

/** Homer's words are ours, not a translation's. Each says what the Odyssey says happened at that stop. */
export const NARRATION_LINES: readonly QuestLine[] = [
  {
    id: "homer_after_polyphemus",
    enemyId: "polyphemus",
    speaker: "homer",
    when: "After the Polyphemus fight is won",
    text: "Blinded, the Cyclops hurled a crag after their ship, and begged his father Poseidon to curse the long road home.",
  },
  {
    id: "homer_before_circe",
    enemyId: "circe",
    speaker: "homer",
    when: "Before the Circe fight",
    text: "In her hall Circe turned his men to swine. But Hermes gave Odysseus moly, the herb no spell can master.",
  },
  {
    id: "homer_after_circe",
    enemyId: "circe",
    speaker: "homer",
    when: "After the Circe fight is won",
    text: "Circe cried out and swore the great oath. She turned the swine back into men, and feasted them a full year.",
  },
  {
    id: "homer_before_sirens",
    enemyId: "sirens",
    speaker: "homer",
    when: "Before the Sirens fight",
    text: "He stopped his men's ears with wax, and they bound him to the mast. Then the Sirens began to sing.",
  },
  {
    id: "homer_after_sirens",
    enemyId: "sirens",
    speaker: "homer",
    when: "After the Sirens fight is won",
    text: "He begged to be set free, but the crew rowed on and bound him tighter, until the song died astern.",
  },
  {
    id: "homer_before_scylla",
    enemyId: "scylla",
    speaker: "homer",
    when: "Before the Scylla fight",
    text: "In a cave above the strait waited Scylla: six heads on six long necks, each with three rows of teeth.",
  },
  {
    id: "homer_after_scylla",
    enemyId: "scylla",
    speaker: "homer",
    when: "After the Scylla fight is won",
    text: "Six heads, six men. She took the best of the crew, and they cried his name as the ship ran on.",
  },
  {
    id: "homer_before_charybdis",
    enemyId: "charybdis",
    speaker: "homer",
    when: "Before the Charybdis fight",
    text: "Across the strait Charybdis drank the dark sea down, then spewed it up seething, like a cauldron on a great fire.",
  },
  {
    id: "homer_after_charybdis",
    enemyId: "charybdis",
    speaker: "homer",
    when: "After the Charybdis fight is won",
    text: "The ship was gone. He hung from the fig tree like a bat, until she gave his timbers back.",
  },
  {
    id: "homer_before_suitors",
    enemyId: "suitors",
    speaker: "homer",
    when: "Before the fight with the suitors",
    text: "In beggar's rags he strung the great bow no suitor could bend, and the string sang like a swallow.",
  },
  {
    id: "homer_after_suitors",
    enemyId: "suitors",
    speaker: "homer",
    when: "After the fight with the suitors is won",
    text: "So the hall fell silent. Odysseus, sacker of cities, was home, and Penelope knew him by the secret of their bed.",
  },
  {
    id: "homer_homecoming",
    enemyId: "suitors",
    speaker: "homer",
    when: "The quest is won: the last stop's result screen",
    text: "The great bow sang, and the suitors fell. After twenty years Odysseus was home in Ithaca, with Penelope beside him at last.",
  },
];

/** Homer's closing line, spoken once the last stop is won in place of that stop's "after" line. It belongs to no stop's before or after. */
export const HOMECOMING_ID = "homer_homecoming";

/** Each text is copied word for word from that enemy's `taunts` in src/enemies/defs. A test fails if one is not there. */
export const TAUNT_LINES: readonly QuestLine[] = [
  { id: "taunt_circe_1", enemyId: "circe", speaker: "monster", when: "Circe taunts the player", text: "Drink, stranger. You have come a long way." },
  { id: "taunt_circe_2", enemyId: "circe", speaker: "monster", when: "Circe taunts the player", text: "To the sty with you. Lie down with your friends." },
  { id: "taunt_circe_3", enemyId: "circe", speaker: "monster", when: "Circe taunts the player", text: "No man has ever tasted this and kept his mind." },
  {
    id: "taunt_sirens_1",
    enemyId: "sirens",
    speaker: "monster",
    when: "The Sirens taunt the player",
    text: "Come closer, Odysseus, pride of the Achaeans. Stay your ship and hear us.",
  },
  {
    id: "taunt_sirens_2",
    enemyId: "sirens",
    speaker: "monster",
    when: "The Sirens taunt the player",
    text: "No one rows past until he has heard the sweetness of our song.",
  },
  {
    id: "taunt_sirens_3",
    enemyId: "sirens",
    speaker: "monster",
    when: "The Sirens taunt the player",
    text: "We know all that was suffered at Troy. We know everything that happens on the earth.",
  },
  // Scylla's file has one taunt, so she has one clip. Add taunts there first, then lines here.
  { id: "taunt_scylla_1", enemyId: "scylla", speaker: "monster", when: "Scylla taunts the player", text: "Six of your crew. That is the toll." },
  {
    id: "taunt_charybdis_1",
    enemyId: "charybdis",
    speaker: "monster",
    when: "Charybdis taunts the player",
    text: "Three times a day she drinks the sea, and three times gives it back.",
  },
  {
    id: "taunt_charybdis_2",
    enemyId: "charybdis",
    speaker: "monster",
    when: "Charybdis taunts the player",
    text: "Not even the Earth-shaker could pull you out of there.",
  },
  {
    id: "taunt_charybdis_3",
    enemyId: "charybdis",
    speaker: "monster",
    when: "Charybdis taunts the player",
    text: "Hold to the fig tree. Hold until she gives your timbers back.",
  },
  {
    id: "taunt_suitors_1",
    enemyId: "suitors",
    speaker: "monster",
    when: "The suitors taunt the player",
    text: "Stand off from my table, beggar, or you will be sorry you came.",
  },
  {
    id: "taunt_suitors_2",
    enemyId: "suitors",
    speaker: "monster",
    when: "The suitors taunt the player",
    text: "Stranger, you have shot your last. The vultures will have you here.",
  },
  {
    id: "taunt_suitors_3",
    enemyId: "suitors",
    speaker: "monster",
    when: "The suitors taunt the player",
    text: "Friends, draw your swords and hold the tables up against his arrows!",
  },
];

/** Every line Homer or a monster can speak: the ones recorded first, then the ones in this file. */
export const ALL_STORY_LINES: readonly StoryLine[] = [...STORY_LINES, ...NARRATION_LINES, ...TAUNT_LINES];

/** The index files that list which of this file's clips exist. Athena's index lists the lines recorded first. */
export const STORY_INDEX_URLS = ["/audio/narration/index.json", "/audio/taunts/index.json"] as const;

const FOLDERS: ReadonlyMap<string, string> = new Map([
  ...NARRATION_LINES.map((line) => [line.id, "narration"] as const),
  ...TAUNT_LINES.map((line) => [line.id, "taunts"] as const),
]);

/** Where a line's clip is. Anything this file does not list is in Athena's folder. */
export function storyClipUrl(id: string): string {
  const folder = FOLDERS.get(id);
  return folder === undefined ? clipUrl(id) : `/audio/${folder}/${id}.mp3`;
}

const STORY_IDS: ReadonlySet<string> = new Set(ALL_STORY_LINES.map((line) => line.id));

/** True for Homer's and the monsters' lines, false for Athena's and for ids nobody knows. */
export function isStoryLine(id: string): boolean {
  return STORY_IDS.has(id);
}

/** Polyphemus's opening line keeps the id it was recorded under. */
const RECORDED_FIRST: Readonly<Record<string, string>> = { homer_before_polyphemus: "homer_intro_polyphemus" };

/** Homer's line for before or after this stop, or null when the stop has none. */
export function narrationId(enemyId: string, moment: NarrationMoment): string | null {
  const wanted = `homer_${moment}_${enemyId}`;
  const id = RECORDED_FIRST[wanted] ?? wanted;
  return STORY_IDS.has(id) ? id : null;
}

/** Which enemy speaks this taunt: "taunt_circe_2" is Circe's. Null for anything that is not a taunt id. */
function tauntOwner(id: string): string | null {
  return /^taunt_(.+)_\d+$/.exec(id)?.[1] ?? null;
}

/** The ids of every taunt recorded for this enemy, in script order. */
export function tauntIds(enemyId: string): readonly string[] {
  return ALL_STORY_LINES.filter((line) => line.speaker === "monster" && tauntOwner(line.id) === enemyId).map((line) => line.id);
}

/** A taunt for this enemy, or null when it has none recorded. `random` is 0..1. */
export function pickTaunt(enemyId: string, random: () => number): string | null {
  const ids = tauntIds(enemyId);
  return ids[Math.min(ids.length - 1, Math.max(0, Math.floor(random() * ids.length)))] ?? null;
}
