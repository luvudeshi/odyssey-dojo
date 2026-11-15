// Limits for the hall of heroes. The tunnel lets the whole internet reach it, so what a stranger can ask of the
// database is bounded: fights written, and how often the hall is read. In memory, on a clock the tests move.
// docs/accounts.md has the same numbers with what each one bounds.
import { createCounter } from "./accountLimits";
import type { Counter } from "./accountLimits";
import { MINUTE_MS, THIS_MACHINE } from "./roomLimits";

/** Fights one account may record a minute, whoever sends them. A fight takes twenty seconds or more, so this is already more than play gives. */
export const FIGHTS_PER_ACCOUNT = 4;
/** Fights one account may record an hour. An hour of play with no pause is under this. */
export const FIGHTS_PER_ACCOUNT_HOUR = 90;
/** Fights all strangers together may record a minute. Only a fight that was written is counted. At 120 a minute a full day is 172,800 rows. */
export const FIGHTS_OVERALL = 120;
/** Reads of the hall from one address, a minute. A venue's Wi-Fi is one address through the tunnel; each open Account page asks six times a minute. */
export const HALL_READS_PER_ADDRESS = 300;
/** How long one reading of the hall is given out again. However many ask, the database is asked once in this time. */
export const HALL_CACHE_MS = 5_000;

const HOUR_MS = 60 * MINUTE_MS;
const ALL = "all";

export type HeroLimits = ReturnType<typeof createHeroLimits>;

export function createHeroLimits(now: () => number = Date.now) {
  const minute = createCounter(FIGHTS_PER_ACCOUNT, MINUTE_MS, now);
  const hour = createCounter(FIGHTS_PER_ACCOUNT_HOUR, HOUR_MS, now);
  const overall = createCounter(FIGHTS_OVERALL, MINUTE_MS, now);
  const reads = createCounter(HALL_READS_PER_ADDRESS, MINUTE_MS, now);

  /** Seconds to wait, or 0 after counting one in every counter given. Nothing is counted when any of them is used up. */
  const take = (...held: readonly (readonly [Counter, string])[]): number => {
    const wait = Math.max(...held.map(([counter, key]) => counter.wait(key)));
    if (wait === 0) for (const [counter, key] of held) counter.count(key);
    return wait;
  };
  const local = (client: string): boolean => client === THIS_MACHINE;

  return {
    /**
     * Seconds until this account may record one more fight; 0 lets it and counts it. The account is counted whoever
     * sends, this machine too: the limit protects the table. The count shared by all strangers leaves this machine out.
     * Call fightNotWritten when no row came of it, so only fights really written use up what strangers share.
     */
    fight: (client: string, accountId: string): number =>
      take([minute, accountId], [hour, accountId], ...(local(client) ? [] : [[overall, ALL] as const])),
    fightNotWritten: (client: string): void => { if (!local(client)) overall.giveBack(ALL); },
    /** Seconds until `client` may read the hall again; 0 lets it and counts it. This machine is never refused. */
    read: (client: string): number => (local(client) ? 0 : take([reads, client])),
  };
}
