// Limits for the account routes. A tunnel lets the whole internet reach them, so every costly thing a stranger can
// ask for is bounded: accounts made, passwords hashed, database queries, saves written. All of it is in memory and
// runs on a clock the tests move. docs/accounts.md has the same numbers with what each one bounds.
//
// Two rules keep one stranger from locking the others out. A budget is only spent by a request that costs something:
// an empty or malformed one is refused on the cheap per-address count alone. And nothing is shared by all strangers
// except the count of accounts really made; what many addresses can do at once is held by the gates, not by a count.
import { MINUTE_MS, THIS_MACHINE } from "./roomLimits";

/** Sign-up and sign-in requests of any kind from one address, a minute. Refusing one costs nothing; a body is 2 KB at most. */
export const ATTEMPTS_PER_ADDRESS = 60;
/**
 * Accounts made. A venue's Wi-Fi is one address through the tunnel, so the per-address number has room for a hall.
 * Only an account that was really made is counted: a typo, a taken name or an empty request uses up nothing.
 * With MAX_ACCOUNTS (./accounts) these bound how fast and how far strangers can fill the database.
 */
export const SIGNUP_WINDOW_MS = 10 * MINUTE_MS;
export const SIGNUPS_PER_ADDRESS = 40;
export const SIGNUPS_OVERALL = 120;
/** Sign-ins with a well-formed body from one address, a minute. Each costs a password hash (about 0.2 s of one core). */
export const SIGNINS_PER_ADDRESS = 30;
/**
 * Failed sign-ins on one name in SIGNIN_NAME_WINDOW_MS: ten from one address, a hundred from all addresses together.
 * A sign-in that works is not counted. So one stranger who knows a name cannot keep its owner out (the owner comes
 * from another address), and a guesser with many addresses still gets 14,400 guesses a day at one account at most.
 */
export const SIGNINS_PER_NAME_AND_ADDRESS = 10;
export const SIGNINS_PER_NAME = 100;
export const SIGNIN_NAME_WINDOW_MS = 10 * MINUTE_MS;
/**
 * Tokens from one address, a minute, that the database was asked about and did not know. A token is 256 random bits,
 * so this is not about guessing: it spares the database. A token that is known is not counted here.
 */
export const WRONG_TOKENS_PER_ADDRESS = 30;
/** Requests with a known token (read save, write save) for one account, a minute, whoever sends them. */
export const REQUESTS_PER_ACCOUNT = 120;
/** Saves written to one account, a minute, whoever sends them. One account holds one save, so this bounds writes, not size. */
export const SAVES_PER_ACCOUNT = 60;
/** How long a token the database knew is remembered, so a read and the write after it cost one lookup, not two. */
export const KNOWN_SESSION_MS = 5 * MINUTE_MS;
export const KNOWN_SESSIONS_MAX = 1_000;

/** Password hashes running at once, and how many more may wait for their turn. */
export const HASHES_AT_ONCE = 1;
export const HASHES_WAITING = 8;
/**
 * Database work for strangers running at once, and how many more may wait. The pool has four connections (./db), so
 * two always stay free for the laptop that runs the server, however many requests arrive in one instant.
 */
export const STRANGERS_AT_ONCE = 2;
export const STRANGERS_WAITING = 16;

const ALL = "all";
/** Past this many counted keys the expired ones are dropped, and past ten times this everything is forgotten: memory stays bounded. */
const PRUNE_AT = 1_000;

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

interface Counter {
  /** Seconds until `key` may go again, or 0 when it still has budget. Counts nothing. */
  readonly wait: (key: string) => number;
  readonly count: (key: string) => void;
  /** Takes one count back, for work that turned out not to be what the budget is for. */
  readonly giveBack: (key: string) => void;
}

/** At most `max` counts per key in a window that opens at the key's first count. */
function createCounter(max: number, windowMs: number, now: () => number): Counter {
  const used = new Map<string, { readonly from: number; count: number }>();
  const open = (key: string): { readonly from: number; count: number } | null => {
    const found = used.get(key);
    return found !== undefined && now() - found.from < windowMs ? found : null;
  };
  return {
    wait: (key) => {
      const found = open(key);
      return found !== null && found.count >= max ? Math.max(1, Math.ceil((found.from + windowMs - now()) / 1000)) : 0;
    },
    count: (key) => {
      const found = open(key);
      if (found !== null) {
        found.count += 1;
        return;
      }
      if (used.size >= PRUNE_AT) for (const [other, window] of used) if (now() - window.from >= windowMs) used.delete(other);
      if (used.size >= PRUNE_AT * 10) used.clear();
      used.set(key, { from: now(), count: 1 });
    },
    giveBack: (key) => {
      const found = open(key);
      if (found !== null && found.count > 0) found.count -= 1;
    },
  };
}

export interface KnownSessions {
  /** The account id of a token hash the database knew a short while ago, or null. */
  readonly get: (hash: string) => string | null;
  readonly remember: (hash: string, accountId: string) => void;
  readonly forget: (hash: string) => void;
}

