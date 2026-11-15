// How each stop ends, the way the Odyssey ends it: mostly by getting away, once by standing at home. Sources in docs/endings.md.

export interface Ending {
  /** "escape": the win is getting away. "stand": the win is holding your own ground. */
  readonly kind: "escape" | "stand";
  /** Shown when the player wins the stop. At most 60 characters. */
  readonly win: string;
  /** Shown when the player loses the stop. At most 60 characters. */
  readonly loss: string;
  /** The self-defense idea this ending carries. At most 90 characters. */
  readonly lesson: string;
}

/** Used for any enemy id with no ending of its own. */
export const GENERAL_ENDING: Ending = {
  kind: "escape",
  win: "You got away safe. The way home is open.",
  loss: "Not this time. Catch your breath and try again.",
  lesson: "The aim is to get home safe, not to win a fight.",
};

/** One ending per enemy id in ./defs. */
export const ENDINGS: Readonly<Record<string, Ending>> = {
  polyphemus: {
    kind: "escape",
    win: "You are out of the cave, and your men are out with you.",
    loss: "The cave holds you a while longer. Catch your breath.",
    lesson: "Getting out is the win. You do not have to beat someone to be safe.",
  },
  circe: {
    kind: "escape",
    win: "The spell did not take you. She lets your men go.",
    loss: "The spell holds for now. Clear your head and try again.",
    lesson: "A clear head is your best guard. Spot a trick early and you keep your choices.",
  },
  sirens: {
    kind: "escape",
    win: "You heard the song, and the ship sailed on past.",
    loss: "The song pulls you in this time. Steady yourself and retry.",
    lesson: "Plan ahead and lean on friends. The help you set up early holds when it gets hard.",
  },
  scylla: {
    kind: "escape",
    win: "You are past the strait. Six were lost; the ship is through.",
    loss: "The strait turns you back. Rest, then steer through again.",
    lesson: "Some dangers cannot be beaten. Do not stop to fight: keep moving and get through.",
  },
  charybdis: {
    kind: "escape",
    win: "You held on to the fig tree and got clear of the whirlpool.",
    loss: "The whirlpool pulls you back. Hold on and try once more.",
    lesson: "Hold on to something solid and wait for your moment. Staying calm gets you out.",
  },
  suitors: {
    kind: "stand",
    win: "You stood your ground. Your home is your own again.",
    loss: "The hall is not yours yet. Get up and try again.",
    lesson: "Standing your ground is the last choice, for when you are home and cannot leave.",
  },
};

const BY_ID: ReadonlyMap<string, Ending> = new Map(Object.entries(ENDINGS));

/** The ending for an enemy id. An unknown id gets the general ending; this never throws. */
export function endingFor(enemyId: string): Ending {
  return BY_ID.get(enemyId) ?? GENERAL_ENDING;
}
