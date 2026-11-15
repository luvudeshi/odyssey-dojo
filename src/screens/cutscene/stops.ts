// The line under each boss's name on the plate.
export const EPITHETS: Readonly<Record<string, string>> = {
  polyphemus: "The Cyclops",
  circe: "The Witch of Aeaea",
  sirens: "The Song That Drowns",
  scylla: "Six Heads in the Cliff",
  charybdis: "The Drinking Sea",
  suitors: "The Hall of Ithaca",
};

const NUMERALS = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII", "XXIII", "XXIV"];

export function bookLine(book: number): string {
  return `Book ${NUMERALS[book] ?? String(book)} of the Odyssey`;
}