/**
 * Token hashes the database knew in the last KNOWN_SESSION_MS, with their account. Never a token itself.
 * Signing out forgets one at once. A session ended in the database some other way stays good here for that long at most.
 */
export function createKnownSessions(now: () => number = Date.now, keepMs: number = KNOWN_SESSION_MS, max: number = KNOWN_SESSIONS_MAX): KnownSessions {
  const known = new Map<string, { readonly accountId: string; readonly until: number }>();
  return {
    get: (hash) => {
      const found = known.get(hash);
      if (found === undefined) return null;
      if (now() < found.until) return found.accountId;
      known.delete(hash);
      return null;
    },
    remember: (hash, accountId) => {
      if (known.size >= max) for (const [other, entry] of known) if (now() >= entry.until) known.delete(other);
      if (known.size >= max) known.clear();
      known.set(hash, { accountId, until: now() + keepMs });
    },
    forget: (hash) => { known.delete(hash); },
  };
}

export type AccountLimits = ReturnType<typeof createAccountLimits>;

export function createAccountLimits(now: () => number = Date.now) {
  const attempts = createCounter(ATTEMPTS_PER_ADDRESS, MINUTE_MS, now);
  const signUps = createCounter(SIGNUPS_PER_ADDRESS, SIGNUP_WINDOW_MS, now);
  const allSignUps = createCounter(SIGNUPS_OVERALL, SIGNUP_WINDOW_MS, now);
  const signIns = createCounter(SIGNINS_PER_ADDRESS, MINUTE_MS, now);
  const nameAndAddress = createCounter(SIGNINS_PER_NAME_AND_ADDRESS, SIGNIN_NAME_WINDOW_MS, now);
  const names = createCounter(SIGNINS_PER_NAME, SIGNIN_NAME_WINDOW_MS, now);
  const wrongTokens = createCounter(WRONG_TOKENS_PER_ADDRESS, MINUTE_MS, now);
  const requests = createCounter(REQUESTS_PER_ACCOUNT, MINUTE_MS, now);
  const saves = createCounter(SAVES_PER_ACCOUNT, MINUTE_MS, now);

  /** Seconds to wait, or 0 after counting one in every counter given. Nothing is counted when any of them is used up. */
  const take = (...held: readonly (readonly [Counter, string])[]): number => {
    const wait = Math.max(...held.map(([counter, key]) => counter.wait(key)));
    if (wait === 0) for (const [counter, key] of held) counter.count(key);
    return wait;
  };
  const local = (client: string): boolean => client === THIS_MACHINE;
  const pair = (client: string, key: string): string => `${client} ${key}`;

  // This machine is never counted or refused below, but for the saves of one account: the laptop that runs the demo
  // must not be locked out of its own accounts, whatever strangers do.
  return {
    /** Seconds `client` must wait before it asks to sign up or in again; 0 lets it and counts it. Asked before the body is read. */
    attempt: (client: string): number => (local(client) ? 0 : take([attempts, client])),
    /**
     * Seconds `client` must wait before it makes an account; 0 lets it and holds a place.
     * Call signUpNotMade when no account came of it (a taken name, a full database, a failure), so only accounts made are counted.
     */
    signUp: (client: string): number => (local(client) ? 0 : take([signUps, client], [allSignUps, ALL])),
    signUpNotMade: (client: string): void => {
      if (local(client)) return;
      signUps.giveBack(client);
      allSignUps.giveBack(ALL);
    },
    /**
     * Seconds `client` must wait before it signs in to the name with this key (nameKey in ./accountRules); 0 lets it and
     * counts it. The name is counted whether or not it exists, so a 429 says nothing about which names do.
     * Call signedIn when the password was right, so only failed attempts are held against the name.
     */
    signIn: (client: string, key: string): number =>
      (local(client) ? 0 : take([signIns, client], [nameAndAddress, pair(client, key)], [names, key])),
    signedIn: (client: string, key: string): void => {
      if (local(client)) return;
      nameAndAddress.giveBack(pair(client, key));
      names.giveBack(key);
    },
    /**
     * Seconds `client` must wait before the database is asked about one more token; 0 lets it and counts it.
     * Counted before the lookup, so requests sent together cannot all slip past. Call tokenKnown when the database knew it.
     */
    lookup: (client: string): number => (local(client) ? 0 : take([wrongTokens, client])),
    tokenKnown: (client: string): void => { if (!local(client)) wrongTokens.giveBack(client); },
    /** Seconds until this account may be asked for again by `client`; 0 lets it and counts it. */
    request: (client: string, accountId: string): number => (local(client) ? 0 : take([requests, accountId])),
    /** Seconds until this account may be written again; 0 lets it and counts it. This machine is counted too: the limit protects the database. */
    save: (accountId: string): number => take([saves, accountId]),
  };
}
