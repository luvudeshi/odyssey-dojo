// Opening the database, with no database: every way it can fail ends in null, in time, with one log line that holds
// no part of the connection string. The drivers here are made up, to fail in each way; what a real Postgres does is
// in accountsDb.test.ts.
import { afterEach, expect, test, vi } from "vitest";
import { CONNECT_MS, DRIVER, MAX_CONNECTIONS, QUERY_MS, dbRedactor, dbSecrets, isEncrypted, openDb, withoutAddresses } from "../lib/db";
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

/** The reason in the one line that was logged. */
function reason(lines: readonly string[]): unknown {
  expect(lines).toHaveLength(1);
  const line = JSON.parse(lines[0] ?? "{}") as { event?: string; detail?: { reason?: string } };
  expect(line.event).toBe("accounts_unavailable");
  return line.detail?.reason;
}

interface Asked {
  readonly options: Record<string, unknown>[];
  readonly queries: { text: string; values: unknown[] }[];
  readonly listeners: ((error: unknown) => void)[];
  ended: number;
}

/** A made-up driver whose pool answers each query with `answer`. */
function driver(answer: (text: string) => Promise<{ rows: unknown[] }>): { readonly asked: Asked; readonly Pool: unknown } {
  const asked: Asked = { options: [], queries: [], listeners: [], ended: 0 };
  class Pool {
    constructor(options: Record<string, unknown>) { asked.options.push(options); }
    query(text: string, values: unknown[]): Promise<{ rows: unknown[] }> {
      asked.queries.push({ text, values });
      return answer(text);
    }
    end(): Promise<void> {
      asked.ended += 1;
      return Promise.resolve();
    }
    on(_event: string, listener: (error: unknown) => void): void { asked.listeners.push(listener); }
  }
  return { asked, Pool };
}

const never = (): Promise<never> => new Promise(() => undefined);

test("no connection string means no database, and that is not worth a log line", async () => {
  const log = captureLog();
  let loaded = 0;
  const load = (): Promise<unknown> => { loaded += 1; return Promise.resolve({}); };
  expect(await openDb(null, { load })).toBeNull();
  expect(await openDb("", { load })).toBeNull();
  expect([loaded, log.lines]).toEqual([0, []]);
});

test("a string that is not a Postgres address is refused before the driver is even loaded", async () => {
  let loaded = 0;
  const load = (): Promise<unknown> => { loaded += 1; return Promise.resolve(driver(never)); };
  for (const url of [`https://dojo:${SECRET_PASSWORD}@${HOST}/dojo`, `${SECRET_PASSWORD} is not an address`, "postgres://", `mysql://dojo:${SECRET_PASSWORD}@${HOST}/dojo`]) {
    const log = captureLog();
    expect(await openDb(url, { load }), url).toBeNull();
    expect(reason(log.lines)).toBe("bad_url");
    noSecret(log.lines);
    vi.restoreAllMocks();
  }
  expect(loaded).toBe(0);
});

