// Accounts over a Db: the tables, sign-up, sign-in, sessions, sign-out, and one saved game per account.
// A password is kept only as a slow salted hash (scrypt), a session token only as its SHA-256, and every value goes
// to the database apart from the statement text. The save is one checked JSON document that is only ever given back to its owner.
// When the database cannot be reached every call here throws Unavailable at once, and the game plays as signed out.
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { log } from "../../src/core/log";
import { SIGNUPS_PER_DAY, SIGNUPS_PER_HOUR, createGate, createKnownSessions } from "./accountLimits";
import type { Gate } from "./accountLimits";
import { createEdits } from "./accountEdits";
import type { Edits } from "./accountEdits";
import { nameKey, saveSchema } from "./accountRules";
import { publicAccounts } from "./localOnly";
import type { Save } from "./accountRules";
import { failureCode } from "./db";
import type { Db } from "./db";

/**
 * The cost of one password hash: 128 MB and about 0.2 s of one core on the demo laptop. N = 2^17, r = 8, p = 1 is
 * the first scrypt setting on OWASP's password storage sheet. The settings are not stored with the hash, so
 * changing them needs a column that says which setting a row was made with.
 */
export const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 160 * 1024 * 1024 } as const;
export const SALT_BYTES = 16;
export const HASH_BYTES = 64;
export const TOKEN_BYTES = 32;
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
/** Sessions one account keeps. Signing in on one more browser ends the oldest. Bounds the sessions table at five rows an account. */
export const MAX_SESSIONS = 5;
/** Accounts the database holds at most. Past it sign-up is refused; with 32 KB a save that is 64 MB of saves at the very most. */
export const MAX_ACCOUNTS = 2000;
/** Places no stranger can take, so the laptop that runs the server can still make an account when strangers have filled the rest. */
export const ACCOUNTS_KEPT_FOR_THIS_MACHINE = 100;
/** After a failed start the database is tried again this often, and no more often. */
export const RETRY_MS = 15_000;
/** How long an answer to "is the database there" is believed. While it is believed gone every call fails at once. */
export const STATUS_CACHE_MS = 5_000;
/** Queries that must fail one after another, with none working between them, before the database is believed gone. One slow query is not an outage. */
export const FAILURES_TO_GIVE_UP = 3;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PREFIX = /^(?:[a-z][a-z0-9_]{0,30})?$/;

export class Unavailable extends Error {
  constructor() {
    super("accounts unavailable");
    this.name = "Unavailable";
  }
}

/** The key scrypt makes from a password and a salt. The password is put in one Unicode form first, so the same password typed on two keyboards is the same. */
export function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, HASH_BYTES, SCRYPT, (error, key) => {
      if (error === null) resolve(key);
      else reject(error);
    });
  });
}

