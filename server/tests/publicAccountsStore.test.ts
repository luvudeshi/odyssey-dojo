// The parts of accounts that need no database: password hashing, session tokens, the table statements,
// and what happens when the database is not there or stops answering. The real thing is in accountsDb.test.ts.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  ACCOUNTS_KEPT_FOR_THIS_MACHINE, FAILURES_TO_GIVE_UP, HASH_BYTES, MAX_ACCOUNTS, MAX_SESSIONS, RETRY_MS, SALT_BYTES, SCRYPT, SESSION_MS, STATUS_CACHE_MS, TOKEN_BYTES,
  Unavailable, bearerToken,
  createAccounts, hashPassword, makeToken, schemaSql, tables, tokenHash, verifyPassword,
} from "../lib/accounts";
import type { Accounts, Reach } from "../lib/accounts";
import { KNOWN_SESSION_MS, SIGNUPS_PER_DAY, SIGNUPS_PER_HOUR } from "../lib/accountLimits";
import type { Gate } from "../lib/accountLimits";
import type { Save } from "../lib/accountRules";
import type { Db } from "../lib/db";
import { captureLog } from "./support/drill";

// Every test here runs with PUBLIC_ACCOUNTS=1; accounts.test.ts has the same store without it.
beforeEach(() => { vi.stubEnv("PUBLIC_ACCOUNTS", "1"); });
afterEach(() => { vi.unstubAllEnvs(); });

afterEach(() => { vi.restoreAllMocks(); });

const SALT = Buffer.alloc(SALT_BYTES, 7);
const OTHER_SALT = Buffer.alloc(SALT_BYTES, 8);
const PASSWORD = "nine oars and a sail";
/** Made up, and on purpose not shaped like a real one. No test may ever find it in an answer or a log line. */
const SECRET_PASSWORD = "made-up-database-password-314159";
const SECRET_URL = `postgres://dojo:${SECRET_PASSWORD}@db.made-up-host.example:5432/dojo?sslmode=require`;
const SAVE: Save = { version: 1, profile: { name: "x", cleared: [], moves: {}, bestScore: 0, fights: 0, wins: 0 }, settings: {}, character: null };

test("a password is hashed with scrypt at the stated cost, and the same password and salt make the same key", async () => {
  const key = await hashPassword(PASSWORD, SALT);
  expect(key).toHaveLength(HASH_BYTES);
  expect(key.equals(await hashPassword(PASSWORD, SALT))).toBe(true);
  // The key is neither the password nor the salt, and another salt or one changed letter makes another key.
  expect(key.includes(Buffer.from(PASSWORD))).toBe(false);
  expect(key.equals(await hashPassword(PASSWORD, OTHER_SALT))).toBe(false);
  expect(key.equals(await hashPassword("nine oars and a sail.", SALT))).toBe(false);
  // The first scrypt setting on OWASP's sheet, and the 128 MB it needs fits under the memory limit given to Node.
  expect([SCRYPT.N, SCRYPT.r, SCRYPT.p]).toEqual([2 ** 17, 8, 1]);
  expect(128 * SCRYPT.N * SCRYPT.r).toBeLessThanOrEqual(SCRYPT.maxmem);
});

test("only the right password is verified, and a key of another length is simply wrong", async () => {
  const key = await hashPassword(PASSWORD, SALT);
  expect(await verifyPassword(PASSWORD, SALT, key)).toBe(true);
  expect(await verifyPassword("Nine oars and a sail", SALT, key)).toBe(false);
  expect(await verifyPassword(PASSWORD, OTHER_SALT, key)).toBe(false);
  expect(await verifyPassword("", SALT, key)).toBe(false);
  expect(await verifyPassword(PASSWORD, SALT, key.subarray(0, 32))).toBe(false);
  expect(await verifyPassword(PASSWORD, SALT, Buffer.alloc(0))).toBe(false);
});

test("the same password typed on two keyboards is the same password", async () => {
  // An accented letter as one character, and as a letter with a combining accent.
  const key = await hashPassword("Pe\u0301ne\u0301lope waits", SALT);
  expect(await verifyPassword("P\u00e9n\u00e9lope waits", SALT, key)).toBe(true);
  expect(await verifyPassword("Penelope waits", SALT, key)).toBe(false);
});

