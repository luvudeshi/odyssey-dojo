// The line under each boss's name on the face-off card, and the book of the Odyssey it comes from.
export const BOSS_CARDS: Readonly<Record<string, { readonly epithet: string; readonly book: number }>> = {
  polyphemus: { epithet: "The Cyclops", book: 9 },
  circe: { epithet: "The Witch of Aeaea", book: 10 },
  sirens: { epithet: "The Song That Drowns", book: 12 },
  scylla: { epithet: "Six Heads in the Cliff", book: 12 },
  charybdis: { epithet: "The Drinking Sea", book: 12 },
  suitors: { epithet: "The Hall of Ithaca", book: 22 },
};
