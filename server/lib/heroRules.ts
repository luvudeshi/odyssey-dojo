// What the hall of heroes accepts: one finished fight, as the browser reports it. Pure rules and zod schemas:
// no database, no Node. The score is the browser's word and nothing more (it is a game, not a bank), so every
// number has a range a real fight stays inside, and the limits in ./heroLimits hold how often one may be sent.
import { z } from "zod";
import { accountName } from "./accountRules";

/** The whole body of one fight, as JSON. A real one is under 200 bytes. */
export const FIGHT_BODY_BYTES = 1024;
/**
 * The highest score that is believed. A fight scores ten a point of damage and fifty a blow turned aside; the last
 * stop has 435 hit points, so a long, clean win there is under 10,000. Three times that is refused.
 */
export const SCORE_MAX = 30_000;
/** How long a fight may have taken, in seconds. The browser measures from the first frame of the fight to the last. */
export const SECONDS_MIN = 1;
export const SECONDS_MAX = 3600;
export const COMBO_MAX = 500;
/** The id of a stop, a fighting style or a god: a short slug as the game writes them ("polyphemus", "kung_fu"). Which ones exist is not checked. */
export const SLUG = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const slug = z.string().regex(SLUG);

const fightSchema = z.object({
  stop: slug,
  won: z.boolean(),
  score: z.number().int().min(0).max(SCORE_MAX),
  style: slug,
  god: slug.nullish(),
  seconds: z.number().min(SECONDS_MIN).max(SECONDS_MAX).nullish(),
  bestCombo: z.number().int().min(0).max(COMBO_MAX).nullish(),
  /** The hero name as the player's screen shows it. Cleaned like an account name; one that cannot be a name is left out. */
  hero: z.string().max(200).nullish(),
});

export interface Fight {
  readonly stop: string;
  readonly won: boolean;
  readonly score: number;
  readonly style: string;
  readonly god: string | null;
  readonly seconds: number | null;
  readonly bestCombo: number | null;
  /** Null when the browser sent no usable name: the hall then shows the name of the account. */
  readonly hero: string | null;
}

const fightBodySchema = z.object({ fight: fightSchema });

/** The fight in a POST body, or null when it is not one. Fields beside the known ones are left out. */
export function parseFightBody(body: unknown): Fight | null {
  const parsed = fightBodySchema.safeParse(body);
  if (!parsed.success) return null;
  const { stop, won, score, style, god, seconds, bestCombo, hero } = parsed.data.fight;
  return {
    stop, won, score, style,
    god: god ?? null,
    // Kept to a tenth of a second: nothing finer means anything.
    seconds: seconds === null || seconds === undefined ? null : Math.round(seconds * 10) / 10,
    bestCombo: bestCombo ?? null,
    hero: accountName(hero ?? null),
  };
}
