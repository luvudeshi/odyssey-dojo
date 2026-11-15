// The hall of heroes: every finished fight of a signed-in player, kept as a time series on Tiger Data, and the
// lists and counts read back from it. This is what the game uses Tiger Data for beyond plain Postgres:
//
// - `fights` is a hypertable on its time column, one chunk a day. "Tonight" reads the last day's chunk and no other.
//   Chunks older than a day are kept in the columnstore, grouped by account (TimescaleDB sets that policy itself).
// - `fights_hourly` is a continuous aggregate: per account and hour, the fights, the wins, the best score and the
//   fight it came from. "All time" reads those few rows per hero, not every fight ever fought. It is real-time, so
//   a fight of this minute is in it before the next refresh.
// - time_bucket_gapfill gives the fights per ten minutes with the empty buckets filled in, for the activity line.
// - last(value, time) and last(value, score) pick the newest hero name and the stop of the best fight in one pass.
//
// Statements go through the accounts' own door (statementsOf in ./accounts), so the account tables exist first and
// the hall is off whenever the accounts are. It does not work the other way: a statement of the hall that fails is
// not counted against the accounts, and a reading that failed is remembered here for HALL_CACHE_MS, so a broken hall
// asks the database once in that time and sign-in, saves and fights go on. Every value goes to the database apart
// from the text. A database without TimescaleDB has no hall: one log line, and every call here throws Unavailable.
import { z } from "zod";
import { log } from "../../src/core/log";
import { Unavailable, tables } from "./accounts";
import type { Statement } from "./accounts";
import { HALL_CACHE_MS } from "./heroLimits";
import type { Fight } from "./heroRules";

/** Heroes on each list. */
export const BOARD_SIZE = 10;
/** "Tonight" is the fights of this many hours back from now. */
export const TONIGHT_HOURS = 24;
/** The activity line: fights per bucket of this many minutes, this many buckets back from now (six hours). */
export const ACTIVITY_MINUTES = 10;
export const ACTIVITY_BUCKETS = 36;
/** Stops in the wins-per-stop count. The road has six; a generated fight may add its own. */
export const STOPS_MAX = 12;
/** After the tables could not be made they are tried again this often, and no more often. */
export const RETRY_MS = 15_000;

const HOUR_MS = 60 * 60 * 1000;
const BUCKET_MS = ACTIVITY_MINUTES * 60 * 1000;

export interface HeroTables {
  readonly accounts: string;
  readonly fights: string;
  readonly hourly: string;
}

/** The table names. A prefix is only for tests; `tables` checks it, because it becomes part of the statement text. */
export function heroTables(prefix = ""): HeroTables {
  return { accounts: tables(prefix).accounts, fights: `${prefix}fights`, hourly: `${prefix}fights_hourly` };
}

interface Prepared {
  readonly text: string;
  readonly params: readonly unknown[];
}

/** The statements that make the hypertable, the continuous aggregate and its refresh policy, each safe to run again. They need the accounts table. */
export function heroSchemaSql(prefix = ""): readonly Prepared[] {
  const t = heroTables(prefix);
  return [
    {
      // One row a fight. A chunk a day: "tonight" touches one or two chunks, and a chunk a day old moves to the columnstore.
      text: `create table if not exists ${t.fights} (
        at timestamptz not null,
        account_id uuid not null references ${t.accounts} (id) on delete cascade,
        hero text not null,
        stop_id text not null,
        won boolean not null,
        score integer not null,
        style_id text not null,
        god_id text,
        seconds real,
        best_combo integer
      ) with (tsdb.hypertable, tsdb.partition_column = 'at', tsdb.chunk_interval = '1 day', tsdb.segmentby = 'account_id', tsdb.orderby = 'at desc')`,
      params: [],
    },
    {
      // last(x, score) is the x of the row with the highest score: the stop, style and god of the hour's best fight.
      text: `create materialized view if not exists ${t.hourly}
        with (timescaledb.continuous, timescaledb.materialized_only = false) as
        select time_bucket(interval '1 hour', at) as bucket, account_id,
          count(*) as fights, count(*) filter (where won) as wins, max(score) as best, min(at) as first_at,
          last(hero, at) as hero, last(stop_id, score) as best_stop, last(style_id, score) as best_style, last(god_id, score) as best_god
        from ${t.fights} group by bucket, account_id
        with no data`,
      params: [],
    },
    {
      // Every half hour the hours that are over are written down. No start: whatever was missed while the service slept is caught up.
      text: `select add_continuous_aggregate_policy($1::regclass, start_offset => null::interval, end_offset => interval '1 hour',
        schedule_interval => interval '30 minutes', if_not_exists => true)`,
      params: [t.hourly],
    },
  ];
}

