// Limits for the account routes. A tunnel lets the whole internet reach them, so every costly thing a stranger can
// ask for is counted: accounts made, passwords hashed, database queries, saves written. All of it is in memory and
// runs on a clock the tests move. docs/accounts.md has the same numbers with what each one bounds.
import { MINUTE_MS, THIS_MACHINE, createBudget } from "./roomLimits";
import type { Budget } from "./roomLimits";

/**
 * Sign-ups. A venue's Wi-Fi is one address, so the per-address number has room for a table of judges.
 * With MAX_ACCOUNTS (./accounts) these bound how fast and how far strangers can fill the database:
 * 30 accounts in ten minutes at most, so the cap of 2,000 takes more than eleven hours to reach.
 */
export const SIGNUP_WINDOW_MS = 10 * MINUTE_MS;
export const SIGNUPS_PER_ADDRESS = 10;
export const SIGNUPS_OVERALL = 30;
/**
 * Sign-ins, a minute. Each one costs a password hash (about 0.2 s of one core), so with the sign-ups above strangers
 * can spend at most about 13 s of one core a minute, and never more than one hash at a time (the gate below).
 * Guessing passwords is bounded by the same numbers: 60 guesses a minute over all names, from all addresses together.
 */
export const SIGNINS_PER_ADDRESS = 20;
export const SIGNINS_OVERALL = 60;
/**
 * Sign-in attempts on one name from other devices, right or wrong, in SIGNIN_NAME_WINDOW_MS: 1,440 guesses a day
 * at one account, however many addresses the guesser has. The price: a stranger who knows a name can keep its owner
 * from signing in on a new browser for as long as they keep trying. A browser already signed in is not affected,
 * and the laptop that runs the server is never counted.
 */
export const SIGNINS_PER_NAME = 10;
export const SIGNIN_NAME_WINDOW_MS = 10 * MINUTE_MS;
/** Requests with a session token (read save, write save, sign out), a minute. Each costs one or two small queries. */
export const REQUESTS_PER_ADDRESS = 120;
export const REQUESTS_OVERALL = 600;
/** Tokens the database did not know, a minute, per address. A token is 256 random bits; this only spares the database. */
export const WRONG_TOKENS_PER_ADDRESS = 20;
/** Saves written to one account, a minute, whoever sends them. One account holds one save, so this bounds writes, not size. */
export const SAVES_PER_ACCOUNT = 60;

/** Password hashes running at once, and how many more may wait for their turn. */
export const HASHES_AT_ONCE = 1;
export const HASHES_WAITING = 8;

const ALL = "all";

/** Thrown when the gate has no place left. The route answers 429. */
export class Busy extends Error {
  constructor() {
    super("too many at once");
    this.name = "Busy";
  }
}

export type Gate = <T>(work: () => Promise<T>, always?: boolean) => Promise<T>;

/**
 * Runs at most `atOnce` pieces of work at a time and lets `waiting` more wait in line. One more than that is refused
 * with Busy, unless it says `always`: the laptop's own browser waits its turn but is never turned away.
 */
export function createGate(atOnce: number = HASHES_AT_ONCE, waiting: number = HASHES_WAITING): Gate {
  let running = 0;
  const line: (() => void)[] = [];
  return async (work, always = false) => {
    if (running < atOnce) running += 1;
    else {
      if (!always && line.length >= waiting) throw new Busy();
      await new Promise<void>((resolve) => { line.push(resolve); });
    }
    try {
      return await work();
    } finally {
      // The place goes straight to the next in line, so nobody arriving now can take it first.
      const next = line.shift();
      if (next === undefined) running -= 1;
      else next();
    }
  };
}

export type AccountLimits = ReturnType<typeof createAccountLimits>;

export function createAccountLimits(now: () => number = Date.now) {
  const signUps = createBudget(SIGNUPS_PER_ADDRESS, SIGNUP_WINDOW_MS, now);
  const allSignUps = createBudget(SIGNUPS_OVERALL, SIGNUP_WINDOW_MS, now);
  const signIns = createBudget(SIGNINS_PER_ADDRESS, MINUTE_MS, now);
  const allSignIns = createBudget(SIGNINS_OVERALL, MINUTE_MS, now);
  const names = createBudget(SIGNINS_PER_NAME, SIGNIN_NAME_WINDOW_MS, now);
  const requests = createBudget(REQUESTS_PER_ADDRESS, MINUTE_MS, now);
  const allRequests = createBudget(REQUESTS_OVERALL, MINUTE_MS, now);
  const wrongTokens = createBudget(WRONG_TOKENS_PER_ADDRESS, MINUTE_MS, now);
  const saves = createBudget(SAVES_PER_ACCOUNT, MINUTE_MS, now);

  /** Seconds to wait, or 0 after counting one. */
  const take = (budget: Budget, who: string): number => {
    const wait = budget.wait(who);
    if (wait === 0) budget.count(who);
    return wait;
  };
  /**
   * One count against the client's own budget and one against everybody's. This machine is never counted or refused:
   * the laptop that runs the demo must not be locked out of its own accounts by strangers using up the shared budget.
   */
  const both = (own: Budget, shared: Budget) => (client: string): number => {
    if (client === THIS_MACHINE) return 0;
    const wait = Math.max(own.wait(client), shared.wait(ALL));
    if (wait === 0) {
      own.count(client);
      shared.count(ALL);
    }
    return wait;
  };

  return {
    /** Seconds `client` must wait before it signs up again; 0 lets it and counts it. Every attempt counts, also a refused one. */
    signUp: both(signUps, allSignUps),
    /** The same for a sign-in. */
    signIn: both(signIns, allSignIns),
    /** The same for one more attempt on the name with this key (nameKey in ./accountRules), whether or not the name exists. */
    signInName: (client: string, key: string): number => (client === THIS_MACHINE ? 0 : take(names, key)),
    /** The same for a request that carries a session token. */
    request: both(requests, allRequests),
    /** Tokens the database did not know. Asked before the lookup, counted after it. */
    wrongTokenWait: (client: string): number => (client === THIS_MACHINE ? 0 : wrongTokens.wait(client)),
    wrongTokenCount: (client: string): void => { if (client !== THIS_MACHINE) wrongTokens.count(client); },
    /** Seconds until this account may be written again; 0 lets it and counts it. This machine is counted too: the limit protects the database. */
    save: (accountId: string): number => take(saves, accountId),
  };
}
