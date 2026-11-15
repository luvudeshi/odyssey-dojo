// The one door to Postgres. Tiger Data is hosted Postgres, reached with the connection string in DATABASE_URL.
// Everything else talks to the small Db interface below, so nothing but this file knows the driver (`pg`).
//
// The connection string is read here and never handed to the driver whole: the driver gets the host, the user, the
// password and the database apart, and how to encrypt is decided below (see tlsFor), not by the driver's own reading
// of `sslmode`.
//
// Nothing here can leave the game waiting: a connection and a query each have a short limit, and every way of failing
// (a bad URL, a CA file that cannot be read, a database that does not answer) ends in null and one log line. A log
// line holds a short code for what went wrong, never the driver's own message and never a part of the string.
import { readFileSync } from "node:fs";
import type { ConnectionOptions } from "node:tls";
import { Pool as PgPool } from "pg";
import type { PoolConfig } from "pg";
import { log } from "../../src/core/log";
import { createRedactor } from "./redact";
import type { Redact } from "./redact";
import { TimeoutError, withTimeout } from "./timeout";

export interface Db {
  /** Runs one statement with its values passed apart from the text, and gives back the rows. The rows are not checked. */
  query<T>(text: string, params: readonly unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

/** How long opening a connection may take, or waiting for a free one. */
export const CONNECT_MS = 2500;
/** How long one query may take, the wait for a connection included. */
export const QUERY_MS = 3000;
/** How long the database itself works on one statement before it stops it. Shorter than QUERY_MS, so a slow statement ends there and its connection is kept. */
export const STATEMENT_MS = 2000;
/** Connections held at most. A free Tiger Data service has no pooler in front of it, and the account routes need few. */
export const MAX_CONNECTIONS = 4;
const IDLE_MS = 30_000;
/** What the database sees this server as, in pg_stat_activity. */
export const APPLICATION = "odyssey-dojo";

/** The parts of the driver's pool used here. */
interface Pool {
  query(text: string, values: unknown[]): Promise<{ readonly rows: unknown[] }>;
  end(): Promise<void>;
  on(event: "error", listener: (error: unknown) => void): unknown;
}
/** Makes a pool from its settings. Only tests replace it, with a made-up one. */
export type MakePool = (settings: PoolConfig) => Pool;

const pgPool: MakePool = (settings) => new PgPool(settings);

function isPostgresUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === "postgres:" || protocol === "postgresql:") && hostname !== "";
  } catch {
    return false;
  }
}

const THIS_HOST: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];
const ENCRYPTED: readonly string[] = ["require", "verify-ca", "verify-full"];

/**
 * True when the address asks for an encrypted connection, or names a database on this machine (a test Postgres).
 * Password hashes and saves travel on this connection, so a string pasted without its `sslmode=require` is refused
 * rather than opened in the clear.
 */
export function isEncrypted(url: string): boolean {
  try {
    const parsed = new URL(url);
    return THIS_HOST.includes(parsed.hostname) || ENCRYPTED.includes(parsed.searchParams.get("sslmode") ?? "");
  } catch {
    return false;
  }
}

/**
 * How the connection is encrypted, read from the address's `sslmode` the way `psql` reads it and not the way the
 * driver does (it takes `require` for `verify-full` and warns about it on every start):
 *
 * - `require` with no CA file: encrypted, and the certificate is not checked. A free Tiger Data service presents a
 *   certificate it signed itself, so there is nothing to check it against. The password and the saves cannot be read
 *   on the way, but a machine that sat between the server and the database could pretend to be the database.
 * - a CA file (DATABASE_CA_FILE, or `sslrootcert` in the address), `verify-ca` or `verify-full`: encrypted, and the
 *   certificate must chain to that file (or to the CAs Node trusts when no file is named) and be for this host.
 * - none of these: only a database on this machine (isEncrypted), in the clear.
 *
 * Throws when the CA file cannot be read: accounts stay off rather than run unchecked.
 */
export function tlsFor(url: string, caFile: string | null = null): ConnectionOptions | false {
  const parsed = new URL(url);
  const mode = parsed.searchParams.get("sslmode") ?? "";
  if (!ENCRYPTED.includes(mode)) return false;
  const named = caFile ?? parsed.searchParams.get("sslrootcert");
  if (named !== null && named !== "") return { ca: readFileSync(named, "utf8"), rejectUnauthorized: true };
  return { rejectUnauthorized: mode !== "require" };
}

/** A part of an address with its escapes undone, or as written when an escape is broken. */
function decoded(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * What the driver is given: the parts of the address one by one, the limits, and how to encrypt. The address's other
 * parameters are not passed on, and with every part named here the driver reads none of them from PG* variables.
 */
export function poolSettings(url: string, tls: ConnectionOptions | false, limits: { readonly connectMs: number; readonly queryMs: number }): PoolConfig {
  const parsed = new URL(url);
  const database = decoded(parsed.pathname.slice(1));
  const user = decoded(parsed.username);
  return {
    host: parsed.hostname.replace(/^\[(.*)\]$/, "$1"),
    port: parsed.port === "" ? 5432 : Number(parsed.port),
    user,
    password: decoded(parsed.password),
    database: database === "" ? user : database,
    ssl: tls,
    max: MAX_CONNECTIONS,
    connectionTimeoutMillis: limits.connectMs,
    idleTimeoutMillis: IDLE_MS,
    query_timeout: limits.queryMs,
    statement_timeout: Math.min(STATEMENT_MS, limits.queryMs),
    application_name: APPLICATION,
    keepAlive: true,
  };
}

/** Addresses in an error text: Node names the address a host resolved to, which is the host by another name. */
const IP_V4 = /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g;
const IP_V6 = /\[?\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f:]{1,4}\b\]?(?::\d+)?/gi;