test("a token is 32 random bytes in 43 header-safe characters, and the database gets only its SHA-256", () => {
  const tokens = Array.from({ length: 200 }, makeToken);
  for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(new Set(tokens).size).toBe(tokens.length);
  expect(Buffer.from(tokens[0] ?? "", "base64url")).toHaveLength(TOKEN_BYTES);

  const token = tokens[0] ?? "";
  expect(tokenHash(token)).toBe(createHash("sha256").update(token).digest("hex"));
  expect(tokenHash(token)).toMatch(/^[0-9a-f]{64}$/);
  expect(tokenHash(token)).not.toContain(token);
  expect(tokenHash(token)).not.toBe(tokenHash(tokens[1] ?? ""));
  expect(SESSION_MS).toBe(30 * 24 * 60 * 60 * 1000);
});

test("the token is read only from a well-formed Bearer header", () => {
  const token = makeToken();
  expect(bearerToken(`Bearer ${token}`)).toBe(token);
  expect(bearerToken(`bearer ${token}`)).toBe(token);
  expect(bearerToken(`  Bearer ${token}  `)).toBe(token);
  const bad: readonly unknown[] = [
    undefined, null, "", token, `Basic ${token}`, `Bearer${token}`, "Bearer ", `Bearer ${token} extra`, `Bearer ${token.slice(1)}`, `Bearer ${token}a`,
    `Bearer ${token.slice(0, 42)}'`, `Bearer ${"=".repeat(43)}`, [`Bearer ${token}`], 5,
  ];
  for (const header of bad) expect(bearerToken(header), JSON.stringify(header)).toBeNull();
});

