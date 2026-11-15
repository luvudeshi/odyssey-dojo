// Limits for the hall of heroes. The tunnel, or a public server, lets the whole internet reach it, so what a stranger can ask of the
// database is bounded: fights written, and how often the hall is read. In memory, on a clock the tests move.
// docs/accounts.md has the same numbers with what each one bounds.
import { COUNTER_KEYS_MAX, createCounter } from "./accountLimits";
import { publicAccounts } from "./localOnly";
import type { Counter } from "./accountLimits";
import { MINUTE_MS, THIS_MACHINE } from "./roomLimits";

/** Fights one account may record a minute, whoever sends them. A fight takes twenty seconds or more, so this is already more than play gives. */
export const FIGHTS_PER_ACCOUNT = 4;
/** Fights one account may record an hour. An hour of play with no pause is under this. */
export const FIGHTS_PER_ACCOUNT_HOUR = 90;
/** Fights all strangers together may record a minute. Only a fight that was written is counted. At 120 a minute a full day is 172,800 rows. */
export const FIGHTS_OVERALL = 120;
/**
 * With PUBLIC_ACCOUNTS=1 the same 120 a minute are two counts. The first fight of an account in its minute has 90
 * places, and the second to fourth have 30 between them. A real player finishes one fight a minute at most, nearly
 * always, so their fight goes into the first count, which an account can take one place of a minute and no more.
 * With one count of 120, thirty accounts sending four a minute use it up for everybody; with two, those thirty take
 * 30 places of the first count and all of the second, and 60 places a minute are left for the others. Using up the
 * first count takes ninety accounts, and accounts are capped (./accountLimits).
 */
export const FIGHTS_FIRST_OVERALL = 90;
export const FIGHTS_MORE_OVERALL = 30;
/** Reads of the hall from one address, a minute. A venue's Wi-Fi is one address through the tunnel; each open Account page asks six times a minute. */
export const HALL_READS_PER_ADDRESS = 300;
/**
 * With PUBLIC_ACCOUNTS=1: a room behind one address is one address, and so is everybody who comes through the page's
 * host; each open board asks six times a minute, so this is 200 boards. A read is answered from memory.
 */
export const PUBLIC_HALL_READS_PER_ADDRESS = 1200;
/** How long one reading of the hall is given out again. However many ask, the database is asked once in this time. */
export const HALL_CACHE_MS = 5_000;

const HOUR_MS = 60 * MINUTE_MS;
const ALL = "all";
const NOTHING = (): void => undefined;

export type HeroLimits = ReturnType<typeof createHeroLimits>;

export interface FightPlace {
  /** Seconds until this account may record one more fight, or 0 when it may and was counted. */
  readonly wait: number;
  /** Gives back what the fight took of the strangers' shared counts. Call it when no row came of the fight. Safe to call twice. */
  readonly notWritten: () => void;
}

/**
 * `isPublic` is what publicAccounts() says (./localOnly), asked once at the first request. Off, the numbers and the
 * one shared count are the ones this file had before the setting existed; on, the two shared counts and the PUBLIC_ number.
 */
export function createHeroLimits(now: () => number = Date.now, isPublic: () => boolean = publicAccounts) {
  const build = (open: boolean) => {
    const keys = open ? COUNTER_KEYS_MAX : undefined;
    return {
      open,
      minute: createCounter(FIGHTS_PER_ACCOUNT, MINUTE_MS, now, keys),
      hour: createCounter(FIGHTS_PER_ACCOUNT_HOUR, HOUR_MS, now, keys),
      /** Not public: the one count all strangers share. */
      overall: createCounter(FIGHTS_OVERALL, MINUTE_MS, now, keys),
      /** Public. One place a minute an account: whether its fight is the first of its minute. */
      first: createCounter(1, MINUTE_MS, now, keys),
      firstOverall: createCounter(FIGHTS_FIRST_OVERALL, MINUTE_MS, now, keys),
      moreOverall: createCounter(FIGHTS_MORE_OVERALL, MINUTE_MS, now, keys),
      reads: createCounter(open ? PUBLIC_HALL_READS_PER_ADDRESS : HALL_READS_PER_ADDRESS, MINUTE_MS, now, keys),
    };
  };
  let built: ReturnType<typeof build> | null = null;
  const c = (): ReturnType<typeof build> => (built ??= build(isPublic()));

  /** Seconds to wait, or 0 after counting one in every counter given. Nothing is counted when any of them is used up. */
  const take = (...held: readonly (readonly [Counter, string])[]): number => {
    const wait = Math.max(...held.map(([counter, key]) => counter.wait(key)));
    if (wait === 0) for (const [counter, key] of held) counter.count(key);
    return wait;
  };
  const local = (client: string): boolean => client === THIS_MACHINE;

  /**
   * Counts one fight for this account, or says how long it must wait. The account is counted whoever sends, this
   * machine too: the limit protects the table. The counts shared by all strangers leave this machine out.
   * Call `notWritten` when no row came of it, so only fights really written use up what strangers share, and when
   * public a first fight that was not written leaves the account its first place.
   */
  const fightPlace = (client: string, accountId: string): FightPlace => {
    const { open, minute, hour, overall, first, firstOverall, moreOverall } = c();
    const own = [[minute, accountId], [hour, accountId]] as const;
    if (local(client)) return { wait: take(...own), notWritten: NOTHING };
    if (!open) {
      const wait = take(...own, [overall, ALL]);
      if (wait > 0) return { wait, notWritten: NOTHING };
      let back = false;
      return { wait: 0, notWritten: () => { if (!back) overall.giveBack(ALL); back = true; } };
    }
    let isFirst = first.wait(accountId) === 0;
    let wait = isFirst ? take(...own, [first, accountId], [firstOverall, ALL]) : take(...own, [moreOverall, ALL]);
    // A first fight that found the first count used up may still take a place of the second.
    if (wait > 0 && isFirst && take(...own, [moreOverall, ALL]) === 0) {
      wait = 0;
      isFirst = false;
    }
    if (wait > 0) return { wait, notWritten: NOTHING };
    const wasFirst = isFirst;
    let given = false;
    return {
      wait: 0,
      notWritten: () => {
        if (given) return;
        given = true;
        if (wasFirst) {
          first.giveBack(accountId);
          firstOverall.giveBack(ALL);
        } else moreOverall.giveBack(ALL);
      },
    };
  };

  return {
    fightPlace,
    /**
     * The two calls this file had before fightPlace, kept with their meaning: seconds until this account may record
     * one more fight, 0 lets it and counts it; and fightNotWritten gives one place of the strangers' one shared count
     * back. When public there are two shared counts and only fightPlace knows which one a fight took, so there
     * fightNotWritten gives nothing back, which is the careful side. The route uses fightPlace.
     */
    fight: (client: string, accountId: string): number => fightPlace(client, accountId).wait,
    fightNotWritten: (client: string): void => { if (!local(client) && !c().open) c().overall.giveBack(ALL); },
    /** Seconds until `client` may read the hall again; 0 lets it and counts it. This machine is never refused. */
    read: (client: string): number => (local(client) ? 0 : take([c().reads, client])),
  };
}
