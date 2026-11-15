// Two sentences the screens build from an enemy: the win headline verb and the intro's call to hold fast.
// Some foes are plural (the Sirens, the Suitors) or female (Circe, Scylla, Charybdis), so "falls" and "him" need data.

interface Grammar {
  readonly verb: "falls" | "fall";
  readonly pronoun: "him" | "her" | "them";
}

const GRAMMAR: Readonly<Record<string, Grammar>> = {
  polyphemus: { verb: "falls", pronoun: "him" },
  circe: { verb: "falls", pronoun: "her" },
  sirens: { verb: "fall", pronoun: "them" },
  scylla: { verb: "falls", pronoun: "her" },
  charybdis: { verb: "falls", pronoun: "her" },
  suitors: { verb: "fall", pronoun: "them" },
};

/** The win headline, e.g. "The Sirens fall". An unknown id gets the singular verb. */
export function fallsLine(enemyId: string, name: string): string {
  return `${name} ${GRAMMAR[enemyId]?.verb ?? "falls"}`;
}

/** The intro's second sentence. An unknown id gets a line that needs no pronoun. */
export function holdFastLine(enemyId: string): string {
  const grammar = GRAMMAR[enemyId];
  return grammar
    ? `Hold fast, son of Laertes: the way home runs through ${grammar.pronoun}.`
    : "Hold fast, son of Laertes: the way home lies ahead.";
}