test("the tables are made with create-if-not-exists, and a test prefix is checked before it becomes part of a statement", () => {
  expect(tables()).toEqual({ accounts: "accounts", sessions: "sessions", saves: "saves" });
  expect(tables("t1f_")).toEqual({ accounts: "t1f_accounts", sessions: "t1f_sessions", saves: "t1f_saves" });
  for (const prefix of ["1abc", "Abc", "a-b", "a b", "a;drop table accounts;--", "a\"", "x".repeat(32), "\u00e9"]) {
    expect(() => tables(prefix), prefix).toThrow("bad table prefix");
    expect(() => schemaSql(prefix), prefix).toThrow("bad table prefix");
  }
  const statements = schemaSql();
  expect(statements.filter((statement) => /^create table if not exists (accounts|sessions|saves) \(/.test(statement))).toHaveLength(3);
  for (const statement of statements) expect(statement).toMatch(/^create (table|index) if not exists /);
  const all = statements.join("\n");
  expect(all).toMatch(/name_key text not null unique/);
  expect(all).toMatch(/pass_hash bytea not null/);
  expect(all).toMatch(/token_hash bytea primary key/);
  expect(all).toMatch(/data jsonb not null/);
  // Deleting an account takes its sessions and its save with it.
  expect(all.match(/references accounts \(id\) on delete cascade/g)).toHaveLength(2);
  expect(schemaSql("t1f_").join("\n")).not.toMatch(/ (accounts|sessions|saves)\b/);
  expect([MAX_SESSIONS, MAX_ACCOUNTS]).toEqual([5, 2000]);
});

/** Every call an account route makes. */
function everyCall(accounts: Accounts): readonly (() => Promise<unknown>)[] {
  return [
    () => accounts.signUp("Odysseus", PASSWORD), () => accounts.signIn("Odysseus", PASSWORD), () => accounts.signOut(makeToken()),
    () => accounts.accountOf(makeToken()), () => accounts.readSave("0d15ea5e-0000-4000-8000-000000000000"),
    () => accounts.writeSave("0d15ea5e-0000-4000-8000-000000000000", SAVE),
  ];
}

test("with no database accounts are off: not available, every call refused, nothing logged, and no hash is spent", async () => {
  const log = captureLog();
  let now = 0;
  let opened = 0;
  const accounts = createAccounts(() => { opened += 1; return Promise.resolve(null); }, { now: () => now });
  expect(await accounts.available()).toBe(false);
  const started = performance.now();
  for (const call of everyCall(accounts)) await expect(call()).rejects.toBeInstanceOf(Unavailable);
  // A password hash takes about 0.2 s. None was made: being off costs nothing.
  expect(performance.now() - started).toBeLessThan(150);
  expect(opened).toBe(1);
  // It is looked for again, but not more often than every RETRY_MS.
  now += RETRY_MS - 1;
  expect(await accounts.available()).toBe(false);
  expect(opened).toBe(1);
  now += STATUS_CACHE_MS;
  expect(await accounts.available()).toBe(false);
  expect(opened).toBe(2);
  expect(log.lines).toEqual([]);
  await accounts.close();
});

test("a database that refuses every statement leaves accounts off, and its error is logged without the connection string", async () => {
  const log = captureLog();
  let now = 0;
  let asked = 0;
  const refusing: Db = {
    query: () => { asked += 1; return Promise.reject(new Error(`password authentication failed for ${SECRET_URL} (${SECRET_PASSWORD})`)); },
    close: () => Promise.resolve(),
  };
  const accounts = createAccounts(() => Promise.resolve(refusing), { now: () => now });
  expect(await accounts.available()).toBe(false);
  for (const call of everyCall(accounts)) await expect(call()).rejects.toBeInstanceOf(Unavailable);
  // One attempt to make the tables, and then nothing more is sent until the retry time has passed.
  expect(asked).toBe(1);
  now += STATUS_CACHE_MS;
  expect(await accounts.available()).toBe(false);
  expect(asked).toBe(1);
  now += RETRY_MS;
  expect(await accounts.available()).toBe(false);
  expect(asked).toBe(2);

  expect(log.lines.length).toBeGreaterThan(0);
  const said = log.lines.join("\n");
  expect(said).toContain("accounts_tables_failed");
  expect(said).not.toContain(SECRET_PASSWORD);
  expect(said).not.toContain("made-up-host");
  expect(said).not.toContain("postgres://");
  // Not the driver's own words either, only a short code.
  expect(said).not.toContain("authentication failed");
});

/**
 * A Db that keeps nothing: after the tables it answers every statement with the rows `answer` gives, or fails while
 * `failing` is set. It only shows how accounts treat an answer or a failure; what a real Postgres does is in accountsDb.test.ts.
 */
function scripted(answer: (text: string) => unknown[] = () => []): { readonly db: Db; failing: boolean; asked: number } {
  const state = {
    failing: false,
    asked: 0,
    db: {
      query: (text: string): Promise<never[]> => {
        state.asked += 1;
        return state.failing ? Promise.reject(new Error("canceling statement due to timeout")) : Promise.resolve(answer(text) as never[]);
      },
      close: () => Promise.resolve(),
    } satisfies Db,
  };
  return state;
}

test("one slow query is not an outage: accounts stay on until three fail in a row, and come back with the first that works", async () => {
  captureLog();
  let now = 0;
  const stand = scripted();
  const accounts = createAccounts(() => Promise.resolve(stand.db), { now: () => now });
  expect(await accounts.available()).toBe(true);
  const token = makeToken();

  // One failure: that call is refused, and the very next one is tried again and works.
  stand.failing = true;
  await expect(accounts.accountOf(token)).rejects.toBeInstanceOf(Unavailable);
  stand.failing = false;
  expect(await accounts.accountOf(token)).toBeNull();
  expect(await accounts.available()).toBe(true);

  // Two failures, one success, two failures: never three in a row, so never off.
  for (const failing of [true, true, false, true, true, false]) {
    stand.failing = failing;
    await accounts.accountOf(token).catch(() => null);
  }
  now += STATUS_CACHE_MS;
  expect(await accounts.available()).toBe(true);

  // Three in a row: off, and while it is believed off nothing more is sent.
  stand.failing = true;
  for (let index = 0; index < FAILURES_TO_GIVE_UP; index += 1) await expect(accounts.accountOf(token)).rejects.toBeInstanceOf(Unavailable);
  const asked = stand.asked;
  expect(await accounts.available()).toBe(false);
  for (const call of everyCall(accounts)) await expect(call()).rejects.toBeInstanceOf(Unavailable);
  expect(stand.asked).toBe(asked);
  // After the pause it is asked once more; still failing, so off again at once.
  now += STATUS_CACHE_MS;
  expect(await accounts.available()).toBe(false);
  expect(stand.asked).toBe(asked + 1);
  // And the first answer brings it back.
  stand.failing = false;
  now += STATUS_CACHE_MS;
  expect(await accounts.available()).toBe(true);
  expect(await accounts.accountOf(token)).toBeNull();
  await accounts.close();
});

test("a token the database knew is remembered without asking again, until it is signed out or five minutes have passed", async () => {
  captureLog();
  let now = 0;
  const token = makeToken();
  const other = makeToken();
  const stand = scripted((text) => (text.startsWith("select account_id") ? [{ id: "0d15ea5e-0000-4000-8000-000000000000" }] : []));
  const accounts = createAccounts(() => Promise.resolve(stand.db), { now: () => now });
  expect(accounts.remembered(token)).toBeNull();
  expect(await accounts.accountOf(token)).toBe("0d15ea5e-0000-4000-8000-000000000000");
  expect(accounts.remembered(token)).toBe("0d15ea5e-0000-4000-8000-000000000000");
  expect(accounts.remembered(other)).toBeNull();
  now += KNOWN_SESSION_MS;
  expect(accounts.remembered(token)).toBeNull();
  // Signing out forgets it at once, also when the database cannot be reached to end the session there.
  await accounts.accountOf(token);
  stand.failing = true;
  await expect(accounts.signOut(token)).rejects.toBeInstanceOf(Unavailable);
  expect(accounts.remembered(token)).toBeNull();
});

/** What the count before a sign-up answers: accounts in all, made in the last hour, made in the last day. */
const counted = (n: number, hour = 0, day = 0) => (text: string): unknown[] => (text.includes("count(*)") ? [{ n, hour, day }] : []);

test("the last hundred places are kept for this machine: a stranger is told the database is full before any hash is made", async () => {
  captureLog();
  const stand = scripted(counted(MAX_ACCOUNTS - ACCOUNTS_KEPT_FOR_THIS_MACHINE));
  const accounts = createAccounts(() => Promise.resolve(stand.db));
  const started = performance.now();
  expect(accounts.remembered(makeToken())).toBeNull();
  expect(await accounts.signUp("Odysseus", PASSWORD)).toBe("full");
  expect(performance.now() - started).toBeLessThan(150);
  // This machine goes on to the hash and the insert. This Db gives no row back for it, which reads as a taken name.
  expect(await accounts.signUp("Odysseus", PASSWORD, true)).toBe("name_taken");
  const brim = scripted(counted(MAX_ACCOUNTS));
  expect(await createAccounts(() => Promise.resolve(brim.db)).signUp("Odysseus", PASSWORD, true)).toBe("full");
});

test("the database says how many accounts were made this hour and today: at 200 and at 600 a stranger makes no more, before any hash, and this machine still does", async () => {
  captureLog();
  expect([SIGNUPS_PER_HOUR, SIGNUPS_PER_DAY]).toEqual([200, 600]);
  for (const [hour, day, answer] of [[SIGNUPS_PER_HOUR, SIGNUPS_PER_HOUR, "closed"], [0, SIGNUPS_PER_DAY, "closed"], [SIGNUPS_PER_HOUR - 1, SIGNUPS_PER_DAY - 1, "name_taken"]] as const) {
    const texts: string[] = [];
    const stand = scripted((text) => {
      texts.push(text);
      return counted(700, hour, day)(text);
    });
    const accounts = createAccounts(() => Promise.resolve(stand.db), { now: () => Date.parse("2026-11-15T12:00:00.000Z") });
    const started = performance.now();
    // "name_taken" is what this Db's empty answer to the insert reads as: the sign-up went on to the hash and the insert.
    expect(await accounts.signUp("Odysseus", PASSWORD), `${String(hour)} ${String(day)}`).toBe(answer);
    if (answer === "closed") {
      expect(performance.now() - started).toBeLessThan(150);
      expect(texts.some((text) => text.includes("insert into accounts"))).toBe(false);
      // This machine is not held by the hour or the day: the demo laptop makes its accounts whatever strangers did.
      expect(await accounts.signUp("Odysseus", PASSWORD, true)).toBe("name_taken");
    }
  }
  // The hour and the day are counted back from this server's clock, as values and never in the statement text.
  const asked: { text: string; params: readonly unknown[] }[] = [];
  const db: Db = {
    query: (text: string, params: readonly unknown[]): Promise<never[]> => {
      asked.push({ text, params });
      return Promise.resolve(counted(0, SIGNUPS_PER_HOUR)(text) as never[]);
    },
    close: () => Promise.resolve(),
  };
  await createAccounts(() => Promise.resolve(db), { now: () => Date.parse("2026-11-15T12:00:00.000Z") }).signUp("Odysseus", PASSWORD);
  expect(asked.find((statement) => statement.text.includes("count(*)"))?.params).toEqual(["2026-11-15T11:00:00.000Z", "2026-11-14T12:00:00.000Z"]);
  // A test may set its own caps, to reach one with a handful of accounts.
  const few = createAccounts(() => Promise.resolve(scripted(counted(3, 2, 2)).db), { caps: { perHour: 2 } });
  expect(await few.signUp("Odysseus", PASSWORD)).toBe("closed");
});

test("a password hash holds no place at the strangers' gate: only the statements before and after it do", async () => {
  captureLog();
  const key = await hashPassword(PASSWORD, SALT);
  const row = { id: "0d15ea5e-0000-4000-8000-000000000000", name: "Odysseus", pass_hash: key.toString("hex"), salt: SALT.toString("hex") };
  const stand = scripted((text) => {
    if (text.includes("count(*)")) return [{ n: 0, hour: 0, day: 0 }];
    if (text.startsWith("select id::text")) return [row];
    return text.startsWith("with made") ? [{ id: row.id }] : [];
  });
  // The strangers' gate as the routes hand it over, and the hash gate, both watched. The hashes wait until the test lets them go.
  let inside = 0;
  let places = 0;
  const reach: Reach = async (work) => {
    inside += 1;
    places += 1;
    try {
      return await work();
    } finally {
      inside -= 1;
    }
  };
  let release: () => void = () => undefined;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let hashing = 0;
  const insideWhileHashing: number[] = [];
  const gate: Gate = async (work) => {
    hashing += 1;
    insideWhileHashing.push(inside);
    await hold;
    insideWhileHashing.push(inside);
    return work();
  };
  const accounts = createAccounts(() => Promise.resolve(stand.db), { gate });
  expect(await accounts.available()).toBe(true);

  const signIn = accounts.signIn("Odysseus", PASSWORD, false, reach);
  const wrong = accounts.signIn("Odysseus", "not the password", false, reach);
  const signUp = accounts.signUp("Penelope", PASSWORD, false, reach);
  for (let waited = 0; waited < 500 && hashing < 3; waited += 1) await new Promise((resolve) => { setImmediate(resolve); });
  // All three wait for their hash, and none of them holds a place: other strangers' statements run meanwhile.
  expect(hashing).toBe(3);
  expect(inside).toBe(0);
  // The two look-ups, and the sign-up's count and its "is the name taken".
  expect(places).toBe(4);
  release();
  expect(await signIn).toMatchObject({ name: "Odysseus" });
  expect(await wrong).toBeNull();
  expect(await signUp).toMatchObject({ name: "Penelope" });
  expect(insideWhileHashing).toEqual([0, 0, 0, 0, 0, 0]);
  // A place each for the look-up and the count, one for the sign-up's "is the name taken", then one for the new session and one for the insert. A wrong password takes no second one.
  expect(places).toBe(6);
  expect(inside).toBe(0);
  // Without a gate handed over (this machine, the tests of the database) nothing changes: the statements run as they are.
  expect(await accounts.signIn("Odysseus", PASSWORD)).toMatchObject({ name: "Odysseus" });
});

test("a sign-up with a taken name is answered before any hash: one select by the name's key, no insert; without the setting the hash comes first, as on main", async () => {
  captureLog();
  const run = async (isPublic: boolean, taken: boolean): Promise<{ answer: unknown; hashes: number; texts: string[] }> => {
    const texts: string[] = [];
    const stand = scripted((text) => {
      // The statements of the sign-up itself; the tables are made first and are not part of it.
      if (!text.startsWith("create ")) texts.push(text.trimStart().slice(0, 12));
      if (text.includes("count(*)")) return [{ n: 0, hour: 0, day: 0 }];
      if (text.startsWith("select 1 as taken")) return taken ? [{ taken: 1 }] : [];
      // The insert makes no row for a taken name (on conflict do nothing).
      return text.startsWith("with made") && !taken ? [{ id: "0d15ea5e-0000-4000-8000-000000000000" }] : [];
    });
    let hashes = 0;
    const gate: Gate = () => {
      hashes += 1;
      return Promise.resolve(Buffer.alloc(HASH_BYTES)) as never;
    };
    const accounts = createAccounts(() => Promise.resolve(stand.db), { gate, isPublic: () => isPublic });
    return { answer: await accounts.signUp("Odysseus", PASSWORD), hashes, texts };
  };
  // The setting on: the name is asked for after the count, and a taken one stops there. The hash is called 0 times.
  expect(await run(true, true)).toEqual({ answer: "name_taken", hashes: 0, texts: ["select count", "select 1 as "] });
  // A new name goes on to one hash and the insert. A name taken between the two is still caught by the insert (no row back).
  expect(await run(true, false)).toMatchObject({ answer: { name: "Odysseus" }, hashes: 1, texts: ["select count", "select 1 as ", "with made as"] });
  // The setting off: main's order. The count, the hash, the insert, and the name is never asked for on its own.
  expect(await run(false, true)).toEqual({ answer: "name_taken", hashes: 1, texts: ["select count", "with made as"] });
  expect(await run(false, false)).toMatchObject({ answer: { name: "Odysseus" }, hashes: 1, texts: ["select count", "with made as"] });
});

test("Unavailable says nothing about why", () => {
  expect(new Unavailable().message).toBe("accounts unavailable");
});
