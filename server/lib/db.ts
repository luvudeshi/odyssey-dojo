// The one door to Postgres. Tiger Data is hosted Postgres, reached with the connection string in DATABASE_URL.
// Everything else talks to the small Db interface below, so nothing but this file knows the driver.
//
// The driver (`pg`) is NOT in package.json yet: the owner has not said yes to the package. Until he does it is loaded
// at run time by name, so the build and the type check do not need it, and a machine without it has no accounts.
// Once he has said yes, a static `import pg from "pg"` replaces loadDriver, poolOf and the hand-written Pool types here.
//
// Nothing here can leave the game waiting: a connection and a query each have a short limit, and every way of failing
// (no driver, a bad URL, a database that does not answer) ends in null and one log line without the URL or the password.
import { log } from "../../src/core/log";
import { createRedactor } from "./redact";
import { withTimeout } from "./timeout";

export interface Db {
  /** Runs one statement with its values passed apart from the text, and gives back the rows. The rows are not checked. */
  query<T>(text: string, params: readonly unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export const DRIVER = "pg";
/** How long opening a connection may take, or waiting for a free one. */
export const CONNECT_MS = 2500;
/** How long one query may take, the wait for a connection included. */
export const QUERY_MS = 3000;
/** Connections held at most. A free Tiger Data service allows few, and the account routes need few. */
export const MAX_CONNECTIONS = 4;
const IDLE_MS = 30_000;

/** The parts of the driver's pool used here. */
interface Pool {
  query(text: string, values: unknown[]): Promise<{ readonly rows: unknown[] }>;
  end(): Promise<void>;
  on(event: "error", listener: (error: unknown) => void): unknown;
}
type PoolClass = new (options: Readonly<Record<string, unknown>>) => Pool;

export type LoadDriver = () => Promise<unknown>;

/** The name is held in a variable so neither TypeScript nor the bundler looks for the package. */
const loadDriver: LoadDriver = () => {
  const name: string = DRIVER;
  return import(/* @vite-ignore */ name);
};

/** The Pool class of a loaded driver. The package is CommonJS, so it may sit on the module or on its default export. */
function poolOf(module: unknown): PoolClass | null {
  const holders = [module, typeof module === "object" && module !== null && "default" in module ? module.default : null];
  for (const holder of holders) {
    if (typeof holder === "object" && holder !== null && "Pool" in holder && typeof holder.Pool === "function") return holder.Pool as PoolClass;
  }
  return null;
}

function isPostgresUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === "postgres:" || protocol === "postgresql:") && hostname !== "";
  } catch {
    return false;
  }
}

/**
 * Everything in a connection string that must not reach a log: the string itself, the password as written and as
 * decoded, and the host. Longest first, so a short one cannot cut a long one in two before it is hidden.
 */
export function dbSecrets(url: string | null): string[] {
  if (url === null || url === "") return [];
  const found = [url];
  try {
    const parsed = new URL(url);
    found.push(parsed.password, parsed.host, parsed.hostname);
    found.push(decodeURIComponent(parsed.password));
  } catch {
    // Not a URL, or a password with a bad escape: the whole string is still hidden.
  }
  return [...new Set(found.filter((part) => part !== ""))].sort((a, b) => b.length - a.length);
}

export interface OpenOptions {
  /** Replaces the loading of the driver. Only tests set it. */
  readonly load?: LoadDriver;
  readonly connectMs?: number;
  readonly queryMs?: number;
}

/**
 * Opens the database, or returns null when there is none to use: no URL (said by nobody, it is the normal state),
 * no driver, a URL that is not a Postgres one, or a database that does not answer one small query in time.
 */
export async function openDb(url: string | null, options: OpenOptions = {}): Promise<Db | null> {
  if (url === null || url === "") return null;
  const redact = createRedactor(dbSecrets(url));
  const off = (reason: string, error?: unknown): null => {
    log("warn", "accounts_unavailable", error === undefined ? { reason } : { reason, detail: redact(error) });
    return null;
  };
  if (!isPostgresUrl(url)) return off("bad_url");

  let Pool: PoolClass | null = null;
  try {
    Pool = poolOf(await (options.load ?? loadDriver)());
  } catch {
    // The error names a path on this machine and nothing useful: the package is not installed.
  }
  if (Pool === null) return off("no_driver");

  const queryMs = options.queryMs ?? QUERY_MS;
  let pool: Pool;
  try {
    pool = new Pool({
      connectionString: url,
      max: MAX_CONNECTIONS,
      connectionTimeoutMillis: options.connectMs ?? CONNECT_MS,
      idleTimeoutMillis: IDLE_MS,
      query_timeout: queryMs,
      application_name: "odyssey-dojo",
    });
    // An idle connection that the database drops raises this. With nobody listening it would stop the server.
    pool.on("error", (error) => { log("warn", "accounts_connection_lost", redact(error)); });
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
