// Five handcrafted levels used whenever the model is slow, wrong or unreachable. Bundled with the game, so they work offline.
import type { GodId, LevelAttack, LevelRequest, LevelSpec } from "./contracts";
import { rivalFor } from "./rivals";

interface Template {
  /** Words in the player's phrase that point at this level. */
  readonly keywords: readonly string[];
  readonly level: LevelSpec;
}

const GOD_NAMES: Readonly<Record<GodId, string>> = {
  zeus: "Zeus",
  poseidon: "Poseidon",
  athena: "Athena",
  hermes: "Hermes",
  artemis: "Artemis",
  apollo: "Apollo",
};

/** Used when the caller has no epithet from the god scan. */
const DEFAULT_EPITHETS: Readonly<Record<GodId, string>> = {
  zeus: "cloud-gatherer",
  poseidon: "earth-shaker",
  athena: "grey-eyed",
  hermes: "swift-footed guide",
  artemis: "arrow-pouring",
  apollo: "lord of the silver bow",
};

const attack = (
  type: LevelAttack["type"],
  direction: LevelAttack["direction"],
  telegraph_ms: number,
  combo: number,
  weight: number,
): LevelAttack => ({ type, direction, telegraph_ms, combo, weight });

// {god}, {epithet}, {rival} and {phrase} are filled in by fallbackLevel.
const TEMPLATES: readonly [Template, ...Template[]] = [
  {
    keywords: ["storm", "thunder", "lightning", "rain", "tornado", "hurricane", "texas", "wild", "wind", "tempest", "electric"],
    level: {
      title: "The Storm-Drunk Brawl at Scylla's Strait",
      interpretation: "\"{phrase}\": sudden, loud and from every side at once.",
      arena: {
        setting: "A splintering deck in the narrows, black cliffs on one side and six necks rising on the other.",
        palette: ["#0b1a2b", "#1f4e6b", "#7fd1e8", "#f2f6f7"],
        weather: "storm",
        lighting: "night",
      },
      monster: { base: "scylla", name: "Scylla of the Six Thunders", speed: 1.2, aggression: 0.8, erratic: 0.7 },
      attack_pool: [
        attack("strike", "left", 800, 2, 0.9),
        attack("strike", "right", 800, 2, 0.9),
        attack("sweep", "high", 900, 1, 0.7),
        attack("slam", "center", 1100, 1, 0.6),
        attack("projectile", "center", 950, 1, 0.5),
        attack("sweep", "low", 900, 1, 0.5),
        attack("feint", "left", 700, 1, 0.3),
        attack("strike", "high", 650, 3, 0.4),
      ],
      tempo_bpm: 138,
      phases: [
        { name: "First Squall", duration_s: 22, intensity: 0.45 },
        { name: "The Six Necks", duration_s: 26, intensity: 0.75 },
        { name: "Eye of the Storm", duration_s: 24, intensity: 1 },
      ],
      taunts: [
        "Six of your crew. That is the toll.",
        "The strait is narrow, little god. I am not.",
        "Sing to the thunder. It answers only me.",
        "{rival} sends warm regards and cold water.",
        "One head sleeps. Five are hungry.",
      ],
      narration_intro:
        "Sing, Muse, of {god} the {epithet}, who came down in mortal shape to the strait where {rival} had loosed Scylla upon the storm.",
      narration_outro_win: "And the six heads sank hissing under the swell, and the sea lay flat before {god} as before a king.",
      narration_outro_lose: "But the storm closed over the deck, and {rival} laughed long in the deep. Rise again: the strait still waits.",
    },
  },
  {
    keywords: ["drunk", "sloppy", "chaos", "chaotic", "party", "crazy", "random", "cat", "3am", "clumsy", "silly", "goofy", "toddler", "wobbly"],
    level: {
      title: "The Wine-Dark Riot in Ithaca's Hall",
      interpretation: "\"{phrase}\": no plan, no rhythm, and somehow that is the plan.",
      arena: {
        setting: "The great hall of Odysseus, tables overturned, torches guttering, a hundred suitors deep in his wine.",
        palette: ["#2a0f1c", "#7a1f3d", "#e0a23a", "#f4e3c1"],
        weather: "embers",
        lighting: "dusk",
      },
      monster: { base: "suitor_horde", name: "Antinous and the Hundred Cups", speed: 1, aggression: 0.6, erratic: 1 },
      attack_pool: [
        attack("strike", "left", 950, 1, 0.8),
        attack("strike", "right", 950, 1, 0.8),
        attack("projectile", "high", 1000, 1, 0.8),
        attack("feint", "center", 800, 1, 0.6),
        attack("feint", "right", 800, 1, 0.5),
        attack("grab", "center", 1100, 1, 0.5),
        attack("sweep", "low", 1000, 1, 0.5),
        attack("slam", "center", 1200, 1, 0.3),
      ],
      tempo_bpm: 112,
      phases: [
        { name: "The Toast", duration_s: 20, intensity: 0.35 },
        { name: "Thrown Cups", duration_s: 25, intensity: 0.65 },
        { name: "The Whole Hall", duration_s: 25, intensity: 0.9 },
      ],
      taunts: [
        "Another beggar at the door! Pour him a fist.",
        "Mind the stool. It flies.",
        "We have eaten this house. You are dessert.",
        "Was that a dodge or did you trip?",
        "{rival} is buying the next round.",
      ],
      narration_intro:
        "Tell now, Muse, how {god} the {epithet} walked disguised into the hall of Ithaca, where {rival} had set the suitors roaring.",
      narration_outro_win: "Then the hall fell silent, and the cups lay where they dropped, and {god} stood alone among the benches.",
      narration_outro_lose: "But the suitors drank on over the fallen, and {rival} smiled into the wine. The door is still open: come again.",
    },
  },
  {
    keywords: ["slow", "heavy", "strong", "tank", "bear", "rock", "mountain", "giant", "power", "hammer", "boulder", "brute", "bull", "truck"],
    level: {
      title: "The Stone-Fisted Reckoning in the Cyclops' Cave",
      interpretation: "\"{phrase}\": few blows, each one meant to end it.",
      arena: {
        setting: "A firelit cave stacked with cheeses and bones, the mouth sealed by a stone no twenty wagons could move.",
        palette: ["#1a120c", "#5a3a22", "#d9772b", "#f0d9b5"],
        weather: "embers",
        lighting: "underworld",
      },
      monster: { base: "cyclops", name: "Polyphemus the Unblinking", speed: 0.5, aggression: 0.6, erratic: 0.15 },
      attack_pool: [
        attack("slam", "center", 1400, 1, 1),
        attack("sweep", "left", 1300, 1, 0.8),
        attack("sweep", "right", 1300, 1, 0.8),
        attack("grab", "high", 1200, 1, 0.6),
        attack("projectile", "center", 1500, 1, 0.6),
        attack("slam", "low", 1300, 1, 0.5),
        attack("strike", "high", 1100, 2, 0.3),
      ],
      tempo_bpm: 76,
      phases: [
        { name: "The Sealed Door", duration_s: 25, intensity: 0.3 },
        { name: "The Club", duration_s: 30, intensity: 0.6 },
        { name: "The Blinded Rage", duration_s: 25, intensity: 0.95 },
      ],
      taunts: [
        "Nobody? I will eat Nobody last.",
        "My father shakes the earth. I only shake you.",
        "Stand still. The stone is patient.",
        "You are loud for a mouthful.",
        "{rival} will hear of this.",
      ],
      narration_intro:
        "Sing, Muse, of {god} the {epithet}, shut in the cave of the one-eyed giant whom {rival} had roused from his sleep.",
      narration_outro_win: "And the giant fell as a pine falls on the mountain, and the stone rolled from the door before {god}.",
      narration_outro_lose: "But the great hand closed, and the cave was dark again. {rival} is not yet answered: rise.",
    },
  },
  {
    keywords: ["fast", "quick", "ninja", "assassin", "precise", "dance", "dancer", "elegant", "graceful", "flow", "kung", "blade", "sharp", "light"],
    level: {
      title: "The Silver-Tongued Duel on the Sirens' Rocks",
      interpretation: "\"{phrase}\": quick, exact, and never where the blow lands.",
      arena: {
        setting: "White rocks in a windless sea, bright with flowers and the bones of sailors, three winged singers circling.",
        palette: ["#10222e", "#2f8f9d", "#f6c1d0", "#fff4d6", "#c7a6ff"],
        weather: "fog",
        lighting: "dawn",
      },
      monster: { base: "sirens", name: "The Three Who Sing", speed: 1.4, aggression: 0.7, erratic: 0.5 },
      attack_pool: [
        attack("projectile", "left", 650, 2, 0.9),
        attack("projectile", "right", 650, 2, 0.9),
        attack("strike", "high", 600, 3, 0.8),
        attack("feint", "center", 550, 1, 0.6),
        attack("sweep", "low", 700, 1, 0.6),
        attack("grab", "center", 900, 1, 0.4),
        attack("feint", "left", 550, 1, 0.4),
        attack("strike", "center", 700, 2, 0.5),
      ],
      tempo_bpm: 156,
      phases: [
        { name: "The First Verse", duration_s: 20, intensity: 0.4 },
        { name: "Three Voices", duration_s: 24, intensity: 0.7 },
        { name: "The Last Note", duration_s: 22, intensity: 1 },
      ],
      taunts: [
        "Come closer. The song is better here.",
        "We know every war you ever lost.",
        "No wax in your ears? Brave. Foolish.",
        "Faster, little god. The tide is.",
        "{rival} taught us this one.",
      ],
      narration_intro:
        "Tell, Muse, of {god} the {epithet}, who came unbound to the flowering rocks where {rival} had bidden the Sirens sing.",
      narration_outro_win: "Then the song broke off mid-word, and the white rocks were only rocks, and {god} sailed on unbound.",
      narration_outro_lose: "But the song went on, sweet over the bones, and {rival} kept time. Stop your ears and come again.",
    },
  },
  {
    keywords: ["calm", "patient", "defensive", "wise", "old", "monk", "turtle", "zen", "careful", "steady", "water", "tide", "chess", "quiet"],
    level: {
      title: "The Patient Tide at Charybdis' Maw",
      interpretation: "\"{phrase}\": wait, read the water, move once.",
      arena: {
        setting: "A fig tree over a whirlpool that drinks the sea three times a day and gives it back in thunder.",
        palette: ["#06141f", "#0f4c5c", "#5fb3b3", "#e8f1f2"],
        weather: "rain",
        lighting: "dusk",
      },
      monster: { base: "charybdis", name: "Charybdis the Thrice-Drinking", speed: 0.8, aggression: 0.5, erratic: 0.2 },
      attack_pool: [
        attack("sweep", "left", 1200, 1, 0.9),
        attack("sweep", "right", 1200, 1, 0.9),
        attack("grab", "low", 1300, 1, 0.8),
        attack("slam", "center", 1300, 1, 0.6),
        attack("projectile", "high", 1100, 1, 0.5),
        attack("feint", "center", 1000, 1, 0.4),
        attack("sweep", "low", 1000, 2, 0.4),
      ],
      tempo_bpm: 90,
      phases: [
        { name: "The Ebb", duration_s: 25, intensity: 0.3 },
        { name: "The Draw", duration_s: 28, intensity: 0.6 },
        { name: "The Flood", duration_s: 25, intensity: 0.9 },
      ],
      taunts: [
        "Three times a day I drink the sea. You are a sip.",
        "Hold the fig tree. It will not hold you.",
        "Patience? I have swallowed fleets of it.",
        "The water remembers every ship.",
        "{rival} poured you into my cup.",
      ],
      narration_intro:
        "Sing, Muse, of {god} the {epithet}, who clung above the drinking sea where {rival} had stirred Charybdis from the deep.",
      narration_outro_win: "And the whirlpool stilled, and the fig tree stood over quiet water, and {god} let go at last.",
      narration_outro_lose: "But the sea went down black and took all with it, and {rival} was glad. The tide turns: so can you.",
    },
  },
];

