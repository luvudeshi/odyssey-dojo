// The hall of heroes against a real Tiger Data service, through the real app: a fight is written, the lists come
// back in order, tonight is told from all time, nobody writes as somebody else, and the time buckets hold what was fought.
//
// These need a database with TimescaleDB and the driver, so they run only when TEST_DATABASE_URL names one that tests
// may write to. Without it they are SKIPPED, not faked. Each run makes its own tables, hypertable and continuous
// aggregate under a random prefix and drops them at the end, so it can share a database with the real tables and
// with another run.
//
//   TEST_DATABASE_URL='postgres://...' npx vitest run server/tests/heroesDb.test.ts
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { createAccounts, statementsOf, tables } from "../lib/accounts";
import { openDb } from "../lib/db";
import type { Db } from "../lib/db";
import { FIGHTS_PER_ACCOUNT, HALL_CACHE_MS } from "../lib/heroLimits";
import { SCORE_MAX } from "../lib/heroRules";
import { ACTIVITY_BUCKETS, ACTIVITY_MINUTES, BOARD_SIZE, TONIGHT_HOURS, createHeroes, heroTables } from "../lib/heroes";

const url = (process.env.TEST_DATABASE_URL ?? "").trim();
const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const PASSWORD = "nine oars and a sail";
const HOUR_MS = 60 * 60 * 1000;
const BUCKET_MS = ACTIVITY_MINUTES * 60 * 1000;

interface Answer {
  readonly status: number;
  readonly body: unknown;
  readonly text: string;
}
interface Player {
  readonly token: string;
  readonly name: string;
  readonly id: string;
}
interface Row {
  readonly hero: string;
  readonly score: number;
  readonly stop: string;
  readonly style: string;
  readonly god: string | null;
  readonly you: boolean;
}
interface Shown {
  readonly at: string;
  readonly tonight: Row[];
  readonly allTime: Row[];
  readonly lastHour: number;
  readonly fightsEver: number;
  readonly stops: { stop: string; fights: number; wins: number }[];
  readonly activity: { minutes: number; until: string; fights: number[] };
}
/** One fight this run wrote, kept beside the database so each list can be worked out a second way. */
interface Fought {
  readonly hero: string;
  readonly at: number;
  readonly score: number;
  readonly stop: string;
  readonly won: boolean;
  /** The order it was written in: the later of two fights of one hero gives the name. */
  readonly order: number;
}

