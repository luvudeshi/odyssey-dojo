// Limits for the account routes. A tunnel, or a public server (PUBLIC_ACCOUNTS=1 in ./localOnly), lets the whole
// internet reach them, so every costly thing a stranger can ask for is bounded: accounts made, passwords hashed,
// database queries, saves written. All of it is in memory and runs on a clock the tests move, but for the accounts
// made in the last hour and day, which the database is asked for as well (./accounts), so a restart forgets nothing.
// docs/accounts.md has the same numbers with what each one bounds.
//
// Three rules keep one stranger from locking the others out. A budget is only spent by a request that costs
// something: an empty or malformed one is refused on the cheap per-address count alone. Nothing is shared by all
// strangers except the count of accounts really made; what many addresses can do at once is held by the gates, not by
// a count. And a count never forgets a key that was counted often to make room for keys that were counted once.
//
// What "an address" is. Through a tunnel on this machine it is the visitor's own address. On a public server it is
// the address the server's own proxy took the request from (callerOf below). When the page is served by a host that
// passes /api on (Vercel in front of Caddy, docs/accounts.md), that is the host's address and not the visitor's: all
// visitors who come through the page share a handful of addresses, and a stranger who calls the server's own name has
// one of their own. So no per-address number here is tight enough to hurt a room of people behind one address, and
// nothing that protects the database rests on an address: the gates, the caps for all callers together and the counts
// per account and per name do that.
import type { IncomingHttpHeaders } from "node:http";
import { wasRelayed } from "./localOnly";
import { MINUTE_MS, RELAYED, THIS_MACHINE, clientKey } from "./roomLimits";

const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Sign-up requests of any kind from one address, a minute, and as many sign-in requests, counted apart: a flood of
 * sign-ups from an address cannot stop a sign-in from it. Refusing one costs nothing; a body is 2 KB at most.
 * A room of a hundred behind one address, each with a typo, is 200 a minute.
 */
export const ATTEMPTS_PER_ADDRESS = 240;
/**
 * Accounts made. Only an account that was really made is counted: a typo, a taken name or an empty request uses up nothing.
 * One address: 60 in ten minutes, so a room behind one address all get in and one address cannot take the whole
 * ten minutes for itself. All callers but this machine together: 120 in ten minutes, 200 in an hour, 600 in a day.
 * 200 is a judge and a full room in one hour with room to spare. 600 a day means the 1,900 places strangers can
 * take (MAX_ACCOUNTS in ./accounts) last more than three days of somebody doing nothing else, and a day of them is
 * 19 MB of saves at the very most. Past the hour or the day sign-up is closed and sign-in goes on.
 */
export const SIGNUP_WINDOW_MS = 10 * MINUTE_MS;
export const SIGNUPS_PER_ADDRESS = 60;
export const SIGNUPS_OVERALL = 120;
export const SIGNUPS_PER_HOUR = 200;
export const SIGNUPS_PER_DAY = 600;
/** Sign-ins with a well-formed body from one address, a minute. Each costs a password hash (about 0.2 s of one core). */
export const SIGNINS_PER_ADDRESS = 60;
/**
 * Failed sign-ins on one name in SIGNIN_NAME_WINDOW_MS: five from one address, twenty from all addresses together.
 * A sign-in that works is not counted. The window is one minute, so a name is never held for longer than a minute
 * after the wrong passwords stop: whoever wants to keep an owner out has to keep sending them. A guesser gets
 * 7,200 guesses a day at one account from one address and 28,800 from all addresses together, at most.
 */
export const SIGNINS_PER_NAME_AND_ADDRESS = 5;
export const SIGNINS_PER_NAME = 20;
export const SIGNIN_NAME_WINDOW_MS = MINUTE_MS;
/**
 * Tokens from one address, a minute, that the database was asked about and did not know. A token is 256 random bits,
 * so this is not about guessing: it spares the database. A token that is known is not counted here.
 */
export const WRONG_TOKENS_PER_ADDRESS = 120;
/** Requests with a known token (read save, write save) for one account, a minute, whoever sends them. */
export const REQUESTS_PER_ACCOUNT = 120;
/** Saves written to one account, a minute, whoever sends them. One account holds one save, so this bounds writes, not size. */
export const SAVES_PER_ACCOUNT = 60;
/** How long a token the database knew is remembered, so a read and the write after it cost one lookup, not two. */
export const KNOWN_SESSION_MS = 5 * MINUTE_MS;
export const KNOWN_SESSIONS_MAX = 1_000;

/**
 * Password hashes running at once, and how many more may wait for their turn. Nine hashes are under two seconds on
 * the demo laptop and under five on a slow shared core, inside the eight seconds a browser waits for an answer.
 */
export const HASHES_AT_ONCE = 1;
export const HASHES_WAITING = 8;
/**
 * Database work for strangers running at once, and how many more may wait. The pool has four connections (./db), so
 * two always stay free for the laptop that runs the server, however many requests arrive in one instant.
 * A place is held for statements only, never while a password is hashed (./accounts).
 */
export const STRANGERS_AT_ONCE = 2;
export const STRANGERS_WAITING = 16;