/** Whether the password makes the expected key. The comparison takes the same time wherever the two differ. */
export async function verifyPassword(password: string, salt: Buffer, expected: Buffer): Promise<boolean> {
  const got = await hashPassword(password, salt);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** A new session token: 32 random bytes as 43 characters that are safe in a header. */
export function makeToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** What the database keeps of a token, as hex. A stolen table gives no token back. */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** The token in an Authorization header, or null when the header is missing or is not "Bearer" and a token of the right shape. */
export function bearerToken(header: unknown): string | null {
  if (typeof header !== "string") return null;
  const token = /^Bearer ([^\s]+)$/i.exec(header.trim())?.[1];
  return token !== undefined && TOKEN.test(token) ? token : null;
}

export interface Tables {
  readonly accounts: string;
  readonly sessions: string;
  readonly saves: string;
}

/** The table names. A prefix is only for tests, which make their own tables beside the real ones; it is checked because it becomes part of the statement text. */
export function tables(prefix = ""): Tables {
  if (!PREFIX.test(prefix)) throw new Error("bad table prefix");
  return { accounts: `${prefix}accounts`, sessions: `${prefix}sessions`, saves: `${prefix}saves` };
}

/** The statements that make the tables, each safe to run again. */
export function schemaSql(prefix = ""): readonly string[] {
  const t = tables(prefix);
  return [
    `create table if not exists ${t.accounts} (
      id uuid primary key,
      name text not null,
      name_key text not null unique,
      pass_hash bytea not null,
      salt bytea not null,
      created_at timestamptz not null
    )`,
    `create table if not exists ${t.sessions} (
      token_hash bytea primary key,
      account_id uuid not null references ${t.accounts} (id) on delete cascade,
      created_at timestamptz not null,
      expires_at timestamptz not null
    )`,
    `create index if not exists ${t.sessions}_account on ${t.sessions} (account_id)`,
    `create table if not exists ${t.saves} (
      account_id uuid primary key references ${t.accounts} (id) on delete cascade,
      data jsonb not null,
      updated_at timestamptz not null
    )`,
  ];
}

/**
 * One statement through the accounts' own door: the tables are made first, a failure is logged and becomes Unavailable.
 * It is refused while the accounts are off, but its own failures never turn them off.
 */
export type Statement = (text: string, params: readonly unknown[]) => Promise<unknown[]>;
const doors = new WeakMap<object, Statement>();

/**
 * The door these accounts run their statements through, for code that keeps tables of its own beside them (./heroes).
 * Null for accounts that createAccounts did not make, such as a test's stand-in.
 */
export function statementsOf(accounts: object): Statement | null {
  return doors.get(accounts) ?? null;
}

/**
 * Runs one piece of database work. The routes pass the strangers' gate here (STRANGERS_AT_ONCE in ./accountLimits),
 * so a place at it is held for statements only. The password hash between them waits at its own gate and holds no
 * place: however many slow sign-ins arrive, the two places are free again as soon as a statement has its answer.
 */
export type Reach = <T>(work: () => Promise<T>) => Promise<T>;
const direct: Reach = (work) => work();

/** How many accounts there may be. Only tests change these, to reach a cap with a handful of accounts. */
export interface Caps {
  /** Accounts in all. */
  readonly total: number;
  /** Places of `total` no stranger can take. */
  readonly keptForThisMachine: number;
  /** Accounts made in the last hour and the last 24 hours, past which a stranger makes no more. This machine is not held by these. */
  readonly perHour: number;
  readonly perDay: number;
}

export interface Signed {
  readonly token: string;
  readonly name: string;
}

export interface Stored {
  readonly save: Save | null;
  readonly updatedAt: string | null;
}

export interface Accounts extends Edits {
  /** Whether the database answers. Never throws. Asked at most once every STATUS_CACHE_MS. */
  readonly available: () => Promise<boolean>;
  /**
   * `name` is already cleaned (accountName). `urgent` is this machine: it waits for a hash however long the line is,
   * may use the places kept for it, and is not held by the accounts made this hour or today. `reach` runs the
   * statements (see Reach); the hash runs outside it. "full": the database holds as many accounts as it may.
   * "closed": as many were made in the last hour or day as strangers may make; the database is asked, so this holds
   * after a restart and with a second server on the same database. Only with PUBLIC_ACCOUNTS=1 (AccountsOptions.isPublic):
   * without it the hour and the day are not asked for and "closed" is never the answer. With it a taken name is also
   * answered before the hash; without it the hash comes first, as it always did.
   */
  readonly signUp: (name: string, password: string, urgent?: boolean, reach?: Reach) => Promise<Signed | "name_taken" | "full" | "closed">;
  /** Null for an unknown name and for a wrong password alike, after the same work. `reach` as for signUp. */
  readonly signIn: (name: string, password: string, urgent?: boolean, reach?: Reach) => Promise<Signed | null>;
  readonly signOut: (token: string) => Promise<void>;
  /** The id of the account a token belongs to, or null when the token is unknown or its session has run out. */
  readonly accountOf: (token: string) => Promise<string | null>;
  /**
   * The same, without asking the database: the account when accountOf found this token in the last KNOWN_SESSION_MS
   * (./accountLimits) and it was not signed out since, else null. A session that ran out or was ended to make room
   * for a newer one can stay good here for that long at most.
   */
  readonly remembered: (token: string) => string | null;
  readonly readSave: (accountId: string) => Promise<Stored>;
  readonly writeSave: (accountId: string, save: Save) => Promise<{ readonly updatedAt: string }>;
  readonly close: () => Promise<void>;
}

export interface AccountsOptions {
  readonly now?: () => number;
  /** A table name prefix, for tests. */
  readonly prefix?: string;
  readonly gate?: Gate;
  /** Replaces the caps on accounts, for tests. */
  readonly caps?: Partial<Caps>;
  /** What publicAccounts() says (./localOnly), asked at each sign-up. Off, sign-up asks the database what it always asked and nothing else. */
  readonly isPublic?: () => boolean;
}

// What the database gives back is checked like anything else that comes from outside.
const count = z.coerce.number().int().min(0);
const countRow = z.object({ n: count, hour: count.default(0), day: count.default(0) });
const idRow = z.object({ id: z.string().min(1).max(64) });
const accountRow = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  pass_hash: z.string().regex(/^[0-9a-f]+$/),
  salt: z.string().regex(/^[0-9a-f]+$/),
});
const saveRow = z.object({ data: z.string(), updated_at: z.string().min(1).max(40) });

