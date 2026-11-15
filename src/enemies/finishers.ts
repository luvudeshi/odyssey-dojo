// The line under the move's name on the FINISH card, one per stop. Three stops end by getting past, not by a blow
// (see ./endings.ts), so "Finish it" is wrong there: the card should name the getting past.
// Data only: nothing here is shown until the HUD asks for it.

export const FINISHER_LINE_MAX_LENGTH = 20;

/** Used for any enemy id with no line of its own. It is what the card has always said. */
export const GENERAL_FINISHER_LINE = "Finish it";

export const FINISHER_LINES: Readonly<Record<string, string>> = {
  polyphemus: "Finish it",
  circe: "Make her yield",
  // The crew row and the ship goes by.
  sirens: "Row past",
  // Circe's advice: do not stop to fight her, row hard.
  scylla: "Row through",
  // He catches the fig tree and hangs on above her.
  charybdis: "Reach the fig tree",
  suitors: "Finish it",
};

/** The FINISH card's line for an enemy id. An unknown id gets the general line; this never throws. */
export function finisherLine(enemyId: string): string {
  return Object.hasOwn(FINISHER_LINES, enemyId) ? (FINISHER_LINES[enemyId] ?? GENERAL_FINISHER_LINE) : GENERAL_FINISHER_LINE;
}
