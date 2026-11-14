// The god scan with no network: names the god hiding in the player from their stance, then their colours, then chance.
import type { PoseFrame } from "../core/types";
import { log } from "../core/log";
import { GODS, GOD_IDS } from "./gods";
import type { GodId } from "./gods";
import { STANCES, readStance } from "./stance";
import { TINTS, tintId } from "./tint";
import type { Tint } from "./tint";

export { clothingTint } from "./tint";

export interface Reveal {
  readonly god: GodId;
  readonly epithet: string;
  /** One flattering sentence naming the cue that decided it. Never about the player's body or looks. */
  readonly reason: string;
  readonly rivalGod: GodId;
  readonly source: "ai" | "offline";
}

export interface RevealCues {
  /** The player's pose at the moment of the snapshot. */
  readonly frame: PoseFrame | null;
  /** The average colour of their clothing, 0..255 RGB: see clothingTint. */
  readonly tint: Tint | null;
  readonly seed: number;
}

// How each god receives a player the lot has chosen.
const LOT_WELCOMES: Readonly<Record<GodId, string>> = {
  zeus: "Zeus, who shares the thunder with very few",
  poseidon: "Poseidon, who has waited a long time for a champion worth the tide",
  athena: "Athena, who only ever backs the cleverest fighter in the hall",
  hermes: "Hermes, who is always quickest to claim a lucky find",
  artemis: "Artemis, who chooses few and never misses",
  apollo: "Apollo, who saves that bright welcome for a favourite",
};

/** The reason given when no cue decided it: the lot is cast, as Odysseus's crew do on Circe's island (Odyssey 10.206). */
export function lotReason(god: GodId): string {
  return `The lots were shaken in a bronze helmet, as Odysseus's crew cast them, and yours leapt out for ${LOT_WELCOMES[god]}.`;
}

/** A whole number from the seed, different for each salt and the same every time. */
function scramble(seed: number, salt: number): number {
  let h = ((Number.isFinite(seed) ? Math.floor(seed) : 0) + Math.imul(salt + 1, 0x9e3779b9)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function pick<T>(items: readonly [T, ...T[]], seed: number, salt: number): T {
  return items[scramble(seed, salt) % items.length] ?? items[0];
}

/** A cue reader must never stop the reveal: a frame it cannot read is the same as no cue. */
function cue<T>(name: string, read: () => T | null): T | null {
  try {
    return read();
  } catch (error) {
    log("warn", "gods.cue_unreadable", { name, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export function offlineReveal(cues: RevealCues): Reveal {
  const stance = cue("stance", () => readStance(cues.frame));
  const tint = stance ? null : cue("tint", () => tintId(cues.tint));
  const god = stance ? STANCES[stance].god : tint ? TINTS[tint].god : pick(GOD_IDS, cues.seed, 0);
  const reason = stance ? STANCES[stance].reason : tint ? TINTS[tint].reason : lotReason(god);
  return {
    god,
    epithet: pick(GODS[god].epithets, cues.seed, 1),
    reason,
    rivalGod: pick(GODS[god].rivals, cues.seed, 2),
    source: "offline",
  };
}
