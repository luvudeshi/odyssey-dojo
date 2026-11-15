// The hall of heroes, seen from the browser: sends each finished fight of a signed-in player to the server, and
// reads the lists of best scores. Signed out, a fight sends nothing; the hall itself is only read when a screen asks.
// Nothing here throws or keeps the game waiting: a fight is sent in the background and its answer is forgotten.
// The browser's fetch is passed in, so tests use a made-up one. ./hall wires this to the real one.
import { z } from "zod";
import { REQUEST_TIMEOUT_MS } from "./client";
import type { AccountFetch } from "./client";
import { SESSION_KEY, parseSession } from "./session";
import type { FightResult } from "./store";
import { fightSeconds } from "./tally";

// The bounds of one fight. The server holds the same ones (server/lib/heroRules.ts; tests/accountHeroes.test.ts keeps
// the two alike). A fight outside them is not sent: the server would refuse it.
export const HERO_SCORE_MAX = 30_000;
export const HERO_SECONDS_MIN = 1;
export const HERO_SECONDS_MAX = 3600;
export const HERO_COMBO_MAX = 500;
/** The id of a stop, a fighting style or a god, as the game writes them. */
export const HERO_SLUG = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const id = z.string().min(1).max(64);
const count = z.number().int().min(0);
const RowSchema = z.object({
  hero: z.string().min(1).max(64),
  score: count,
  /** Where the best score was made: the stop, the fighting style and the god, as ids. */
  stop: id,
  style: id,
  god: id.nullable(),
  /** True on the row of the player whose session asked. */
  you: z.boolean(),
});
export type HallRow = z.infer<typeof RowSchema>;

export const HallSchema = z.object({
  at: z.string().max(60),
  /** The best score of each hero in the last 24 hours, highest first, ten at most. */
  tonight: z.array(RowSchema).max(10),
  allTime: z.array(RowSchema).max(10),
  lastHour: count,
  fightsEver: count,
  /** Fights and wins at each stop in the last 24 hours, most wins first. */
  stops: z.array(z.object({ stop: id, fights: count, wins: count })).max(12),
  /** Fights per `minutes`, oldest first; the last bucket ends at `until`. */
  activity: z.object({ minutes: z.number().min(1).max(1440), until: z.string().max(60), fights: z.array(count).max(200) }),
});
export type Hall = z.infer<typeof HallSchema>;

/** One fight as it is sent. */
export interface FightReport {
  readonly stop: string;
  readonly won: boolean;
  readonly score: number;
  readonly style: string;
  readonly god: string | null;
  readonly seconds: number | null;
  readonly bestCombo: number | null;
  readonly hero: string;
}

const whole = (value: number): number | null => (Number.isFinite(value) && value >= 0 ? Math.round(value) : null);

/**
 * What is sent for one finished fight, or null when the server would refuse it (an id that is not a slug, a score
 * nobody could have made). How long it took is clamped, not refused: a fight left paused for a day is still a fight.
 */
export function fightReport(fight: FightResult, hero: string): FightReport | null {
  const score = whole(fight.score);
  if (!HERO_SLUG.test(fight.enemyId) || !HERO_SLUG.test(fight.styleId) || score === null || score > HERO_SCORE_MAX) return null;
  const seconds = fightSeconds(fight.tally);
  const combo = whole(fight.tally.bestCombo);
  const god = fight.godId ?? null;
  return {
    stop: fight.enemyId,
    won: fight.won,
    score,
    style: fight.styleId,
    god: god !== null && HERO_SLUG.test(god) ? god : null,
    seconds: seconds === null ? null : Math.min(HERO_SECONDS_MAX, Math.max(HERO_SECONDS_MIN, Math.round(seconds * 10) / 10)),
    bestCombo: combo === null ? null : Math.min(combo, HERO_COMBO_MAX),
    hero,
  };
}

/** The part of localStorage read here. Private windows may throw on the call. */
export interface SessionReader {
  getItem(key: string): string | null;
}

export interface HeroesDeps {
  readonly fetch: AccountFetch;
  readonly storage: SessionReader | null;
  /** The hero name as the player's screen shows it. */
  readonly heroName: () => string;
  readonly base?: string;
}

export interface HeroesClient {
  /**
   * Sends one finished fight when a player is signed in, once for each fight however often it is given.
   * True when the server wrote it down. Signed out it sends nothing. Never throws.
   */
  readonly record: (fight: FightResult) => Promise<boolean>;
  /** The hall, with the reader's own row marked when signed in. Null when there is none to show: no accounts, no answer, too many requests. */
  readonly hall: () => Promise<Hall | null>;
}

export function createHeroesClient(deps: HeroesDeps): HeroesClient {
  const base = deps.base ?? "";
  // Told apart by their tally: each fight makes its own, and the result screen hands the same one over however often it draws.
  const sent = new WeakSet<object>();

  const token = (): string | null => {
    try {
      return parseSession(deps.storage?.getItem(SESSION_KEY) ?? null)?.token ?? null;
    } catch {
      return null;
    }
  };

  const call = async (method: string, path: string, body?: string): Promise<{ readonly status: number; readonly data: unknown } | null> => {
    try {
      const session = token();
      const headers: Record<string, string> = {};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (session !== null) headers.Authorization = `Bearer ${session}`;
      const response = await deps.fetch(`${base}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body } : {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return { status: response.status, data: await response.json().catch(() => null) };
    } catch {
      return null;
    }
  };

  return {
    async record(fight) {
      if (token() === null || sent.has(fight.tally)) return false;
      const report = fightReport(fight, deps.heroName());
      if (report === null) return false;
      sent.add(fight.tally);
      const answer = await call("POST", "/api/account/fights", JSON.stringify({ fight: report }));
      return answer?.status === 201;
    },
    async hall() {
      const answer = await call("GET", "/api/heroes");
      const hall = answer?.status === 200 ? HallSchema.safeParse(answer.data) : null;
      return hall?.success ? hall.data : null;
    },
  };
}
