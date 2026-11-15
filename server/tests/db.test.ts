// Opening the database, with no database: every way it can fail ends in null, in time, with one log line that holds
// a short code and no part of the connection string. The pools here are made up, to fail in each way; what a real
// Postgres does is in accountsDb.test.ts.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import {
  APPLICATION, CONNECT_MS, MAX_CONNECTIONS, QUERY_MS, STATEMENT_MS, dbRedactor, dbSecrets, failureCode, isEncrypted, openDb, poolSettings, tlsFor,
  withoutAddresses,
} from "../lib/db";
import type { MakePool } from "../lib/db";
import { TimeoutError } from "../lib/timeout";
import { captureLog, timed } from "./support/drill";

afterEach(() => { vi.restoreAllMocks(); });

/** Made up, and on purpose not shaped like real ones. No test may ever find them in a log line. */
const SECRET_PASSWORD = "made-up-database-password-314159";
const HOST = "db.made-up-host.example";
const SECRET_URL = `postgres://dojo:${SECRET_PASSWORD}@${HOST}:5432/dojo?sslmode=require`;

function noSecret(lines: readonly string[]): void {
  const said = lines.join("\n");
  expect(said).not.toContain(SECRET_PASSWORD);
  expect(said).not.toContain(HOST);
  expect(said).not.toContain("postgres://");
}

/** What the one line that was logged says: the reason, and the code when there is one. */
function said(lines: readonly string[]): { reason?: string; code?: string } {
  expect(lines).toHaveLength(1);
  const line = JSON.parse(lines[0] ?? "{}") as { event?: string; detail?: { reason?: string; code?: string } };
  expect(line.event).toBe("accounts_unavailable");
  return line.detail ?? {};
}
const reason = (lines: readonly string[]): unknown => said(lines).reason;

interface Asked {
  readonly options: Record<string, unknown>[];
  readonly queries: { text: string; values: unknown[] }[];
  readonly listeners: ((error: unknown) => void)[];
  ended: number;
}

/** A made-up pool that answers each query with `answer`, and what it was asked. */
function driver(answer: (text: string) => Promise<{ rows: unknown[] }>): { readonly asked: Asked; readonly makePool: MakePool } {
  const asked: Asked = { options: [], queries: [], listeners: [], ended: 0 };
  const makePool: MakePool = (settings) => {
    asked.options.push({ ...settings });
    return {
      query: (text, values) => {
        asked.queries.push({ text, values });
        return answer(text);
      },
      end: () => {
        asked.ended += 1;
        return Promise.resolve();
      },
      on: (_event, listener) => { asked.listeners.push(listener); },
    };
  };
  return { asked, makePool };
}

const never = (): Promise<never> => new Promise(() => undefined);

test("no connection string means no database, and that is not worth a log line", async () => {
  const log = captureLog();
  const none = driver(never);
  expect(await openDb(null, { makePool: none.makePool })).toBeNull();
  expect(await openDb("", { makePool: none.makePool })).toBeNull();
  expect([none.asked.options, log.lines]).toEqual([[], []]);
});

test("a string that is not a Postgres address is refused before a pool is made", async () => {
  const { asked, makePool } = driver(never);
  for (const url of [`https://dojo:${SECRET_PASSWORD}@${HOST}/dojo`, `${SECRET_PASSWORD} is not an address`, "postgres://", `mysql://dojo:${SECRET_PASSWORD}@${HOST}/dojo`]) {
    const log = captureLog();
    expect(await openDb(url, { makePool }), url).toBeNull();
    expect(said(log.lines)).toEqual({ reason: "bad_url" });
    noSecret(log.lines);
    vi.restoreAllMocks();
  }
  expect(asked.options).toEqual([]);
});