const ALL = "all";
/** Past this many counted keys the expired ones are dropped. */
const PRUNE_AT = 1_000;
/** Keys one counter holds at most. One more makes room by dropping the keys counted least (see createCounter). */
export const COUNTER_KEYS_MAX = 10_000;
/** How many of them are dropped at once, so a flood of new keys does not search the whole list for each one. */
const DROP_AT_ONCE = 1_000;

/**
 * Who an account or hall request is counted against. `behindProxy` is what publicAccounts() said (./localOnly): the
 * server then sits behind its own proxy, and the key is the last X-Forwarded-For entry, which that proxy wrote
 * (clientKey in ./roomLimits). Only a request the guard also calls local is this machine: clientKey knows fewer proxy
 * headers than the guard does, and a request that was passed on must never get the laptop's free pass.
 */
export function callerOf(socketAddress: string | undefined, headers: IncomingHttpHeaders, behindProxy = false): string {
  const who = clientKey(socketAddress, headers, behindProxy);
  return who === THIS_MACHINE && wasRelayed(headers) ? RELAYED : who;
}

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

export interface Counter {
  /** Seconds until `key` may go again, or 0 when it still has budget. Counts nothing. */
  readonly wait: (key: string) => number;
  readonly count: (key: string) => void;
  /** Takes one count back, for work that turned out not to be what the budget is for. */
  readonly giveBack: (key: string) => void;
}

/**
 * At most `max` counts per key in a window that opens at the key's first count.
 * It holds `maxKeys` keys at most. When one more arrives and none has run out, the keys counted least are dropped,
 * the oldest first, and never the rest. So a flood of made-up keys, each counted once, pushes out its own kind and
 * cannot wipe a key that was counted often: the wrong passwords already held against a real name stay held.
 */
export function createCounter(max: number, windowMs: number, now: () => number, maxKeys: number = COUNTER_KEYS_MAX): Counter {
  const used = new Map<string, { readonly from: number; count: number }>();
  /** The size at which the list is next gone through. It doubles after each pass, up to `maxKeys`, so a flood of new keys does not go through the list for each one. */
  let lookAt = Math.min(PRUNE_AT, maxKeys);
  const makeRoom = (): void => {
    for (const [other, window] of used) if (now() - window.from >= windowMs) used.delete(other);
    if (used.size < maxKeys) return;
    let least = Number.POSITIVE_INFINITY;
    for (const window of used.values()) least = Math.min(least, window.count);
    let dropped = 0;
    for (const [other, window] of used) {
      if (window.count !== least) continue;
      used.delete(other);
      dropped += 1;
      if (dropped >= Math.min(DROP_AT_ONCE, maxKeys)) break;
    }
  };
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
      if (used.size >= lookAt) {
        makeRoom();
        lookAt = Math.min(maxKeys, Math.max(PRUNE_AT, used.size * 2));
      }
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
  const hourSignUps = createCounter(SIGNUPS_PER_HOUR, HOUR_MS, now);
  const daySignUps = createCounter(SIGNUPS_PER_DAY, DAY_MS, now);
  const signIns = createCounter(SIGNINS_PER_ADDRESS, MINUTE_MS, now);
  const nameAndAddress = createCounter(SIGNINS_PER_NAME_AND_ADDRESS, SIGNIN_NAME_WINDOW_MS, now);
  const names = createCounter(SIGNINS_PER_NAME, SIGNIN_NAME_WINDOW_MS, now);
  const wrongTokens = createCounter(WRONG_TOKENS_PER_ADDRESS, MINUTE_MS, now);
  const requests = createCounter(REQUESTS_PER_ACCOUNT, MINUTE_MS, now);
  const saves = createCounter(SAVES_PER_ACCOUNT, MINUTE_MS, now);
  /** What all callers but this machine share: accounts made in ten minutes, in an hour and in a day. */
  const shared: readonly Counter[] = [allSignUps, hourSignUps, daySignUps];

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
    /**
     * Seconds `client` must wait before it asks to sign up, or to sign in, again; 0 lets it and counts it. Asked
     * before the body is read. The two are counted apart, so sign-ups from an address never use up its sign-ins.
     */
    attempt: (client: string, what: "signup" | "signin" = "signin"): number => (local(client) ? 0 : take([attempts, pair(what, client)])),
    /**
     * Seconds until strangers may make accounts again, or 0 while they may. More than 0 means the accounts all callers
     * together may make in ten minutes, an hour or a day are used up: sign-up is closed for everybody but this
     * machine, whoever asks, and sign-in goes on. Counts nothing.
     */
    signUpsClosed: (client: string): number => (local(client) ? 0 : Math.max(...shared.map((counter) => counter.wait(ALL)))),
    /**
     * Seconds `client` must wait before it makes an account; 0 lets it and holds a place.
     * Call signUpNotMade when no account came of it (a taken name, a full database, a failure), so only accounts made are counted.
     */
    signUp: (client: string): number => (local(client) ? 0 : take([signUps, client], ...shared.map((counter) => [counter, ALL] as const))),
    signUpNotMade: (client: string): void => {
      if (local(client)) return;
      signUps.giveBack(client);
      for (const counter of shared) counter.giveBack(ALL);
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