describe.skipIf(url === "")("the hall of heroes on a real Tiger Data service", () => {
  // A letter first, so it is a table name; random, so two runs never meet.
  const prefix = `t${randomBytes(5).toString("hex")}_`;
  const t = tables(prefix);
  const h = heroTables(prefix);
  let db: Db | null = null;
  let server: Server | null = null;
  let port = 0;
  /** The clock of the accounts and of the hall. Fights are written at this time. */
  let clock = Date.now();
  let serial = 0;
  const fought: Fought[] = [];
  /** A hero name no other test in this run has used. */
  const heroName = (): string => { serial += 1; return `Hero ${String(serial)} ${prefix.slice(1, 7)}`; };

  /** One statement straight to the database, to see what the routes left there. */
  const sql = <T>(text: string, params: readonly unknown[]): Promise<T[]> => {
    if (db === null) throw new Error("the database is not open");
    return db.query<T>(text, params);
  };

  const call = async (method: string, path: string, options: { json?: unknown; token?: string } = {}): Promise<Answer> => {
    const body = options.json === undefined ? undefined : JSON.stringify(options.json);
    const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.token === undefined ? {} : { Authorization: `Bearer ${options.token}` }),
      },
      ...(body === undefined ? {} : { body }),
    });
    const text = await response.text();
    return { status: response.status, text, body: text === "" ? null : JSON.parse(text) as unknown };
  };

  const signUp = async (name = heroName()): Promise<Player> => {
    const answer = await call("POST", "/api/account/signup", { json: { name, password: PASSWORD } });
    expect(answer.status).toBe(201);
    const { token } = answer.body as { token: string };
    const [row] = await sql<{ id: string }>(`select id::text as id from ${t.accounts} where name = $1::text`, [name]);
    if (row === undefined) throw new Error("the account is not in the table");
    return { token, name, id: row.id };
  };

  /** Sends one fight through the route as the player, at the clock's time, and notes it. */
  const fight = async (player: Player, score: number, more: { stop?: string; won?: boolean; hero?: string | null; style?: string; god?: string | null } = {}): Promise<Answer> => {
    const stop = more.stop ?? "polyphemus";
    const won = more.won ?? true;
    const answer = await call("POST", "/api/account/fights", {
      token: player.token,
      json: { fight: { stop, won, score, style: more.style ?? "boxer", god: more.god ?? null, seconds: 61.5, bestCombo: 4, ...(more.hero === null ? {} : { hero: more.hero ?? player.name }) } },
    });
    if (answer.status === 201) fought.push({ hero: more.hero ?? player.name, at: clock, score, stop, won, order: fought.length });
    return answer;
  };

  /** The hall as the route gives it, read afresh: the clock is moved past what the server keeps of the last reading. */
  const hall = async (token?: string): Promise<Shown> => {
    clock += HALL_CACHE_MS;
    const answer = await call("GET", "/api/heroes", token === undefined ? {} : { token });
    expect(answer.status).toBe(200);
    return answer.body as Shown;
  };

  /** The best score of each hero among `fights`, highest first, ten at most: the list worked out here, without the database. */
  const best = (fights: readonly Fought[]): { hero: string; score: number }[] => {
    const heroesOf = new Map<string, { hero: string; score: number; since: number; order: number }>();
    for (const one of fights) {
      // A hero is an account; in this file each account fights under names that all start with its own.
      const key = one.hero.split(" ").slice(0, 3).join(" ");
      const had = heroesOf.get(key);
      heroesOf.set(key, {
        hero: had === undefined || one.order > had.order ? one.hero : had.hero,
        score: Math.max(had?.score ?? 0, one.score),
        since: Math.min(had?.since ?? Number.POSITIVE_INFINITY, one.at),
        order: Math.max(had?.order ?? -1, one.order),
      });
    }
    return [...heroesOf.values()].sort((a, b) => b.score - a.score || a.since - b.since).slice(0, BOARD_SIZE).map(({ hero, score }) => ({ hero, score }));
  };
  const shown = (rows: readonly Row[]): { hero: string; score: number }[] => rows.map(({ hero, score }) => ({ hero, score }));
  const tonightOf = (): Fought[] => fought.filter((one) => one.at > clock - TONIGHT_HOURS * HOUR_MS && one.at <= clock);

  beforeAll(async () => {
    const opened = await openDb(url);
    if (opened === null) throw new Error("TEST_DATABASE_URL is set but the database did not open: is the pg package installed, and does the database answer?");
    db = opened;
    const accounts = createAccounts(() => Promise.resolve(opened), { prefix, now: () => clock });
    const door = statementsOf(accounts);
    if (door === null) throw new Error("the accounts have no door");
    const app = await createApp({ config, ai: NO_AI, accounts, heroes: createHeroes(door, { prefix, now: () => clock }) });
    const listening = app.listen(0, "127.0.0.1");
    await once(listening, "listening");
    server = listening;
    port = (listening.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server?.close();
    server?.closeAllConnections();
    if (db === null) return;
    // In this order: what reads from a table goes before the table. Only names with this run's prefix.
    await db.query(`drop materialized view if exists ${h.hourly}`, []);
    for (const table of [h.fights, t.saves, t.sessions, t.accounts]) await db.query(`drop table if exists ${table}`, []);
    const left = await db.query<{ name: string }>("select table_name::text as name from information_schema.tables where table_name like $1::text", [`${prefix}%`]);
    await db.close();
    expect(left).toEqual([]);
  });

  test("an empty hall is a hall: no heroes, no fights, and 36 buckets of nothing", async () => {
    const empty = await hall();
    expect(empty).toMatchObject({ tonight: [], allTime: [], lastHour: 0, fightsEver: 0, stops: [], activity: { minutes: ACTIVITY_MINUTES } });
    expect(empty.activity.fights).toEqual(Array.from({ length: ACTIVITY_BUCKETS }, () => 0));
  });

  test("the fights table is a hypertable with a chunk a day, and the hourly list is a real-time continuous aggregate with a refresh policy", async () => {
    const [table] = await sql<{ dimensions: number; column: string; chunk: string }>(
      `select h.num_dimensions::int as dimensions, d.column_name::text as column, d.time_interval::text as chunk
       from timescaledb_information.hypertables h join timescaledb_information.dimensions d on d.hypertable_name = h.hypertable_name
       where h.hypertable_name = $1::text`,
      [h.fights],
    );
    expect(table).toEqual({ dimensions: 1, column: "at", chunk: "1 day" });
    const [view] = await sql<{ source: string; stored_only: boolean }>(
      "select hypertable_name::text as source, materialized_only as stored_only from timescaledb_information.continuous_aggregates where view_name = $1::text",
      [h.hourly],
    );
    expect(view).toEqual({ source: h.fights, stored_only: false });
    // TimescaleDB adds the columnstore policy to the hypertable by itself; the refresh policy is the one made here.
    const jobs = await sql<{ on: string; proc: string; every: string }>(
      "select hypertable_name::text as on, proc_name::text as proc, schedule_interval::text as every from timescaledb_information.jobs where hypertable_name in ($1::text, $2::text) order by 1",
      [h.fights, h.hourly],
    );
    expect(jobs).toEqual([
      { on: h.fights, proc: "policy_compression", every: "1 day" },
      { on: h.hourly, proc: "policy_refresh_continuous_aggregate", every: "00:30:00" },
    ]);
    // Making them again changes nothing: a second server on the same database starts on what is there.
    const door = statementsOf(createAccounts(() => Promise.resolve(db), { prefix }));
    if (door === null) throw new Error("the accounts have no door");
    expect((await createHeroes(door, { prefix }).hall()).tonight).toEqual([]);
    const again = await sql<{ n: number }>("select count(*)::int as n from timescaledb_information.hypertables where hypertable_name = $1::text", [h.fights]);
    expect(again).toEqual([{ n: 1 }]);
  });

  test("old fights are ordered by time in the columnstore and not grouped by account, and a table from before is set right at start-up", async () => {
    const setting = (): Promise<{ segmentby: string; orderby: string }[]> => sql(
      "select coalesce(segmentby, '') as segmentby, orderby from timescaledb_information.hypertable_columnstore_settings where hypertable = $1::regclass",
      [h.fights],
    );
    expect(await setting()).toEqual([{ segmentby: "", orderby: "at DESC" }]);
    // What the table was made with before the setting was measured. This run's own table, and nothing else.
    await sql(`alter table ${h.fights} set (timescaledb.segmentby = 'account_id', timescaledb.orderby = 'at desc')`, []);
    expect(await setting()).toEqual([{ segmentby: "account_id", orderby: "at DESC" }]);
    // A server that starts on it changes the setting back, once, and has its hall.
    const door = statementsOf(createAccounts(() => Promise.resolve(db), { prefix }));
    if (door === null) throw new Error("the accounts have no door");
    const asked: string[] = [];
    const noting = (text: string, params: readonly unknown[]): Promise<unknown[]> => { asked.push(text); return door(text, params); };
    expect((await createHeroes(noting, { prefix }).hall()).activity.fights).toHaveLength(ACTIVITY_BUCKETS);
    expect(await setting()).toEqual([{ segmentby: "", orderby: "at DESC" }]);
    expect(asked.filter((text) => text.startsWith("alter table"))).toHaveLength(1);
    // And the next start finds nothing to change.
    asked.length = 0;
    await createHeroes(noting, { prefix }).hall();
    expect(asked.filter((text) => text.startsWith("alter table"))).toHaveLength(0);
    expect(await setting()).toEqual([{ segmentby: "", orderby: "at DESC" }]);
  });

  test("a signed-in player's fight is written with their account, the server's time and the name on their screen", async () => {
    const player = await signUp();
    const written = await fight(player, 1840, { stop: "scylla", style: "jiu_jitsu", god: "athena", hero: `${player.name} Bold` });
    expect([written.status, written.body]).toEqual([201, { recorded: true }]);
    const rows = await sql<Record<string, unknown>>(
      `select account_id::text as account, hero, stop_id, won, score, style_id, god_id, seconds::float8 as seconds, best_combo,
        (extract(epoch from at) * 1000)::float8 as at from ${h.fights} where account_id = $1::uuid`,
      [player.id],
    );
    expect(rows).toEqual([{ account: player.id, hero: `${player.name} Bold`, stop_id: "scylla", won: true, score: 1840, style_id: "jiu_jitsu", god_id: "athena", seconds: 61.5, best_combo: 4, at: clock }]);
    // No name sent: the hall shows the name of the account.
    clock += 1_000;
    expect((await fight(player, 900, { hero: null, won: false })).status).toBe(201);
    const names = await sql<{ hero: string }>(`select hero from ${h.fights} where account_id = $1::uuid and score = 900`, [player.id]);
    expect(names).toEqual([{ hero: player.name }]);
  });

  test("nobody writes as somebody else: the fight goes to the session's account whatever the body says, and no session writes nothing", async () => {
    const victim = await signUp();
    const other = await signUp();
    const before = await sql<{ n: number }>(`select count(*)::int as n from ${h.fights}`, []);
    const asVictim = await call("POST", "/api/account/fights", {
      token: other.token,
      json: { fight: { stop: "circe", won: true, score: 2222, style: "karate", accountId: victim.id, account_id: victim.id, hero: other.name }, accountId: victim.id },
    });
    expect(asVictim.status).toBe(201);
    fought.push({ hero: other.name, at: clock, score: 2222, stop: "circe", won: true, order: fought.length });
    const whose = await sql<{ account: string }>(`select account_id::text as account from ${h.fights} where score = 2222`, []);
    expect(whose).toEqual([{ account: other.id }]);
    expect(await sql(`select 1 from ${h.fights} where account_id = $1::uuid`, [victim.id])).toEqual([]);
    // No session, one nobody has, and the victim's id used as a token.
    for (const token of [undefined, randomBytes(32).toString("base64url"), victim.id]) {
      const refused = await call("POST", "/api/account/fights", { ...(token === undefined ? {} : { token }), json: { fight: { stop: "circe", won: true, score: 3333, style: "karate" } } });
      expect([refused.status, refused.body]).toEqual([401, { error: "signed_out" }]);
    }
    // A score nobody could have made is refused, and is not in the table.
    expect((await fight(other, SCORE_MAX + 1)).status).toBe(400);
    const after = await sql<{ n: number }>(`select count(*)::int as n from ${h.fights}`, []);
    expect(after[0]?.n).toBe((before[0]?.n ?? 0) + 1);
    // A signed-out session writes nothing more.
    expect((await call("POST", "/api/account/signout", { token: other.token })).status).toBe(204);
    expect((await fight(other, 100)).status).toBe(401);
  });

  test("the best score of each hero, highest first, ten at most, and a tie goes to who fought first", async () => {
    const players: Player[] = [];
    for (let index = 0; index < 12; index += 1) players.push(await signUp());
    // Each hero fights twice; the lower score comes second for some and first for others. Two heroes tie.
    const scores = [5200, 4100, 7300, 3000, 7300, 6100, 2500, 800, 4700, 3900, 6600, 1500];
    for (const [index, player] of players.entries()) {
      const score = scores[index] ?? 0;
      clock += 1_000;
      expect((await fight(player, index % 2 === 0 ? score : score - 700, { stop: "circe" })).status).toBe(201);
      clock += 1_000;
      expect((await fight(player, index % 2 === 0 ? score - 700 : score, { stop: "sirens", won: false })).status).toBe(201);
    }
    const read = await hall();
    expect(read.tonight).toHaveLength(BOARD_SIZE);
    expect(shown(read.tonight)).toEqual(best(tonightOf()));
    expect(shown(read.allTime)).toEqual(best(fought));
    // The two at 7,300: the one who fought first stands first. And each row says where its best score was made.
    expect(read.tonight.slice(0, 3).map((row) => [row.hero, row.score, row.stop])).toEqual([
      [players[2]?.name, 7300, "circe"], [players[4]?.name, 7300, "circe"], [players[10]?.name, 6600, "circe"],
    ]);
    expect(read.tonight.find((row) => row.hero === players[5]?.name)?.stop).toBe("sirens");
    for (const row of read.tonight) expect(typeof row.you).toBe("boolean");
  });

  test("the hall holds hero names and no id of any account, and marks the row of the player who asks", async () => {
    const asked = await signUp();
    expect((await fight(asked, 9100, { stop: "suitors" })).status).toBe(201);
    const ids = await sql<{ id: string }>(`select id::text as id from ${t.accounts}`, []);
    clock += HALL_CACHE_MS;
    for (const options of [{}, { token: asked.token }]) {
      const answer = await call("GET", "/api/heroes", options);
      expect(answer.status).toBe(200);
      for (const { id } of ids) expect(answer.text).not.toContain(id);
      expect(answer.text).not.toMatch(/account/i);
    }
    const mine = await hall(asked.token);
    expect(mine.tonight.filter((row) => row.you).map((row) => row.hero)).toEqual([asked.name]);
    expect(mine.allTime.filter((row) => row.you).map((row) => row.hero)).toEqual([asked.name]);
    expect(mine.tonight[0]).toMatchObject({ hero: asked.name, score: 9100, stop: "suitors", you: true });
    const anybody = await hall();
    expect([...anybody.tonight, ...anybody.allTime].some((row) => row.you)).toBe(false);
  });

  test("tonight is the last 24 hours and all time keeps what is older, before and after the aggregate is refreshed", async () => {
    const old = await signUp();
    const present = clock;
    // Three days ago this hero made the best score there has been, and a lesser one two days ago.
    clock = present - 72 * HOUR_MS;
    expect((await fight(old, 12_000, { stop: "charybdis", style: "taekwondo", god: "poseidon" })).status).toBe(201);
    clock = present - 48 * HOUR_MS;
    expect((await fight(old, 300, { stop: "polyphemus", won: false })).status).toBe(201);
    // 23 hours ago is still tonight; 25 hours ago is not.
    const edge = await signUp();
    clock = present - 25 * HOUR_MS;
    expect((await fight(edge, 11_000)).status).toBe(201);
    clock = present - 23 * HOUR_MS;
    expect((await fight(edge, 150)).status).toBe(201);
    clock = present;

    const check = async (): Promise<void> => {
      const read = await hall();
      expect(shown(read.tonight)).toEqual(best(tonightOf()));
      expect(shown(read.allTime)).toEqual(best(fought));
      expect(read.tonight.map((row) => row.hero)).not.toContain(old.name);
      expect(read.tonight.find((row) => row.hero === edge.name)).toBeUndefined();
      expect(read.allTime.slice(0, 2).map((row) => [row.hero, row.score, row.stop, row.style, row.god])).toEqual([
        [old.name, 12_000, "charybdis", "taekwondo", "poseidon"], [edge.name, 11_000, "polyphemus", "boxer", null],
      ]);
      expect(read.fightsEver).toBe(fought.length);
    };
    // Read as the game reads it. The dated-back rows are behind where the aggregate has been written to, so
    // they show once it is refreshed; fights of this hour show at once (real-time aggregation).
    await sql(`call refresh_continuous_aggregate($1::regclass, null, $2::timestamptz)`, [h.hourly, new Date(present - HOUR_MS).toISOString()]);
    await check();
    // What the refresh wrote down: the four hours that are over (two of each of these heroes), and not the hour that is still running.
    const [place] = await sql<{ schema: string; name: string }>(
      "select materialization_hypertable_schema::text as schema, materialization_hypertable_name::text as name from timescaledb_information.continuous_aggregates where view_name = $1::text",
      [h.hourly],
    );
    if (place === undefined || !/^[a-z0-9_]+$/.test(place.schema) || !/^[a-z0-9_]+$/.test(place.name)) throw new Error("the aggregate has no table of its own");
    const [stored] = await sql<{ n: number }>(`select count(*)::int as n from ${place.schema}.${place.name}`, []);
    expect(stored?.n).toBe(4);
    // Refreshed a second time over everything that is over: the same lists.
    await sql(`call refresh_continuous_aggregate($1::regclass, null, $2::timestamptz)`, [h.hourly, new Date(present - HOUR_MS).toISOString()]);
    await check();
  });

  test("the activity line is fights per ten minutes over six hours with the empty buckets as zero, beside this hour's count and the wins at each stop", async () => {
    const runner = await signUp();
    // Not in the last minute of a bucket: the readings below must fall in the bucket the fights were placed against.
    if (BUCKET_MS - (clock % BUCKET_MS) < 60_000) clock += 60_000;
    const present = clock;
    const until = Math.floor(present / BUCKET_MS) * BUCKET_MS + BUCKET_MS;
    // Two fights in the bucket 13 back from the last, one in the bucket 7 back, and one 7 hours ago, which is off the line.
    const middle = (back: number): number => until - back * BUCKET_MS - BUCKET_MS / 2;
    for (const at of [middle(13), middle(13) + 60_000, middle(7), present - 7 * HOUR_MS]) {
      clock = at;
      expect((await fight(runner, 50, { stop: "sirens", won: at === middle(7) })).status).toBe(201);
    }
    clock = present;
    const read = await hall();
    const line = Array.from({ length: ACTIVITY_BUCKETS }, () => 0);
    for (const one of fought) {
      const index = Math.floor((one.at - (until - ACTIVITY_BUCKETS * BUCKET_MS)) / BUCKET_MS);
      if (index >= 0 && index < ACTIVITY_BUCKETS && one.at <= clock) line[index] = (line[index] ?? 0) + 1;
    }
    expect(read.activity).toEqual({ minutes: ACTIVITY_MINUTES, until: new Date(Math.floor(clock / BUCKET_MS) * BUCKET_MS + BUCKET_MS).toISOString(), fights: line });
    expect(line[ACTIVITY_BUCKETS - 1 - 13]).toBe(2);
    expect(line[ACTIVITY_BUCKETS - 1 - 7]).toBe(1);
    expect(read.lastHour).toBe(fought.filter((one) => one.at > clock - HOUR_MS && one.at <= clock).length);
    // Wins at each stop tonight, most wins first.
    const counted = new Map<string, { stop: string; fights: number; wins: number }>();
    for (const one of tonightOf()) {
      const had = counted.get(one.stop) ?? { stop: one.stop, fights: 0, wins: 0 };
      counted.set(one.stop, { stop: one.stop, fights: had.fights + 1, wins: had.wins + (one.won ? 1 : 0) });
    }
    expect(read.stops).toEqual([...counted.values()].sort((a, b) => b.wins - a.wins || b.fights - a.fights || a.stop.localeCompare(b.stop)));
    expect(read.stops.find((stop) => stop.stop === "sirens")).toMatchObject({ wins: 1 });
  });

  test("the fifth fight of one account in a minute is refused and not written, and the hall is read from memory in between", async () => {
    const eager = await signUp();
    for (let index = 0; index < FIGHTS_PER_ACCOUNT; index += 1) expect((await fight(eager, 10 + index)).status).toBe(201);
    const fifth = await fight(eager, 20_000);
    expect([fifth.status, fifth.body]).toEqual([429, { error: "slow_down" }]);
    expect(await sql(`select 1 from ${h.fights} where score = 20000`, [])).toEqual([]);
    // Two readings with the clock standing still are one reading: the second does not see a fight written after the first.
    const first = await hall();
    const late = await signUp();
    expect((await fight(late, 25_000)).status).toBe(201);
    const second = await call("GET", "/api/heroes");
    expect(second.body).toEqual(first);
    expect((await hall()).tonight[0]).toMatchObject({ hero: late.name, score: 25_000 });
  });

  test("deleting an account takes its fights with it, and its row leaves both lists", async () => {
    const leaver = await signUp();
    expect((await fight(leaver, 29_000)).status).toBe(201);
    expect((await hall()).allTime[0]).toMatchObject({ hero: leaver.name, score: 29_000 });
    await sql(`delete from ${t.accounts} where id = $1::uuid`, [leaver.id]);
    expect(await sql(`select 1 from ${h.fights} where account_id = $1::uuid`, [leaver.id])).toEqual([]);
    const read = await hall();
    expect([...read.tonight, ...read.allTime].map((row) => row.hero)).not.toContain(leaver.name);
    // The session of the account that is gone writes nothing.
    expect((await fight(leaver, 100)).status).toBe(401);
  });

  test("a row under a name that is no account's is traced to its account through the fights table, and deleting that account takes the row off", async () => {
    // The two statements of docs/accounts.md, "Taking a row off the hall", on this run's own tables.
    const cheat = await signUp();
    const shown = `Nobody ${prefix.slice(1, 7)}`;
    const sent = await call("POST", "/api/account/fights", { token: cheat.token, json: { fight: { stop: "suitors", won: true, score: 29_500, style: "boxer", hero: shown } } });
    expect(sent.status).toBe(201);
    expect((await hall()).allTime[0]).toMatchObject({ hero: shown, score: 29_500 });
    // The name on the row is what the browser sent. No account has it, so deleting by that name would delete nothing.
    expect(await sql(`select 1 from ${t.accounts} where name_key = lower($1::text)`, [shown])).toEqual([]);
    const behind = await sql<{ account_id: string; account: string; best: number; fights: number }>(
      `select f.account_id::text as account_id, a.name as account, max(f.score)::int as best, count(*)::int as fights
       from ${h.fights} f join ${t.accounts} a on a.id = f.account_id
       where f.hero = $1::text
       group by f.account_id, a.name order by best desc`,
      [shown],
    );
    expect(behind).toEqual([{ account_id: cheat.id, account: cheat.name, best: 29_500, fights: 1 }]);
    await sql(`delete from ${t.accounts} where id = $1::uuid`, [behind[0]?.account_id]);
    const read = await hall();
    expect([...read.tonight, ...read.allTime].map((row) => row.hero)).not.toContain(shown);
  });
});