function fillIn(line: string, words: Readonly<Record<string, string>>): string {
  return line.replace(/\{(\w+)\}/g, (whole, key: string) => words[key] ?? whole);
}

/** A small stable hash, so the same phrase always gets the same level when no keyword matches. */
function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}

/** The handcrafted level closest to the player's phrase, with their god, epithet and rival written in. */
export function fallbackLevel(request: LevelRequest): LevelSpec {
  const words = new Set(request.phrase.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word !== ""));
  const scored = TEMPLATES.map((template) => template.keywords.filter((keyword) => words.has(keyword)).length);
  const best = Math.max(...scored);
  const index = best > 0 ? scored.indexOf(best) : hash(request.phrase.toLowerCase()) % TEMPLATES.length;
  const { level } = TEMPLATES[index] ?? TEMPLATES[0];

  const phrase = request.phrase.replace(/\s+/g, " ").trim();
  const fill = (line: string, max: number): string =>
    fillIn(line, {
      god: GOD_NAMES[request.god],
      // A request may still carry Athena, or the god itself, as the rival: the schema allows any god.
      rival: GOD_NAMES[rivalFor(request.god, request.rival_god)],
      epithet: request.epithet === undefined || request.epithet === "" ? DEFAULT_EPITHETS[request.god] : request.epithet,
      phrase: phrase.length > 60 ? `${phrase.slice(0, 57)}...` : phrase,
    }).slice(0, max);

  return {
    ...level,
    interpretation: fill(level.interpretation, 160),
    taunts: level.taunts.map((taunt) => fill(taunt, 120)),
    narration_intro: fill(level.narration_intro, 400),
    narration_outro_win: fill(level.narration_outro_win, 300),
    narration_outro_lose: fill(level.narration_outro_lose, 300),
  };
}

export const FALLBACK_COUNT = TEMPLATES.length;