test("an address that does not ask for an encrypted connection is refused, unless the database is on this machine", async () => {
  let loaded = 0;
  const load = (): Promise<unknown> => { loaded += 1; return Promise.resolve(driver(never)); };
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
    expect(await openDb(url, { load }), url).toBeNull();
    expect(reason(log.lines)).toBe("not_encrypted");
    noSecret(log.lines);
    vi.restoreAllMocks();
  }
  expect(loaded).toBe(0);
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

test("a machine without the driver has no accounts, and says so once without the path the error names", async () => {
  const missing = (): Promise<unknown> => Promise.reject(new Error(`Cannot find package '${DRIVER}' imported from /Users/somebody/private/path/db.ts`));
  for (const load of [missing, () => Promise.resolve({}), () => Promise.resolve({ default: {} }), () => Promise.resolve(null), () => Promise.resolve({ Pool: "not a class" })]) {
    const log = captureLog();
    expect(await openDb(SECRET_URL, { load })).toBeNull();
    expect(reason(log.lines)).toBe("no_driver");
    expect(log.lines.join("\n")).not.toContain("/Users/");
    noSecret(log.lines);
    vi.restoreAllMocks();
  }
});

test("a database that never answers is given up on in time, and its pool is closed", async () => {
  const log = captureLog();
  const stalled = driver(never);
  const { result, ms } = await timed(() => openDb(SECRET_URL, { load: () => Promise.resolve(stalled), queryMs: 60 }));
  expect(result).toBeNull();
  expect(ms).toBeLessThan(1_000);
  expect(reason(log.lines)).toBe("no_answer");
  noSecret(log.lines);
  expect(stalled.asked.ended).toBe(1);
  // The real limits are short enough that a page waiting on the server gets its answer.
  expect(CONNECT_MS).toBeLessThanOrEqual(3_000);
  expect(QUERY_MS).toBeLessThanOrEqual(3_000);
});

test("an error that repeats the connection string is logged without it", async () => {
  const echo = new Error(`getaddrinfo ENOTFOUND ${HOST}: could not connect to ${SECRET_URL} with password ${SECRET_PASSWORD}`);
  const refusing = driver(() => Promise.reject(echo));
  const log = captureLog();
  expect(await openDb(SECRET_URL, { load: () => Promise.resolve(refusing) })).toBeNull();
  expect(reason(log.lines)).toBe("no_answer");
  expect(log.lines[0]).toContain("getaddrinfo ENOTFOUND");
  noSecret(log.lines);
  vi.restoreAllMocks();

  // A driver that refuses the string itself.
  class Throws {
    constructor() { throw new Error(`invalid connection string ${SECRET_URL}`); }
  }
  const second = captureLog();
  expect(await openDb(SECRET_URL, { load: () => Promise.resolve({ Pool: Throws }) })).toBeNull();
  expect(reason(second.lines)).toBe("bad_url");
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

test("the driver gets the address and the limits, statement and values apart, and a dropped connection does not stop the server", async () => {
  for (const shape of ["module", "default"] as const) {
    const log = captureLog();
    let stall = false;
    const made = driver((text) => (stall ? never() : Promise.resolve({ rows: text === "select 1" ? [{ one: 1 }] : [{ name: "Odysseus" }] })));
    const db = await openDb(SECRET_URL, { load: () => Promise.resolve(shape === "module" ? made : { default: made }), queryMs: 60 });
    if (db === null) throw new Error("the made-up driver did not open");
    expect(made.asked.options).toEqual([{
      connectionString: SECRET_URL, max: MAX_CONNECTIONS, connectionTimeoutMillis: CONNECT_MS, idleTimeoutMillis: 30_000, query_timeout: 60,
      application_name: "odyssey-dojo",
    }]);
    expect(made.asked.queries).toEqual([{ text: "select 1", values: [] }]);

    // The values never become part of the statement text: they go to the driver as they are.
    const params = ["Robert'); drop table accounts;--", 5] as const;
    expect(await db.query("select name from accounts where name_key = $1::text and $2::int > 0", params)).toEqual([{ name: "Odysseus" }]);
    expect(made.asked.queries[1]).toEqual({ text: "select name from accounts where name_key = $1::text and $2::int > 0", values: [...params] });

    // The database drops an idle connection. Somebody is listening, and what is logged has no secret in it.
    expect(made.asked.listeners).toHaveLength(1);
    made.asked.listeners[0]?.(new Error(`connection to ${HOST} terminated (${SECRET_URL})`));
    expect(log.lines.join("\n")).toContain("accounts_connection_lost");
    noSecret(log.lines);

    // A query that stalls later is given up on as well.
    stall = true;
    const { ms } = await timed(() => expect(db.query("select 1", [])).rejects.toBeInstanceOf(TimeoutError));
    expect(ms).toBeLessThan(1_000);

    await db.close();
    expect(made.asked.ended).toBe(1);
    vi.restoreAllMocks();
  }
});

test("on this machine as it is, an address nothing listens on ends in null, quickly, with no secret logged", async () => {
  // Without the driver installed this is "no_driver"; with it, "no_answer". Either way accounts are off and nothing leaks.
  const log = captureLog();
  const { result, ms } = await timed(() => openDb(`postgres://dojo:${SECRET_PASSWORD}@127.0.0.1:1/dojo`));
  expect(result).toBeNull();
  expect(ms).toBeLessThan(CONNECT_MS + QUERY_MS);
  expect(["no_driver", "no_answer"]).toContain(reason(log.lines));
  expect(log.lines.join("\n")).not.toContain(SECRET_PASSWORD);
});