test("an address that does not ask for an encrypted connection is refused, unless the database is on this machine", async () => {
  const { asked, makePool } = driver(never);
  const plain = [
    `postgres://dojo:${SECRET_PASSWORD}@${HOST}:5432/dojo`,
    `postgres://dojo:${SECRET_PASSWORD}@${HOST}:5432/dojo?sslmode=disable`,
    `postgres://dojo:${SECRET_PASSWORD}@${HOST}:5432/dojo?sslmode=prefer`,
    // The line from .env.example with its note left behind the value.
    `postgres://dojo:${SECRET_PASSWORD}@${HOST}:5432/dojo?sslmode=require   (the Tiger Data connection string)`,
  ];
  for (const url of plain) {
    const log = captureLog();
    expect(isEncrypted(url), url).toBe(false);
    expect(await openDb(url, { makePool }), url).toBeNull();
    expect(said(log.lines)).toEqual({ reason: "not_encrypted" });
    noSecret(log.lines);
    vi.restoreAllMocks();
  }
  expect(asked.options).toEqual([]);
  for (const url of [SECRET_URL, `postgresql://u:p@${HOST}/d?sslmode=verify-full`, `postgres://u:p@${HOST}/d?application_name=x&sslmode=require`]) expect(isEncrypted(url), url).toBe(true);
  // A Postgres on this machine, for the database tests: nothing leaves the laptop.
  for (const url of ["postgres://u:p@localhost:5432/d", "postgres://u:p@127.0.0.1/d", "postgres://u:p@[::1]:5432/d"]) expect(isEncrypted(url), url).toBe(true);
  expect(isEncrypted("not an address")).toBe(false);
});

test("the user, the database name and network addresses are cut from a log line too", () => {
  const url = `postgres://tsdbadmin:${SECRET_PASSWORD}@${HOST}:5432/tsdb-made-up?sslmode=require`;
  expect(dbSecrets(url)).toEqual(expect.arrayContaining(["tsdbadmin", "tsdb-made-up"]));
  // A name of three letters or fewer is an everyday word, and cutting it would only cut up the line.
  expect(dbSecrets(`postgres://me:${SECRET_PASSWORD}@${HOST}:5432/db?sslmode=require`)).not.toEqual(expect.arrayContaining(["me"]));
  expect(dbSecrets(`postgres://me:${SECRET_PASSWORD}@${HOST}:5432/db?sslmode=require`)).not.toEqual(expect.arrayContaining(["db"]));
  expect(dbSecrets("postgres://us%65r1:pw@h.example/d%62name")).toEqual(expect.arrayContaining(["us%65r1", "user1", "d%62name", "dbname"]));

  const redact = dbRedactor(url);
  expect(redact(new Error("connect ECONNREFUSED 10.9.8.7:5432"))).toBe("connect ECONNREFUSED [host]");
  expect(redact(new Error("connect ETIMEDOUT 2001:db8:85a3::8a2e:370:7334:5432"))).not.toMatch(/2001|db8|7334/);
  expect(redact(new Error('password authentication failed for user "tsdbadmin"'))).toBe('password authentication failed for user "[key]"');
  expect(redact(new Error('database "tsdb-made-up" does not exist'))).toBe('database "[key]" does not exist');
  expect(redact(new Error(`getaddrinfo ENOTFOUND ${HOST}`))).toBe("getaddrinfo ENOTFOUND [key]");
  // What is left says what went wrong.
  expect(withoutAddresses("canceling statement due to timeout after 3000 ms")).toBe("canceling statement due to timeout after 3000 ms");
  expect(dbRedactor(null)(new Error("no database"))).toBe("no database");
});