/** Cuts network addresses out of a line that is already free of the connection string's own parts. */
export function withoutAddresses(text: string): string {
  return text.replace(IP_V4, "[host]").replace(IP_V6, "[host]");
}

/**
 * Everything in a connection string that must not reach a log: the string itself, the password as written and as
 * decoded, the host, and the user and database names when they are long enough not to be an everyday word.
 * Longest first, so a short one cannot cut a long one in two before it is hidden.
 */
export function dbSecrets(url: string | null): string[] {
  if (url === null || url === "") return [];
  const found = [url];
  try {
    const parsed = new URL(url);
    found.push(parsed.password, parsed.host, parsed.hostname, decoded(parsed.password));
    for (const name of [parsed.username, parsed.pathname.slice(1)]) found.push(...[name, decoded(name)].filter((part) => part.length >= 4));
  } catch {
    // Not a URL: the whole string is still hidden.
  }
  return [...new Set(found.filter((part) => part !== ""))].sort((a, b) => b.length - a.length);
}

/** Turns a database error into a log line with nothing of the connection string in it, and no network address. */
export function dbRedactor(url: string | null): Redact {
  const redact = createRedactor(dbSecrets(url));
  return (error) => withoutAddresses(redact(error));
}

/** What the driver says when it gives up, which comes with no code. Matched on the text, and only these words are ever logged. */
const DRIVER_SAID: readonly (readonly [RegExp, string])[] = [
  [/timeout/i, "timeout"],
  [/terminated|closed|ended|not queryable/i, "connection_closed"],
];
const CODE = /^[A-Z0-9_]{3,40}$/;

/**
 * What may be said of a database failure: the short code Postgres or Node gives it (`28P01` a wrong password, `3D000`
 * no such database, `53300` too many connections, `57014` a statement stopped at its time limit, `ENOTFOUND`,
 * `ECONNREFUSED`, `SELF_SIGNED_CERT_IN_CHAIN`), or one of a few words. Never the message: Postgres can repeat a
 * value it was sent, and Node names the address it tried.
 */
export function failureCode(error: unknown): string {
  if (error instanceof TimeoutError) return "timeout";
  if (typeof error !== "object" || error === null) return "error";
  if ("code" in error && typeof error.code === "string" && CODE.test(error.code)) return error.code;
  const message = error instanceof Error ? error.message : "";
  return DRIVER_SAID.find(([said]) => said.test(message))?.[1] ?? "error";
}

export interface OpenOptions {
  /** A file of CA certificates the database's certificate must chain to (DATABASE_CA_FILE). Left out: see tlsFor. */
  readonly caFile?: string | null;
  /** Replaces the driver's pool. Only tests set it. */
  readonly makePool?: MakePool;
  readonly connectMs?: number;
  readonly queryMs?: number;
}

/**
 * Opens the database, or returns null when there is none to use: no URL (said by nobody, it is the normal state),
 * a URL that is not a Postgres one or would not be encrypted, a CA file that cannot be read, or a database that does
 * not answer one small query in time.
 */
export async function openDb(url: string | null, options: OpenOptions = {}): Promise<Db | null> {
  if (url === null || url === "") return null;
  const off = (reason: string, error?: unknown): null => {
    log("warn", "accounts_unavailable", error === undefined ? { reason } : { reason, code: failureCode(error) });
    return null;
  };
  if (!isPostgresUrl(url)) return off("bad_url");
  if (!isEncrypted(url)) return off("not_encrypted");

  let tls: ConnectionOptions | false = false;
  try {
    tls = tlsFor(url, options.caFile ?? null);
  } catch (error) {
    return off("bad_ca_file", error);
  }

  const queryMs = options.queryMs ?? QUERY_MS;
  let pool: Pool;
  try {
    pool = (options.makePool ?? pgPool)(poolSettings(url, tls, { connectMs: options.connectMs ?? CONNECT_MS, queryMs }));
    // An idle connection that the database drops raises this. With nobody listening it would stop the server.
    pool.on("error", (error) => { log("warn", "accounts_connection_lost", failureCode(error)); });
  } catch (error) {
    return off("bad_url", error);
  }

  const db: Db = {
    // The limit is held here as well as in the driver, so a query ends in time whatever the driver does.
    query: async <T>(text: string, params: readonly unknown[]): Promise<T[]> =>
      (await withTimeout(queryMs, () => pool.query(text, [...params]))).rows as T[],
    close: async () => {
      await pool.end().catch(() => undefined);
    },
  };
  try {
    await db.query("select 1", []);
  } catch (error) {
    void db.close();
    return off("no_answer", error);
  }
  return db;
}