/** A timestamp as text, read back in the very form new Date().toISOString() writes it. */
const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/**
 * `open` gives the database, or null when there is none. It is called on first use and, after a failure, at most
 * every RETRY_MS, so a database that comes back is found again without a restart.
 */
export function createAccounts(open: () => Promise<Db | null>, options: AccountsOptions = {}): Accounts {
  const now = options.now ?? Date.now;
  const gate = options.gate ?? createGate();
  const isPublic = options.isPublic ?? publicAccounts;
  const caps: Caps = {
    total: MAX_ACCOUNTS, keptForThisMachine: ACCOUNTS_KEPT_FOR_THIS_MACHINE, perHour: SIGNUPS_PER_HOUR, perDay: SIGNUPS_PER_DAY, ...options.caps,
  };
  const t = tables(options.prefix);
  const schema = schemaSql(options.prefix);
  // Sign-in does the same work for a name nobody has: a hash against this salt, which never matches.
  const nobody = { salt: randomBytes(SALT_BYTES), hash: randomBytes(HASH_BYTES) };

  let db: Db | null = null;
  let ready = false;
  let triedAt = Number.NEGATIVE_INFINITY;
  let opening: Promise<Db | null> | null = null;
  let checkedAt = Number.NEGATIVE_INFINITY;
  let answers = false;
  let checking: Promise<boolean> | null = null;
  let failures = 0;
  const known = createKnownSessions(now);

  const believe = (up: boolean): void => {
    answers = up;
    checkedAt = now();
  };

  /** The database with its tables made, or null. Two callers at once share one attempt. */
  const link = (): Promise<Db | null> => {
    if (db !== null && ready) return Promise.resolve(db);
    if (opening !== null) return opening;
    if (now() - triedAt < RETRY_MS) return Promise.resolve(null);
    triedAt = now();
    opening = (async () => {
      try {
        db ??= await open();
        if (db === null) return null;
        for (const statement of schema) await db.query(statement, []);
        ready = true;
        log("info", "accounts_ready");
        return db;
      } catch (error) {
        log("warn", "accounts_tables_failed", failureCode(error));
        return null;
      } finally {
        opening = null;
      }
    })();
    return opening;
  };

  /**
   * One statement. A failure is logged as its short code, never its message, and becomes Unavailable. No connection at all, or
   * FAILURES_TO_GIVE_UP failures in a row, also turn the routes off for STATUS_CACHE_MS. A statement that is not
   * `counted` (the hall's, see `doors` below) is never one of those failures: the hall can fail while the accounts work.
   */
  const run = async (text: string, params: readonly unknown[], counted = true, tolerate?: string): Promise<unknown[]> => {
    if (now() - checkedAt < STATUS_CACHE_MS && !answers) throw new Unavailable();
    const found = await link();
    if (found === null) {
      believe(false);
      throw new Unavailable();
    }
    try {
      const rows = await found.query<unknown>(text, params);
      if (counted) {
        failures = 0;
        believe(true);
      }
      return rows;
    } catch (error) {
      // An error the caller expects (a unique key hit by a race) is an answer, so the database is up and nothing is logged as a fault.
      if (tolerate !== undefined && failureCode(error) === tolerate) {
        if (counted) {
          failures = 0;
          believe(true);
        }
        return [];
      }
      log("warn", "accounts_query_failed", failureCode(error));
      if (counted) {
        failures += 1;
        if (failures >= FAILURES_TO_GIVE_UP) believe(false);
      }
      throw new Unavailable();
    }
  };

  const iso = (ms: number): string => new Date(ms).toISOString();

  /** Rows of the expected shape. A row that is not is a fault of ours or of the database, never the caller's: Unavailable. */
  const rowsOf = <T>(shape: z.ZodType<T>, rows: unknown[]): T[] => {
    const parsed = z.array(shape).safeParse(rows);
    if (parsed.success) return parsed.data;
    log("error", "accounts_bad_row");
    throw new Unavailable();
  };

  /** Ends the account's sessions that have run out, and its oldest ones until one more fits. */
  const makeRoom = async (accountId: string, at: string): Promise<void> => {
    await run(
      `delete from ${t.sessions} where account_id = $1::uuid and (expires_at <= $2::timestamptz or token_hash not in (
        select token_hash from ${t.sessions} where account_id = $1::uuid and expires_at > $2::timestamptz order by created_at desc limit $3::int
      ))`,
      [accountId, at, MAX_SESSIONS - 1],
    );
  };

  const edits = createEdits({
    run, table: t, gate, known, hash: hashPassword, verify: verifyPassword, tokenHash, saltBytes: SALT_BYTES, rowsOf,
  });
  const made: Accounts = {
    ...edits,
    available: () => {
      if (now() - checkedAt < STATUS_CACHE_MS) return Promise.resolve(answers);
      checking ??= run("select 1", []).then(() => true, () => false).finally(() => { checking = null; });
      return checking;
    },

    signUp: async (name, password, urgent = false, reach = direct) => {
      const asked = now();
      // Asked of the database and not of this server's memory: what a restart forgot, or another server made, is counted too.
      const open = isPublic();
      const [found] = rowsOf(countRow, await reach(() => (open ? run(
        `select count(*)::int as n,
          count(*) filter (where created_at > $1::timestamptz)::int as hour,
          count(*) filter (where created_at > $2::timestamptz)::int as day
        from ${t.accounts}`,
        [iso(asked - HOUR_MS), iso(asked - DAY_MS)],
      ) : run(`select count(*)::int as n from ${t.accounts}`, []))));
      // The last places are kept for this machine (`urgent`), so strangers cannot fill the database to the brim.
      if (found === undefined || found.n >= caps.total - (urgent ? 0 : caps.keptForThisMachine)) return "full";
      if (open && !urgent && (found.hour >= caps.perHour || found.day >= caps.perDay)) return "closed";
      // With the setting on, a taken name is found by its key before any hash is spent on it, so a stranger cannot keep the
      // one hash line busy with names that exist. Two sign-ups of a new name at once both pass here: the insert below decides.
      if (open && (await reach(() => run(`select 1 as taken from ${t.accounts} where name_key = $1::text limit 1`, [nameKey(name)]))).length > 0) return "name_taken";
      const salt = randomBytes(SALT_BYTES);
      // No place at the strangers' gate is held while this waits its turn and runs.
      const hash = await gate(() => hashPassword(password, salt), urgent);
      const token = makeToken();
      const at = now();
      // One statement makes the account and its first session, so there is never an account half made.
      // A name that is taken makes neither, and no row comes back.
      const made = await reach(() => run(
        `with made as (
          insert into ${t.accounts} (id, name, name_key, pass_hash, salt, created_at)
          values ($1::uuid, $2::text, $3::text, decode($4::text, 'hex'), decode($5::text, 'hex'), $6::timestamptz)
          on conflict (name_key) do nothing
          returning id
        )
        insert into ${t.sessions} (token_hash, account_id, created_at, expires_at)
        select decode($7::text, 'hex'), made.id, $6::timestamptz, $8::timestamptz from made
        returning account_id::text as id`,
        [randomUUID(), name, nameKey(name), hash.toString("hex"), salt.toString("hex"), iso(at), tokenHash(token), iso(at + SESSION_MS)],
      ));
      return made.length === 0 ? "name_taken" : { token, name };
    },

    signIn: async (name, password, urgent = false, reach = direct) => {
      const found = rowsOf(accountRow, await reach(() => run(
        `select id::text as id, name, encode(pass_hash, 'hex') as pass_hash, encode(salt, 'hex') as salt from ${t.accounts} where name_key = $1::text`,
        [nameKey(name)],
      )))[0];
      const salt = found === undefined ? nobody.salt : Buffer.from(found.salt, "hex");
      const expected = found === undefined ? nobody.hash : Buffer.from(found.pass_hash, "hex");
      // No place at the strangers' gate is held while this waits its turn and runs.
      const right = await gate(() => verifyPassword(password, salt, expected), urgent);
      if (found === undefined || !right) return null;
      const token = makeToken();
      const at = now();
      // The session is made only while the account still holds the hash that was checked: a password changed during the check
      // has ended this account's sessions, and one made after that would outlive it.
      const made = await reach(async () => {
        await makeRoom(found.id, iso(at));
        return run(
          `insert into ${t.sessions} (token_hash, account_id, created_at, expires_at)
          select decode($1::text, 'hex'), a.id, $3::timestamptz, $4::timestamptz from ${t.accounts} a
          where a.id = $2::uuid and a.pass_hash = decode($5::text, 'hex')
          returning 1 as made`,
          [tokenHash(token), found.id, iso(at), iso(at + SESSION_MS), found.pass_hash],
        );
      });
      if (made.length === 0) return null;
      return { token, name: found.name };
    },

    signOut: async (token) => {
      // Forgotten first: whatever the database says, this server no longer takes the token on trust.
      known.forget(tokenHash(token));
      await run(`delete from ${t.sessions} where token_hash = decode($1::text, 'hex')`, [tokenHash(token)]);
    },

    accountOf: async (token) => {
      const since = known.epoch();
      const rows = await run(
        `select account_id::text as id from ${t.sessions} where token_hash = decode($1::text, 'hex') and expires_at > $2::timestamptz`,
        [tokenHash(token), iso(now())],
      );
      const id = rowsOf(idRow, rows)[0]?.id ?? null;
      // Not when a password change ended sessions while the database was being asked: its answer may be from before.
      if (id !== null && known.epoch() === since) known.remember(tokenHash(token), id);
      return id;
    },

    remembered: (token) => known.get(tokenHash(token)),

    readSave: async (accountId) => {
      const row = rowsOf(saveRow, await run(
        `select data::text as data, to_char(updated_at at time zone 'UTC', ${ISO}) as updated_at from ${t.saves} where account_id = $1::uuid`,
        [accountId],
      ))[0];
      if (row === undefined) return { save: null, updatedAt: null };
      // Checked on the way out as on the way in: a row somebody changed by hand is not passed on.
      let data: unknown = null;
      try {
        data = JSON.parse(row.data);
      } catch {
        // Falls through to the check below, which refuses null.
      }
      const save = saveSchema.safeParse(data);
      if (save.success) return { save: save.data, updatedAt: row.updated_at };
      log("warn", "accounts_save_unreadable");
      return { save: null, updatedAt: null };
    },

    writeSave: async (accountId, save) => {
      const updatedAt = iso(now());
      await run(
        `insert into ${t.saves} (account_id, data, updated_at) values ($1::uuid, $2::jsonb, $3::timestamptz)
        on conflict (account_id) do update set data = excluded.data, updated_at = excluded.updated_at`,
        [accountId, JSON.stringify(save), updatedAt],
      );
      return { updatedAt };
    },

    close: async () => {
      const held = db;
      db = null;
      ready = false;
      await held?.close();
    },
  };
  // Anybody may read the hall, so its statements are not held against the accounts: a hall that fails must not turn sign-in off.
  doors.set(made, (text, params) => run(text, params, false));
  return made;
}
