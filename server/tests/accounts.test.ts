// The parts of accounts that need no database: password hashing, session tokens, the table statements,
// and what happens when the database is not there or stops answering. The real thing is in accountsDb.test.ts.
import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import {
  HASH_BYTES, MAX_ACCOUNTS, MAX_SESSIONS, RETRY_MS, SALT_BYTES, SCRYPT, SESSION_MS, STATUS_CACHE_MS, TOKEN_BYTES, Unavailable, bearerToken,
  createAccounts, hashPassword, makeToken, schemaSql, tables, tokenHash, verifyPassword,
} from "../lib/accounts";
import type { Accounts } from "../lib/accounts";
import type { Save } from "../lib/accountRules";
import type { Db } from "../lib/db";
import { dbSecrets } from "../lib/db";
import { createRedactor } from "../lib/redact";
import { captureLog } from "./support/drill";

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
  const accounts = createAccounts(() => Promise.resolve(refusing), { now: () => now, redact: createRedactor(dbSecrets(SECRET_URL)) });
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
});

test("Unavailable says nothing about why", () => {
  expect(new Unavailable().message).toBe("accounts unavailable");
});