test("require encrypts without checking the certificate, and a CA file or verify-full checks it in full", () => {
  const dir = mkdtempSync(join(tmpdir(), "ca-"));
  try {
    const caFile = join(dir, "ca.pem");
    writeFileSync(caFile, "made-up certificate text\n");
    const base = `postgres://dojo:${SECRET_PASSWORD}@${HOST}:5432/dojo`;
    // What psql does for `require`: a free Tiger Data service signs its own certificate, so there is nothing to check it against.
    expect(tlsFor(`${base}?sslmode=require`)).toEqual({ rejectUnauthorized: false });
    expect(tlsFor(`${base}?sslmode=verify-ca`)).toEqual({ rejectUnauthorized: true });
    expect(tlsFor(`${base}?sslmode=verify-full`)).toEqual({ rejectUnauthorized: true });
    // A CA file turns the check on whatever the mode, and nothing switches the host name check off.
    for (const mode of ["require", "verify-ca", "verify-full"]) {
      expect(tlsFor(`${base}?sslmode=${mode}`, caFile), mode).toEqual({ ca: "made-up certificate text\n", rejectUnauthorized: true });
    }
    expect(tlsFor(`${base}?sslmode=require&sslrootcert=${encodeURIComponent(caFile)}`)).toEqual({ ca: "made-up certificate text\n", rejectUnauthorized: true });
    // A database on this machine with no sslmode is the one case that is not encrypted.
    expect(tlsFor("postgres://u:p@localhost:5432/d")).toBe(false);
    expect(tlsFor("postgres://u:p@localhost:5432/d?sslmode=require")).toEqual({ rejectUnauthorized: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a CA file that cannot be read leaves accounts off: they never run unchecked instead", async () => {
  const log = captureLog();
  const { asked, makePool } = driver(never);
  expect(await openDb(SECRET_URL, { makePool, caFile: "/nonexistent/private-folder/ca.pem" })).toBeNull();
  expect(said(log.lines)).toEqual({ reason: "bad_ca_file", code: "ENOENT" });
  expect(log.lines.join("\n")).not.toContain("private-folder");
  expect(asked.options).toEqual([]);
  noSecret(log.lines);
});

test("a failure is logged as a short code or one of a few words, never as what the driver said", () => {
  const coded = (code: string, message: string): Error => Object.assign(new Error(message), { code });
  expect(failureCode(coded("28P01", 'password authentication failed for user "tsdbadmin"'))).toBe("28P01");
  expect(failureCode(coded("ENOTFOUND", `getaddrinfo ENOTFOUND ${HOST}`))).toBe("ENOTFOUND");
  expect(failureCode(coded("SELF_SIGNED_CERT_IN_CHAIN", "self-signed certificate in certificate chain"))).toBe("SELF_SIGNED_CERT_IN_CHAIN");
  expect(failureCode(coded("22P02", `invalid input syntax for type uuid: "${SECRET_PASSWORD}"`))).toBe("22P02");
  // The driver's own failures come with no code.
  expect(failureCode(new Error("timeout exceeded when trying to connect"))).toBe("timeout");
  expect(failureCode(new Error("Query read timeout"))).toBe("timeout");
  expect(failureCode(new TimeoutError(3000))).toBe("timeout");
  expect(failureCode(new Error("Connection terminated unexpectedly"))).toBe("connection_closed");
  // A code that is not a short word in capitals is not passed on, and neither is anything else.
  expect(failureCode(coded(`see ${SECRET_URL}`, "odd"))).toBe("error");
  expect(failureCode(new Error(`could not connect to ${SECRET_URL}`))).toBe("error");
  for (const odd of [null, undefined, "a string", 7, { code: 7 }]) expect(failureCode(odd)).toBe("error");
});

test("a database that never answers is given up on in time, and its pool is closed", async () => {
  const log = captureLog();
  const stalled = driver(never);
  const { result, ms } = await timed(() => openDb(SECRET_URL, { makePool: stalled.makePool, queryMs: 60 }));
  expect(result).toBeNull();
  expect(ms).toBeLessThan(1_000);
  expect(said(log.lines)).toEqual({ reason: "no_answer", code: "timeout" });
  noSecret(log.lines);
  expect(stalled.asked.ended).toBe(1);
  // The real limits are short enough that a page waiting on the server gets its answer.
  expect(CONNECT_MS).toBeLessThanOrEqual(3_000);
  expect(QUERY_MS).toBeLessThanOrEqual(3_000);
  expect(STATEMENT_MS).toBeLessThan(QUERY_MS);
});

test("an error that repeats the connection string is logged as its code, without a word of it", async () => {
  const echo = Object.assign(new Error(`getaddrinfo ENOTFOUND ${HOST}: could not connect to ${SECRET_URL} with password ${SECRET_PASSWORD}`), { code: "ENOTFOUND" });
  const refusing = driver(() => Promise.reject(echo));
  const log = captureLog();
  expect(await openDb(SECRET_URL, { makePool: refusing.makePool })).toBeNull();
  expect(said(log.lines)).toEqual({ reason: "no_answer", code: "ENOTFOUND" });
  expect(log.lines[0]).not.toContain("getaddrinfo");
  noSecret(log.lines);
  vi.restoreAllMocks();

  // A pool that refuses its settings.
  const second = captureLog();
  expect(await openDb(SECRET_URL, { makePool: () => { throw new Error(`invalid connection string ${SECRET_URL}`); } })).toBeNull();
  expect(said(second.lines)).toEqual({ reason: "bad_url", code: "error" });
  noSecret(second.lines);
});

test("a password with characters that are escaped in the address is hidden both ways", () => {
  const secrets = dbSecrets("postgres://dojo:p%40ss%2Fword-12345@db.made-up-host.example:5432/dojo");
  expect(secrets).toContain("p%40ss%2Fword-12345");
  expect(secrets).toContain("p@ss/word-12345");
  expect(secrets).toContain("db.made-up-host.example:5432");
  expect(secrets).toContain("db.made-up-host.example");
  // Longest first, so the whole string is cut out before any part of it.
  expect(secrets[0]).toBe("postgres://dojo:p%40ss%2Fword-12345@db.made-up-host.example:5432/dojo");
  expect([...secrets].sort((a, b) => b.length - a.length)).toEqual(secrets);
  expect(dbSecrets(null)).toEqual([]);
  expect(dbSecrets("")).toEqual([]);
  expect(dbSecrets("not an address at all")).toEqual(["not an address at all"]);
  // A password with a bad escape cannot be decoded. The string as written is still hidden.
  expect(dbSecrets("postgres://dojo:100%zz@host.example/dojo")).toContain("postgres://dojo:100%zz@host.example/dojo");
});

test("the driver gets the parts of the address and the limits, statement and values apart, and a dropped connection does not stop the server", async () => {
  const log = captureLog();
  let stall = false;
  const made = driver((text) => (stall ? never() : Promise.resolve({ rows: text === "select 1" ? [{ one: 1 }] : [{ name: "Odysseus" }] })));
  const db = await openDb(SECRET_URL, { makePool: made.makePool, queryMs: 60 });
  if (db === null) throw new Error("the made-up pool did not open");
  // Never the string itself: the driver would read `sslmode` its own way, and warn about it at every start.
  expect(made.asked.options).toEqual([{
    host: HOST, port: 5432, user: "dojo", password: SECRET_PASSWORD, database: "dojo", ssl: { rejectUnauthorized: false },
    max: MAX_CONNECTIONS, connectionTimeoutMillis: CONNECT_MS, idleTimeoutMillis: 30_000, query_timeout: 60, statement_timeout: 60,
    application_name: APPLICATION, keepAlive: true,
  }]);
  expect(MAX_CONNECTIONS).toBeLessThanOrEqual(5);
  expect(made.asked.queries).toEqual([{ text: "select 1", values: [] }]);

  // The values never become part of the statement text: they go to the driver as they are.
  const params = ["Robert'); drop table accounts;--", 5] as const;
  expect(await db.query("select name from accounts where name_key = $1::text and $2::int > 0", params)).toEqual([{ name: "Odysseus" }]);
  expect(made.asked.queries[1]).toEqual({ text: "select name from accounts where name_key = $1::text and $2::int > 0", values: [...params] });

  // The database drops an idle connection. Somebody is listening, and what is logged is a word, not the driver's text.
  expect(made.asked.listeners).toHaveLength(1);
  made.asked.listeners[0]?.(new Error(`connection to ${HOST} terminated (${SECRET_URL})`));
  expect(log.lines.map((line) => JSON.parse(line) as unknown)).toEqual([{ level: "warn", event: "accounts_connection_lost", detail: "connection_closed" }]);

  // A query that stalls later is given up on as well.
  stall = true;
  const { ms } = await timed(() => expect(db.query("select 1", [])).rejects.toBeInstanceOf(TimeoutError));
  expect(ms).toBeLessThan(1_000);

  await db.close();
  expect(made.asked.ended).toBe(1);
});

test("the parts of an address: escapes undone, the default port, an address in brackets, and the other parameters left behind", () => {
  const limits = { connectMs: 1, queryMs: 5_000 };
  const odd = poolSettings("postgresql://us%65r:p%40ss%2Fword@[::1]/d%62name?sslmode=require&host=elsewhere.example&options=-c%20x%3D1&application_name=other", false, limits);
  expect(odd).toMatchObject({ host: "::1", port: 5432, user: "user", password: "p@ss/word", database: "dbname", ssl: false, application_name: APPLICATION, statement_timeout: STATEMENT_MS });
  expect(Object.keys(odd)).not.toEqual(expect.arrayContaining(["connectionString", "options"]));
  // No database named: the user's own, as Postgres has it.
  expect(poolSettings("postgres://dojo:pw@db.example:6543", false, limits)).toMatchObject({ port: 6543, database: "dojo" });
});

test("on this machine as it is, an address nothing listens on ends in null, quickly, with no secret logged and no warning from the driver", async () => {
  const log = captureLog();
  const warned = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
  // The real driver, with `sslmode=require` in the address: it is never handed the string, so it has nothing to warn about.
  const { result, ms } = await timed(() => openDb(`postgres://dojo:${SECRET_PASSWORD}@127.0.0.1:1/dojo?sslmode=require`));
  expect(result).toBeNull();
  expect(ms).toBeLessThan(CONNECT_MS + QUERY_MS);
  expect(said(log.lines)).toEqual({ reason: "no_answer", code: "ECONNREFUSED" });
  expect(log.lines.join("\n")).not.toContain(SECRET_PASSWORD);
  expect(warned).not.toHaveBeenCalled();
});