export interface HallRow {
  /** Whose row this is. For marking the reader's own row; it never leaves the server. */
  readonly accountId: string;
  readonly hero: string;
  readonly score: number;
  /** Where the best score was made: the stop, the fighting style and the god, as ids. */
  readonly stop: string;
  readonly style: string;
  readonly god: string | null;
}

export interface StopCount {
  readonly stop: string;
  readonly fights: number;
  readonly wins: number;
}

export interface Hall {
  /** When this was read from the database. */
  readonly at: string;
  /** The best score of each hero in the last TONIGHT_HOURS, highest first, BOARD_SIZE at most. */
  readonly tonight: readonly HallRow[];
  readonly allTime: readonly HallRow[];
  readonly lastHour: number;
  readonly fightsEver: number;
  /** Fights and wins at each stop in the last TONIGHT_HOURS, most wins first. */
  readonly stops: readonly StopCount[];
  /** Fights per ACTIVITY_MINUTES, oldest first; the last bucket ends at `until`. */
  readonly activity: { readonly minutes: number; readonly until: string; readonly fights: readonly number[] };
}

export interface Heroes {
  /** Writes one finished fight of this account. False when the account is not there (any more). Throws Unavailable. */
  readonly record: (accountId: string, fight: Fight) => Promise<boolean>;
  /** The hall, read at most `cacheMs` ago. Everybody who asks in that time shares one reading, or one failure. Throws Unavailable. */
  readonly hall: () => Promise<Hall>;
}

export interface HeroesOptions {
  readonly now?: () => number;
  /** A table name prefix, for tests. The same one the accounts were given. */
  readonly prefix?: string;
  readonly cacheMs?: number;
  /** What a reading of the hall waits at before it asks the database. The route passes the strangers' gate. */
  readonly gate?: <T>(work: () => Promise<T>) => Promise<T>;
}

// What the database gives back is checked like anything else that comes from outside.
const id = z.string().min(1).max(64);
const count = z.coerce.number().int().min(0);
const boardRow = z.object({ account_id: id, hero: z.string().min(1).max(64), best: count, stop: id, style: id, god: id.nullable() });
const stopRow = z.object({ stop: id, fights: count, wins: count });
const hallRow = z.object({ tonight: z.string(), ever: z.string(), stops: z.string(), activity: z.string(), last_hour: count, fights_ever: count });
const board = z.array(boardRow).max(BOARD_SIZE);
const stops = z.array(stopRow).max(STOPS_MAX);
const activity = z.array(count).max(ACTIVITY_BUCKETS);

/**
 * The one statement that reads the whole hall. Its parts, each a list as JSON:
 * $1 now, $2 the start of tonight, $3 an hour ago, $4 and $5 the first and the end of the activity buckets.
 */
function hallSql(t: HeroTables): string {
  return `with tonight as (
      select account_id, last(hero, at) as hero, max(score) as best,
        last(stop_id, score) as stop, last(style_id, score) as style, last(god_id, score) as god, min(at) as since
      from ${t.fights} where at > $2::timestamptz and at <= $1::timestamptz
      group by account_id order by best desc, since asc, account_id asc limit ${String(BOARD_SIZE)}
    ), ever as (
      select h.account_id, last(h.hero, h.bucket) as hero, max(h.best) as best,
        last(h.best_stop, h.best) as stop, last(h.best_style, h.best) as style, last(h.best_god, h.best) as god, min(h.first_at) as since
      from ${t.hourly} h where h.bucket <= $1::timestamptz and exists (select 1 from ${t.accounts} a where a.id = h.account_id)
      group by h.account_id order by best desc, since asc, h.account_id asc limit ${String(BOARD_SIZE)}
    ), stops as (
      select stop_id as stop, count(*) as fights, count(*) filter (where won) as wins
      from ${t.fights} where at > $2::timestamptz and at <= $1::timestamptz
      group by stop_id order by wins desc, fights desc, stop_id asc limit ${String(STOPS_MAX)}
    ), activity as (
      select time_bucket_gapfill(interval '${String(ACTIVITY_MINUTES)} minutes', at, $4::timestamptz, $5::timestamptz) as bucket, coalesce(count(*), 0) as fights
      from ${t.fights} where at >= $4::timestamptz and at < $5::timestamptz
      group by bucket
    )
    select
      (select coalesce(json_agg(json_build_object('account_id', account_id, 'hero', hero, 'best', best, 'stop', stop, 'style', style, 'god', god) order by best desc, since asc, account_id asc), '[]'::json) from tonight)::text as tonight,
      (select coalesce(json_agg(json_build_object('account_id', account_id, 'hero', hero, 'best', best, 'stop', stop, 'style', style, 'god', god) order by best desc, since asc, account_id asc), '[]'::json) from ever)::text as ever,
      (select coalesce(json_agg(json_build_object('stop', stop, 'fights', fights, 'wins', wins) order by wins desc, fights desc, stop asc), '[]'::json) from stops)::text as stops,
      (select coalesce(json_agg(fights order by bucket asc), '[]'::json) from activity)::text as activity,
      (select count(*) from ${t.fights} where at > $3::timestamptz and at <= $1::timestamptz)::int as last_hour,
      (select coalesce(sum(fights), 0) from ${t.hourly} where bucket <= $1::timestamptz)::int as fights_ever`;
}

/**
 * `statement` is the accounts' door (statementsOf in ./accounts). The hypertable and the aggregate are made at first
 * use and, after a failure, tried again at most every RETRY_MS.
 */
export function createHeroes(statement: Statement, options: HeroesOptions = {}): Heroes {
  const now = options.now ?? Date.now;
  const cacheMs = options.cacheMs ?? HALL_CACHE_MS;
  const gate = options.gate ?? (<T>(work: () => Promise<T>): Promise<T> => work());
  const t = heroTables(options.prefix);
  const schema = heroSchemaSql(options.prefix);
  const readHall = hallSql(t);

  let state: "unknown" | "ready" | "off" = "unknown";
  let triedAt = Number.NEGATIVE_INFINITY;
  let preparing: Promise<void> | null = null;
  let cached: { readonly at: number; readonly hall: Hall } | null = null;
  /** When a reading last failed at the database. Until cacheMs after it nobody is sent there again. */
  let failedAt = Number.NEGATIVE_INFINITY;
  let reading: Promise<Hall> | null = null;

  const iso = (ms: number): string => new Date(ms).toISOString();

  /** Makes the tables once. Two callers at once share one attempt. */
  const prepare = (): Promise<void> => {
    if (state === "ready") return Promise.resolve();
    if (preparing !== null) return preparing;
    if (state === "off" || now() - triedAt < RETRY_MS) return Promise.reject(new Unavailable());
    triedAt = now();
    preparing = (async () => {
      const found = await statement("select 1 as n from pg_extension where extname = $1::text", ["timescaledb"]);
      if (found.length === 0) {
        // A plain Postgres. Trying the statements would only fail.
        state = "off";
        log("warn", "heroes_unavailable", { reason: "no_timescaledb" });
        throw new Unavailable();
      }
      for (const { text, params } of schema) await statement(text, params);
      state = "ready";
      log("info", "heroes_ready");
    })().finally(() => { preparing = null; });
    return preparing;
  };

  /** A list the database sent as JSON text, in the expected shape. One that is not is a fault of ours or of the database: Unavailable. */
  const listOf = <T>(shape: z.ZodType<T>, text: string): T => {
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Falls through to the check below, which refuses null.
    }
    const parsed = shape.safeParse(data);
    if (parsed.success) return parsed.data;
    log("error", "heroes_bad_row");
    throw new Unavailable();
  };

  const rowsOf = (rows: readonly z.infer<typeof boardRow>[]): HallRow[] =>
    rows.map((row) => ({ accountId: row.account_id, hero: row.hero, score: row.best, stop: row.stop, style: row.style, god: row.god }));

  const ask = async (): Promise<Hall> => {
    const at = now();
    // The buckets end on a whole ten minutes, the one that holds this moment included.
    const until = Math.floor(at / BUCKET_MS) * BUCKET_MS + BUCKET_MS;
    const rows = await statement(readHall, [iso(at), iso(at - TONIGHT_HOURS * HOUR_MS), iso(at - HOUR_MS), iso(until - ACTIVITY_BUCKETS * BUCKET_MS), iso(until)]);
    const row = hallRow.safeParse(rows[0]);
    if (!row.success) {
      log("error", "heroes_bad_row");
      throw new Unavailable();
    }
    const fights = listOf(activity, row.data.activity);
    return {
      at: iso(at),
      tonight: rowsOf(listOf(board, row.data.tonight)),
      allTime: rowsOf(listOf(board, row.data.ever)),
      lastHour: row.data.last_hour,
      fightsEver: row.data.fights_ever,
      stops: listOf(stops, row.data.stops),
      // Gapfill gives every bucket; should one be missing all the same, the line is padded on the old side.
      activity: { minutes: ACTIVITY_MINUTES, until: iso(until), fights: [...Array.from({ length: ACTIVITY_BUCKETS - fights.length }, () => 0), ...fights] },
    };
  };

  /** The reading itself. The tables keep their own memory of a failure (RETRY_MS, in `prepare`); this keeps the statement's. */
  const read = async (): Promise<Hall> => {
    await prepare();
    try {
      return await ask();
    } catch (error) {
      failedAt = now();
      throw error;
    }
  };

  return {
    record: async (accountId, fight) => {
      await prepare();
      // The account comes from the session and nowhere else. A hero name the browser did not send is the account's own.
      const made = await statement(
        `insert into ${t.fights} (at, account_id, hero, stop_id, won, score, style_id, god_id, seconds, best_combo)
        select $1::timestamptz, a.id, coalesce($3::text, a.name), $4::text, $5::boolean, $6::int, $7::text, $8::text, $9::real, $10::int
        from ${t.accounts} a where a.id = $2::uuid
        returning 1 as n`,
        [iso(now()), accountId, fight.hero, fight.stop, fight.won, fight.score, fight.style, fight.god, fight.seconds, fight.bestCombo],
      );
      return made.length > 0;
    },

    hall: () => {
      const age = cached === null ? Number.POSITIVE_INFINITY : now() - cached.at;
      if (cached !== null && age >= 0 && age < cacheMs) return Promise.resolve(cached.hall);
      // A hall that just failed is not asked again by everybody who looks: one try in cacheMs, like one reading.
      const since = now() - failedAt;
      if (since >= 0 && since < cacheMs) return Promise.reject(new Unavailable());
      reading ??= gate(read)
        .then((hall) => {
          cached = { at: now(), hall };
          return hall;
        })
        .finally(() => { reading = null; });
      return reading;
    },
  };
}
