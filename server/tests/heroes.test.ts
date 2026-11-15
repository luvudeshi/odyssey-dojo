// The hall of heroes with no database: what a fight must look like, the limits on a clock the test moves, who may
// reach the two paths, and in which order the routes count, refuse and ask.
//
// What stands in for what, so nobody takes it for the real thing: the routes run over an Accounts object and a
// Heroes object that give fixed answers, and the hall's own code runs over a made-up statement function that
// answers from a list. None of them is a database and none proves a statement. The statements run against a real
// Tiger Data service in heroesDb.test.ts.
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Deps } from "../app";
import type { Config } from "../env";
import { WRONG_TOKENS_PER_ADDRESS } from "../lib/accountLimits";
import { FAILURES_TO_GIVE_UP, Unavailable, createAccounts, makeToken, statementsOf } from "../lib/accounts";
import type { Accounts, Statement } from "../lib/accounts";
import type { Db } from "../lib/db";
import { FIGHTS_OVERALL, FIGHTS_PER_ACCOUNT, FIGHTS_PER_ACCOUNT_HOUR, HALL_CACHE_MS, HALL_READS_PER_ADDRESS, createHeroLimits } from "../lib/heroLimits";
import { COMBO_MAX, FIGHT_BODY_BYTES, SCORE_MAX, SECONDS_MAX, SECONDS_MIN, parseFightBody } from "../lib/heroRules";
import { ACTIVITY_BUCKETS, ACTIVITY_MINUTES, BOARD_SIZE, RETRY_MS, columnstoreSql, createHeroes, heroSchemaSql, heroTables } from "../lib/heroes";
import type { Hall, Heroes } from "../lib/heroes";
import { isAccountPath, isHeroesPath, isOpenPath, isTunnelPath, mayAnswer, readsOwnBody } from "../lib/localOnly";
import { MINUTE_MS, THIS_MACHINE } from "../lib/roomLimits";
import { captureLog } from "./support/drill";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const LAN = "192.168.1.20";
/** What cloudflared puts on a request it hands to the server. The visitor's address is made up. */
const TUNNEL = { "Cf-Connecting-Ip": "203.0.113.7", "Cf-Ray": "8f1c2d3e4f5a6b7c-DFW", "X-Forwarded-For": "203.0.113.7", "X-Forwarded-Proto": "https", "Cdn-Loop": "cloudflare" };
const FIGHT = { stop: "polyphemus", won: true, score: 1840, style: "boxer", god: "athena", seconds: 62.4, bestCombo: 7, hero: "Odysseus" };

const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
  vi.restoreAllMocks();
});

interface Answer {
  readonly status: number;
  readonly text: string;
  readonly cache: string | null;
  readonly retry: string | null;
}
type Call = (method: string, path: string, options?: { json?: unknown; token?: string; headers?: Record<string, string>; text?: string }) => Promise<Answer>;

/** The real app on a loopback port. */
async function serve(extra: Partial<Deps> = {}): Promise<Call> {
  const app = await createApp({ config, ai: NO_AI, ...extra });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => { server.close(); server.closeAllConnections(); });
  const port = (server.address() as AddressInfo).port;
  return async (method, path, options = {}) => {
    const body = options.text ?? (options.json === undefined ? undefined : JSON.stringify(options.json));
    const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.token === undefined ? {} : { Authorization: `Bearer ${options.token}` }),
        ...options.headers,
      },
      ...(body === undefined ? {} : { body }),
    });
    return { status: response.status, text: await response.text(), cache: response.headers.get("cache-control"), retry: response.headers.get("retry-after") };
  };
}

/** Takes `times` from a budget and says how many were let through. */
function passed(take: () => number, times: number): number {
  let through = 0;
  for (let index = 0; index < times; index += 1) if (take() === 0) through += 1;
  return through;
}

test("a fight is a stop, a style, a result and a score inside what a real fight gives; the rest may be left out", () => {
  expect(parseFightBody({ fight: FIGHT })).toEqual({ ...FIGHT, seconds: 62.4 });
  // What the browser could not measure is null, and a name that cannot be one is left to the account's own.
  expect(parseFightBody({ fight: { stop: "kung_fu-2", won: false, score: 0, style: "kung_fu" } }))
    .toEqual({ stop: "kung_fu-2", won: false, score: 0, style: "kung_fu", god: null, seconds: null, bestCombo: null, hero: null });
  expect(parseFightBody({ fight: { ...FIGHT, god: null, seconds: null, bestCombo: null, hero: "  x " } })).toMatchObject({ god: null, seconds: null, bestCombo: null, hero: null });
  // The name is cleaned like an account name: unseen characters go, spaces at the ends go, 20 characters at most.
  expect(parseFightBody({ fight: { ...FIGHT, hero: " Ody​sseus\u0007 " } })?.hero).toBe("Odysseus");
  expect(parseFightBody({ fight: { ...FIGHT, hero: "A".repeat(60) } })?.hero).toBe("A".repeat(20));
  expect(parseFightBody({ fight: { ...FIGHT, seconds: 62.449 } })?.seconds).toBe(62.4);
  // The edges of every range are inside it.
  for (const edge of [{ score: SCORE_MAX }, { seconds: SECONDS_MIN }, { seconds: SECONDS_MAX }, { bestCombo: COMBO_MAX }, { stop: "a".repeat(32) }]) {
    expect(parseFightBody({ fight: { ...FIGHT, ...edge } }), JSON.stringify(edge)).not.toBeNull();
  }
  // A field beside the known ones is dropped: nothing in a body can say whose fight it is.
  expect(parseFightBody({ fight: { ...FIGHT, accountId: "0d15ea5e-0000-4000-8000-000000000000", at: "2020-01-01T00:00:00Z" }, accountId: "x" })).toEqual(FIGHT);
});

test("a fight outside the ranges, or with an id that is not a short slug, is refused whole", () => {
  const bad: readonly Record<string, unknown>[] = [
    { score: SCORE_MAX + 1 }, { score: -1 }, { score: 12.5 }, { score: "1840" }, { score: Number.NaN }, { score: 1e12 },
    { seconds: SECONDS_MIN - 0.5 }, { seconds: SECONDS_MAX + 1 }, { seconds: "60" },
    { bestCombo: COMBO_MAX + 1 }, { bestCombo: -1 }, { bestCombo: 2.5 },
    { won: "yes" }, { won: 1 },
    { stop: "" }, { stop: "Polyphemus" }, { stop: "a".repeat(33) }, { stop: "poly phemus" }, { stop: "x'; drop table fights; --" }, { stop: "_x" }, { stop: 5 },
    { style: "" }, { style: "../boxer" }, { god: "Athena!" }, { god: "" }, { hero: 5 }, { hero: "x".repeat(201) },
  ];
  for (const change of bad) expect(parseFightBody({ fight: { ...FIGHT, ...change } }), JSON.stringify(change)).toBeNull();
  for (const field of ["stop", "won", "score", "style"]) {
    expect(parseFightBody({ fight: Object.fromEntries(Object.entries(FIGHT).filter(([name]) => name !== field)) }), field).toBeNull();
  }
  for (const body of [null, undefined, 5, "fight", [], {}, { fight: null }, { fight: [FIGHT] }, FIGHT]) expect(parseFightBody(body)).toBeNull();
  // A real body is far under the limit the route reads.
  expect(Buffer.byteLength(JSON.stringify({ fight: { ...FIGHT, hero: "W".repeat(20) } }))).toBeLessThan(FIGHT_BODY_BYTES / 4);
});

test("an account records four fights a minute and ninety an hour, whoever sends them, and one account cannot use up another's", () => {
  let now = 0;
  const limits = createHeroLimits(() => now);
  expect(passed(() => limits.fight("a", "account-1"), FIGHTS_PER_ACCOUNT + 3)).toBe(FIGHTS_PER_ACCOUNT);
  expect(limits.fight("a", "account-1")).toBe(60);
  // From another address, and from this machine: the account is what is counted.
  expect(limits.fight("b", "account-1")).toBeGreaterThan(0);
  expect(limits.fight(THIS_MACHINE, "account-1")).toBeGreaterThan(0);
  expect(limits.fight("a", "account-2")).toBe(0);
  now += MINUTE_MS;
  expect(limits.fight("a", "account-1")).toBe(0);
  // The hour: four a minute would be 240, and ninety are let through.
  let through = FIGHTS_PER_ACCOUNT + 1;
  for (let minute = 2; minute < 60; minute += 1) {
    now = minute * MINUTE_MS;
    through += passed(() => limits.fight("a", "account-1"), FIGHTS_PER_ACCOUNT);
  }
  expect(through).toBe(FIGHTS_PER_ACCOUNT_HOUR);
  now = 61 * MINUTE_MS;
  expect(limits.fight("a", "account-1")).toBe(0);
});

test("all strangers together write 120 fights a minute, only a fight that was written counts, and this machine is left out", () => {
  let now = 5_000;
  const limits = createHeroLimits(() => now);
  // A fight that was refused or failed gives its place back, any number of times.
  for (let index = 0; index < 500; index += 1) {
    expect(limits.fight("a", `gone ${String(index)}`)).toBe(0);
    limits.fightNotWritten("a");
  }
  let through = 0;
  for (let index = 0; index < FIGHTS_OVERALL + 30; index += 1) if (limits.fight(`address ${String(index % 7)}`, `account ${String(index)}`) === 0) through += 1;
  expect(through).toBe(FIGHTS_OVERALL);
  expect(limits.fight("z", "one more")).toBeGreaterThan(0);
  // The laptop that runs the server still records its own fights, and giving back for it takes nothing from the strangers' count.
  expect(limits.fight(THIS_MACHINE, "the demo account")).toBe(0);
  limits.fightNotWritten(THIS_MACHINE);
  expect(limits.fight("z", "one more")).toBeGreaterThan(0);
  now += MINUTE_MS;
  expect(limits.fight("z", "one more")).toBe(0);
});

test("the hall is read 300 times a minute from one address, and this machine is never refused", () => {
  let now = 0;
  const limits = createHeroLimits(() => now);
  expect(passed(() => limits.read("a"), HALL_READS_PER_ADDRESS + 50)).toBe(HALL_READS_PER_ADDRESS);
  expect(limits.read("a")).toBe(60);
  expect(limits.read("b")).toBe(0);
  expect(passed(() => limits.read(THIS_MACHINE), HALL_READS_PER_ADDRESS * 3)).toBe(HALL_READS_PER_ADDRESS * 3);
  now += MINUTE_MS;
  expect(limits.read("a")).toBe(0);
});

test("the two paths answer the tunnel and this machine, never another device, and neither is given the large body parser", () => {
  const relayed = { "cf-ray": "8f1c2d3e4f5a6b7c-DFW", "cf-connecting-ip": "203.0.113.7" };
  for (const path of ["/api/account/fights", "/api/account/fights/", "/API/Account/Fights", "/api/heroes", "/api/heroes/", "/Api/Heroes"]) {
    expect(mayAnswer(path, "127.0.0.1"), path).toBe(true);
    expect(mayAnswer(path, "127.0.0.1", relayed), path).toBe(true);
    expect(mayAnswer(path, "::1", relayed), path).toBe(true);
    // Another device speaks plain HTTP to this server: a session token must not cross the Wi-Fi that way, whatever headers it sends.
    expect(mayAnswer(path, LAN), path).toBe(false);
    expect(mayAnswer(path, LAN, relayed), path).toBe(false);
    expect(mayAnswer(path, undefined, relayed), path).toBe(false);
    const lower = path.toLowerCase();
    expect([isOpenPath(lower), isTunnelPath(lower), readsOwnBody(lower)], path).toEqual([false, true, true]);
  }
  expect([isAccountPath("/api/account/fights"), isHeroesPath("/api/account/fights"), isAccountPath("/api/heroes"), isHeroesPath("/api/heroes")]).toEqual([true, false, false, true]);
  for (const path of ["/api/heroes/x", "/api/heroes//", "/api/heroesx", "/api/hero", "/api/account/fights/x", "/api/account/fight", "/api/account/fightsx", "/api/fights", "/api/level/heroes"]) {
    expect([isAccountPath(path), isHeroesPath(path)], path).toEqual([false, false]);
    expect(mayAnswer(path, LAN), path).toBe(false);
    expect(mayAnswer(path, "127.0.0.1", relayed), path).toBe(false);
  }
});

test("with no database both routes answer 503 at once, for this machine and through the tunnel, and nothing is logged", async () => {
  const log = captureLog();
  const call = await serve();
  for (const headers of [{}, TUNNEL]) {
    for (const ask of [
      () => call("POST", "/api/account/fights", { json: { fight: FIGHT }, token: makeToken(), headers }),
      () => call("POST", "/api/account/fights", { headers }),
      () => call("GET", "/api/heroes", { headers }),
      () => call("GET", "/api/heroes", { token: makeToken(), headers }),
    ]) {
      const answer = await ask();
      expect([answer.status, JSON.parse(answer.text), answer.cache]).toEqual([503, { error: "unavailable" }, "no-store"]);
    }
  }
  expect(log.lines).toEqual([]);
});

// From here on the routes run over objects that give fixed answers. They store nothing.
const KNOWN_TOKEN = makeToken();
const OTHER_TOKEN = makeToken();
const ACCOUNT_ID = "0d15ea5e-0000-4000-8000-000000000000";
const OTHER_ID = "0d15ea5e-0000-4000-8000-000000000001";
const HALL: Hall = {
  at: "2026-11-15T06:00:00.000Z",
  tonight: [
    { accountId: OTHER_ID, hero: "Penelope", score: 6840, stop: "scylla", style: "jiu_jitsu", god: "athena" },
    { accountId: ACCOUNT_ID, hero: "Odysseus", score: 4105, stop: "polyphemus", style: "boxer", god: null },
  ],
  allTime: [{ accountId: ACCOUNT_ID, hero: "Odysseus", score: 8150, stop: "suitors", style: "boxer", god: "zeus" }],
  lastHour: 3,
  fightsEver: 41,
  stops: [{ stop: "polyphemus", fights: 9, wins: 5 }],
  activity: { minutes: ACTIVITY_MINUTES, until: "2026-11-15T06:10:00.000Z", fights: Array.from({ length: ACTIVITY_BUCKETS }, (_unused, index) => index % 3) },
};

interface StandIns {
  readonly accounts: Accounts;
  readonly heroes: Heroes;
  /** Every fight handed to the hall, with the account it was for. */
  readonly written: { accountId: string; fight: unknown }[];
  /** Tokens the stand-in for the database was asked about. */
  readonly lookups: string[];
  halls: number;
  /** What the next `record` does: write it, find the account gone, or fail like a database that is down. */
  next: "write" | "gone" | "down";
}

function standIns(): StandIns {
  const never = (): never => { throw new Error("not part of these tests"); };
  const known: Readonly<Record<string, string>> = { [KNOWN_TOKEN]: ACCOUNT_ID, [OTHER_TOKEN]: OTHER_ID };
  const made: StandIns = {
    written: [], lookups: [], halls: 0, next: "write",
    accounts: {
      available: () => Promise.resolve(true),
      signUp: never, signIn: never, signOut: never, readSave: never, writeSave: never,
      accountOf: (token) => {
        made.lookups.push(token);
        return Promise.resolve(known[token] ?? null);
      },
      remembered: () => null,
      close: () => Promise.resolve(),
    },
    heroes: {
      record: (accountId, fight) => {
        if (made.next === "down") return Promise.reject(new Unavailable());
        if (made.next === "gone") return Promise.resolve(false);
        made.written.push({ accountId, fight });
        return Promise.resolve(true);
      },
      hall: () => {
        made.halls += 1;
        return Promise.resolve(HALL);
      },
    },
  };
  return made;
}

test("a fight is written for the account of the session it came with, and for nobody the body names", async () => {
  const stand = standIns();
  const call = await serve({ accounts: stand.accounts, heroes: stand.heroes });
  const made = await call("POST", "/api/account/fights", { token: KNOWN_TOKEN, json: { fight: { ...FIGHT, accountId: OTHER_ID, account_id: OTHER_ID }, accountId: OTHER_ID } });
  expect([made.status, JSON.parse(made.text), made.cache]).toEqual([201, { recorded: true }, "no-store"]);
  expect(stand.written).toEqual([{ accountId: ACCOUNT_ID, fight: FIGHT }]);
  // The other player's session writes the other player's fight.
  expect((await call("POST", "/api/account/fights", { token: OTHER_TOKEN, json: { fight: FIGHT } })).status).toBe(201);
  expect(stand.written.map((row) => row.accountId)).toEqual([ACCOUNT_ID, OTHER_ID]);
});

test("no session, an unknown one and a malformed one are 401 before the body is read, and nothing is written", async () => {
  const stand = standIns();
  const call = await serve({ accounts: stand.accounts, heroes: stand.heroes });
  const refused = [
    await call("POST", "/api/account/fights", { json: { fight: FIGHT } }),
    await call("POST", "/api/account/fights", { json: { fight: FIGHT }, token: makeToken() }),
    await call("POST", "/api/account/fights", { json: { fight: FIGHT }, headers: { Authorization: "Bearer short" } }),
    await call("POST", "/api/account/fights", { json: { fight: FIGHT }, headers: { Authorization: `Basic ${KNOWN_TOKEN}` } }),
    // Not JSON at all: with no session it is still 401, so the body was never looked at.
    await call("POST", "/api/account/fights", { text: "{".repeat(500) }),
  ];
  for (const answer of refused) expect([answer.status, JSON.parse(answer.text)]).toEqual([401, { error: "signed_out" }]);
  expect(stand.written).toEqual([]);
  // Only the one well-formed token was worth asking the database about.
  expect(stand.lookups).toHaveLength(1);
});

test("a body that is not a fight is 400, one that is too long is 413, and neither is written", async () => {
  const stand = standIns();
  const call = await serve({ accounts: stand.accounts, heroes: stand.heroes });
  const notOne = await call("POST", "/api/account/fights", { token: KNOWN_TOKEN, json: { fight: { ...FIGHT, score: SCORE_MAX + 1 } } });
  expect([notOne.status, JSON.parse(notOne.text)]).toEqual([400, { error: "invalid", field: "fight" }]);
  const notJson = await call("POST", "/api/account/fights", { token: KNOWN_TOKEN, text: "{" });
  expect([notJson.status, JSON.parse(notJson.text)]).toEqual([400, { error: "invalid", field: "body" }]);
  const long = await call("POST", "/api/account/fights", { token: KNOWN_TOKEN, json: { fight: FIGHT, padding: "x".repeat(FIGHT_BODY_BYTES) } });
  expect([long.status, JSON.parse(long.text)]).toEqual([413, { error: "too_big" }]);
  expect(stand.written).toEqual([]);
});

test("the fifth fight of one account in a minute is 429, and the other account still writes", async () => {
  const stand = standIns();
  const call = await serve({ accounts: stand.accounts, heroes: stand.heroes });
  for (let index = 0; index < FIGHTS_PER_ACCOUNT; index += 1) expect((await call("POST", "/api/account/fights", { token: KNOWN_TOKEN, json: { fight: FIGHT } })).status).toBe(201);
  const fifth = await call("POST", "/api/account/fights", { token: KNOWN_TOKEN, json: { fight: FIGHT } });
  expect([fifth.status, JSON.parse(fifth.text), Number(fifth.retry) > 0]).toEqual([429, { error: "slow_down" }, true]);
  expect((await call("POST", "/api/account/fights", { token: OTHER_TOKEN, json: { fight: FIGHT } })).status).toBe(201);
  expect(stand.written).toHaveLength(FIGHTS_PER_ACCOUNT + 1);
});

test("a database that is down is 503 with nothing of the failure in the answer, and an account that is gone is 401", async () => {
  const stand = standIns();
  const log = captureLog();
  const call = await serve({ accounts: stand.accounts, heroes: stand.heroes });
  stand.next = "down";
  const down = await call("POST", "/api/account/fights", { token: KNOWN_TOKEN, json: { fight: FIGHT } });
  expect([down.status, JSON.parse(down.text)]).toEqual([503, { error: "unavailable" }]);
  stand.next = "gone";
  const gone = await call("POST", "/api/account/fights", { token: KNOWN_TOKEN, json: { fight: FIGHT } });
  expect([gone.status, JSON.parse(gone.text)]).toEqual([401, { error: "signed_out" }]);
  expect(stand.written).toEqual([]);
  expect(log.lines).toEqual([]);
});

test("the hall is given to anybody, with hero names and scores and no id of any account; the reader's own row is marked", async () => {
  const stand = standIns();
  const call = await serve({ accounts: stand.accounts, heroes: stand.heroes });
  const open = await call("GET", "/api/heroes");
  expect([open.status, open.cache]).toEqual([200, "no-store"]);
  expect(JSON.parse(open.text)).toEqual({
    at: HALL.at,
    tonight: [
      { hero: "Penelope", score: 6840, stop: "scylla", style: "jiu_jitsu", god: "athena", you: false },
      { hero: "Odysseus", score: 4105, stop: "polyphemus", style: "boxer", god: null, you: false },
    ],
    allTime: [{ hero: "Odysseus", score: 8150, stop: "suitors", style: "boxer", god: "zeus", you: false }],
    lastHour: 3, fightsEver: 41, stops: HALL.stops, activity: HALL.activity,
  });
  for (const text of [open.text, (await call("GET", "/api/heroes", { token: KNOWN_TOKEN })).text]) {
    expect(text).not.toContain(ACCOUNT_ID);
    expect(text).not.toContain(OTHER_ID);
    expect(text).not.toContain("accountId");
  }
  const marks = (text: string): boolean[] => {
    const hall = JSON.parse(text) as { tonight: { you: boolean }[]; allTime: { you: boolean }[] };
    return [...hall.tonight, ...hall.allTime].map((row) => row.you);
  };
  expect(marks((await call("GET", "/api/heroes", { token: KNOWN_TOKEN })).text)).toEqual([false, true, true]);
  expect(marks((await call("GET", "/api/heroes", { token: OTHER_TOKEN })).text)).toEqual([true, false, false]);
  // A session nobody has, or a header that is not one, reads the hall like anybody: no mark, no error.
  for (const headers of [{ Authorization: `Bearer ${makeToken()}` }, { Authorization: "Bearer x" }, { Authorization: "nonsense" }]) {
    const answer = await call("GET", "/api/heroes", { headers });
    expect([answer.status, marks(answer.text)]).toEqual([200, [false, false, false]]);
  }
});

test("through the tunnel the hall still answers when an address has sent too many unknown sessions, and 301 reads in a minute are too many", async () => {
  const stand = standIns();
  const call = await serve({ accounts: stand.accounts, heroes: stand.heroes });
  for (let index = 0; index < WRONG_TOKENS_PER_ADDRESS + 5; index += 1) {
    expect((await call("GET", "/api/heroes", { token: makeToken(), headers: TUNNEL })).status).toBe(200);
  }
  // Past the count the database is not asked about one more unknown session; the hall is given without a mark.
  expect(stand.lookups).toHaveLength(WRONG_TOKENS_PER_ADDRESS);
  let through = WRONG_TOKENS_PER_ADDRESS + 5;
  for (; through < HALL_READS_PER_ADDRESS + 10; through += 1) {
    const answer = await call("GET", "/api/heroes", { headers: TUNNEL });
    if (answer.status !== 200) {
      expect([answer.status, JSON.parse(answer.text), Number(answer.retry) > 0]).toEqual([429, { error: "slow_down" }, true]);
      break;
    }
  }
  expect(through).toBe(HALL_READS_PER_ADDRESS);
  // Another visitor, and the laptop itself, are not held by it.
  expect((await call("GET", "/api/heroes", { headers: { ...TUNNEL, "Cf-Connecting-Ip": "198.51.100.9", "X-Forwarded-For": "198.51.100.9" } })).status).toBe(200);
  expect((await call("GET", "/api/heroes")).status).toBe(200);
});

test("an address has one budget of unknown sessions for the account routes and the hall together, not one each", async () => {
  const stand = standIns();
  const call = await serve({ accounts: stand.accounts, heroes: stand.heroes });
  const half = WRONG_TOKENS_PER_ADDRESS / 2;
  for (let index = 0; index < half; index += 1) {
    expect((await call("GET", "/api/account/save", { token: makeToken(), headers: TUNNEL })).status).toBe(401);
    expect((await call("GET", "/api/heroes", { token: makeToken(), headers: TUNNEL })).status).toBe(200);
  }
  expect(stand.lookups).toHaveLength(WRONG_TOKENS_PER_ADDRESS);
  // The budget is used up on both sides: neither route asks the database about one more.
  expect((await call("GET", "/api/account/save", { token: makeToken(), headers: TUNNEL })).status).toBe(429);
  expect((await call("GET", "/api/heroes", { token: makeToken(), headers: TUNNEL })).status).toBe(200);
  expect((await call("POST", "/api/account/fights", { token: makeToken(), headers: TUNNEL, json: { fight: FIGHT } })).status).toBe(429);
  expect(stand.lookups).toHaveLength(WRONG_TOKENS_PER_ADDRESS);
});

// From here on the hall's own code (../lib/heroes) runs over a made-up statement function. It is not a database.
interface Door {
  readonly statement: Statement;
  /** Every statement asked for, as its text and its values. */
  readonly asked: { text: string; params: readonly unknown[] }[];
}

const HALL_ROW = { tonight: "[]", ever: "[]", stops: "[]", activity: JSON.stringify(Array.from({ length: ACTIVITY_BUCKETS }, () => 0)), last_hour: 0, fights_ever: "0" };

/**
 * Answers the question about the extension with `timescale`, the question about the columnstore setting with
 * `grouped` (true: an older table, still grouped by account), a reading of the hall with `hall`, and everything else with one row.
 */
function door(options: { timescale?: boolean; grouped?: boolean; hall?: unknown; fail?: (text: string) => boolean } = {}): Door {
  const asked: Door["asked"] = [];
  return {
    asked,
    statement: (text, params) => {
      asked.push({ text, params });
      if (options.fail?.(text)) return Promise.reject(new Unavailable());
      if (text.includes("pg_extension")) return Promise.resolve(options.timescale === false ? [] : [{ n: 1 }]);
      if (text.includes("hypertable_columnstore_settings")) return Promise.resolve(options.grouped === true ? [{ n: 1 }] : []);
      if (text.includes("time_bucket_gapfill")) return Promise.resolve(["hall" in options ? options.hall : HALL_ROW]);
      return Promise.resolve([{ n: 1 }]);
    },
  };
}

test("the table names take the accounts' prefix, and a prefix that is not a name is refused before it reaches a statement", () => {
  expect(heroTables()).toEqual({ accounts: "accounts", fights: "fights", hourly: "fights_hourly" });
  expect(heroTables("t1_")).toEqual({ accounts: "t1_accounts", fights: "t1_fights", hourly: "t1_fights_hourly" });
  for (const prefix of ["1x", "x-y", "x;drop", "X", "x y", "x'"]) expect(() => heroTables(prefix), prefix).toThrow();
  const schema = heroSchemaSql("t1_");
  expect(schema).toHaveLength(3);
  expect(schema[0]?.text).toMatch(/create table if not exists t1_fights[\s\S]*references t1_accounts \(id\) on delete cascade[\s\S]*tsdb\.hypertable/);
  // Old fights are ordered by time in the columnstore and not grouped by account, which was measured to make them larger.
  expect(schema[0]?.text).toContain("tsdb.segmentby = '', tsdb.orderby = 'at desc'");
  expect(schema.map(({ text }) => text).join(" ")).not.toContain("segmentby = 'account_id'");
  expect(schema[1]?.text).toMatch(/create materialized view if not exists t1_fights_hourly[\s\S]*timescaledb\.continuous[\s\S]*time_bucket\(interval '1 hour', at\)[\s\S]*from t1_fights/);
  expect(schema[2]).toMatchObject({ params: ["t1_fights_hourly"] });
  expect(schema[2]?.text).toMatch(/add_continuous_aggregate_policy\(\$1::regclass[\s\S]*if_not_exists => true/);
});

test("the tables are made once, before the first fight, and every value goes apart from the statement text", async () => {
  const made = door();
  const now = Date.parse("2026-11-15T06:23:45.678Z");
  const heroes = createHeroes(made.statement, { now: () => now });
  const nasty = { stop: "polyphemus", won: true, score: 1234, style: "boxer", god: null, seconds: 61.5, bestCombo: null, hero: "Rob'); drop table fights; --" };
  expect(await heroes.record(ACCOUNT_ID, nasty)).toBe(true);
  expect(await heroes.record(ACCOUNT_ID, nasty)).toBe(true);
  expect(made.asked.map((ask) => ask.text.trim().split(/\s+/).slice(0, 3).join(" "))).toEqual([
    "select 1 as", "create table if", "create materialized view", "select add_continuous_aggregate_policy($1::regclass, start_offset", "select 1 as", "insert into fights", "insert into fights",
  ]);
  // The fifth is the question about the columnstore setting. A table made now is not grouped, so nothing is changed.
  expect(made.asked[4]).toMatchObject({ params: ["fights"] });
  expect(made.asked[4]?.text).toContain("hypertable_columnstore_settings");
  const insert = made.asked[5];
  expect(insert?.params).toEqual(["2026-11-15T06:23:45.678Z", ACCOUNT_ID, nasty.hero, "polyphemus", true, 1234, "boxer", null, 61.5, null]);
  for (const ask of made.asked) for (const value of [nasty.hero, ACCOUNT_ID, "polyphemus", "1234"]) expect(ask.text).not.toContain(value);
  // The row is made from the account's own row, so an id that is no account writes nothing.
  expect(insert?.text).toMatch(/from accounts a where a\.id = \$2::uuid/);
});

test("a fights table from before, still grouped by account in the columnstore, is set right once at start-up, and a failure of that is no reason to have no hall", async () => {
  const { check, set } = columnstoreSql("t1_");
  expect(check).toMatchObject({ params: ["t1_fights"] });
  expect(check.text).toMatch(/hypertable_columnstore_settings[\s\S]*hypertable = \$1::regclass[\s\S]*segmentby/);
  expect(set).toEqual({ text: "alter table t1_fights set (timescaledb.segmentby = '', timescaledb.orderby = 'at desc')", params: [] });
  const alters = (made: Door): number => made.asked.filter((ask) => ask.text.startsWith("alter table")).length;

  const log = captureLog();
  const old = door({ grouped: true });
  const heroes = createHeroes(old.statement);
  expect((await heroes.hall()).tonight).toEqual([]);
  expect(await heroes.record(ACCOUNT_ID, { ...FIGHT, hero: null })).toBe(true);
  expect(old.asked.filter((ask) => ask.text.startsWith("alter table")).map((ask) => ask.text)).toEqual(["alter table fights set (timescaledb.segmentby = '', timescaledb.orderby = 'at desc')"]);
  expect(log.lines.filter((line) => line.includes("heroes_columnstore_set"))).toHaveLength(1);

  // A table made now: asked, and left alone.
  const fresh = door();
  await createHeroes(fresh.statement).hall();
  expect(alters(fresh)).toBe(0);

  // The question fails, or the change does: one line in the log, and the hall is there all the same.
  for (const failing of ["hypertable_columnstore_settings", "alter table"]) {
    const broken = door({ grouped: true, fail: (text) => text.includes(failing) });
    expect((await createHeroes(broken.statement).hall()).tonight, failing).toEqual([]);
  }
  expect(log.lines.filter((line) => line.includes("heroes_columnstore_not_set"))).toHaveLength(2);
});

test("on a Postgres without TimescaleDB there is no hall: one log line, no statement tried, and it is not asked again", async () => {
  const log = captureLog();
  const made = door({ timescale: false });
  let now = 0;
  const heroes = createHeroes(made.statement, { now: () => now });
  await expect(heroes.hall()).rejects.toBeInstanceOf(Unavailable);
  await expect(heroes.record(ACCOUNT_ID, { ...FIGHT, hero: null })).rejects.toBeInstanceOf(Unavailable);
  now += 10 * RETRY_MS;
  await expect(heroes.hall()).rejects.toBeInstanceOf(Unavailable);
  expect(made.asked).toHaveLength(1);
  expect(log.lines.filter((line) => line.includes("heroes_unavailable"))).toHaveLength(1);
});

test("tables that could not be made are tried again after fifteen seconds and not before", async () => {
  let broken = true;
  const made = door({ fail: (text) => broken && text.includes("create table") });
  let now = 1_000;
  const heroes = createHeroes(made.statement, { now: () => now });
  await expect(heroes.hall()).rejects.toBeInstanceOf(Unavailable);
  expect(made.asked).toHaveLength(2);
  now += RETRY_MS - 1;
  await expect(heroes.hall()).rejects.toBeInstanceOf(Unavailable);
  await expect(heroes.record(ACCOUNT_ID, { ...FIGHT, hero: null })).rejects.toBeInstanceOf(Unavailable);
  expect(made.asked).toHaveLength(2);
  now += 1;
  broken = false;
  expect((await heroes.hall()).tonight).toEqual([]);
  expect(await heroes.record(ACCOUNT_ID, { ...FIGHT, hero: null })).toBe(true);
});

test("a hall whose statement fails never turns sign-in off, and the database is asked about it once in five seconds", async () => {
  captureLog();
  // The real accounts and the real hall over a stand-in database in which only the hall's reading fails. Not a database.
  let now = 1_800_000_000_000;
  let broken = true;
  const asked = { hall: 0, sessions: 0 };
  const db: Db = {
    query: (text) => {
      if (text.includes("time_bucket_gapfill")) {
        asked.hall += 1;
        return broken ? Promise.reject(Object.assign(new Error("column f.made_up does not exist"), { code: "42703" })) : Promise.resolve([HALL_ROW] as never[]);
      }
      if (text.includes("pg_extension")) return Promise.resolve([{ n: 1 }] as never[]);
      if (text.includes("select account_id::text as id from sessions")) asked.sessions += 1;
      return Promise.resolve([]);
    },
    close: () => Promise.resolve(),
  };
  const accounts = createAccounts(() => Promise.resolve(db), { now: () => now });
  const statement = statementsOf(accounts);
  if (statement === null) throw new Error("accounts made by createAccounts have a door");
  const heroes = createHeroes(statement, { now: () => now });
  expect(await accounts.available()).toBe(true);

  // Far more failures in a row than turn the accounts off when they are the accounts' own.
  for (let index = 0; index < FAILURES_TO_GIVE_UP * 4; index += 1) await expect(heroes.hall()).rejects.toBeInstanceOf(Unavailable);
  // The first one asked; the rest were told what it found.
  expect(asked.hall).toBe(1);
  expect(await accounts.available()).toBe(true);
  expect(await accounts.accountOf(makeToken())).toBeNull();
  expect(asked.sessions).toBe(1);

  // Somebody reads the hall every second for a minute. Sign-in is never off, and the hall is tried once in five seconds.
  let off = 0;
  for (let second = 0; second < 60; second += 1) {
    now += 1_000;
    await heroes.hall().catch(() => null);
    if (!(await accounts.available())) off += 1;
    await accounts.accountOf(makeToken());
  }
  expect(off).toBe(0);
  expect(asked.sessions).toBe(61);
  expect(asked.hall).toBe(1 + 60_000 / HALL_CACHE_MS);

  // Mended, it is back with the next try, and a reading that works is shared as before.
  broken = false;
  now += HALL_CACHE_MS;
  expect((await heroes.hall()).tonight).toEqual([]);
  await heroes.hall();
  expect(asked.hall).toBe(2 + 60_000 / HALL_CACHE_MS);
  await accounts.close();
});

test("everybody who asks within five seconds shares one reading of the hall, and the next reading has the clock's times in it", async () => {
  const made = door();
  let now = Date.parse("2026-11-15T06:23:45.678Z");
  const heroes = createHeroes(made.statement, { now: () => now });
  const readings = (): number => made.asked.filter((ask) => ask.text.includes("time_bucket_gapfill")).length;
  const together = await Promise.all(Array.from({ length: 40 }, () => heroes.hall()));
  expect(readings()).toBe(1);
  expect(new Set(together).size).toBe(1);
  now += HALL_CACHE_MS - 1;
  await heroes.hall();
  expect(readings()).toBe(1);
  now += 1;
  const next = await heroes.hall();
  expect(readings()).toBe(2);
  // Now, a day before, an hour before, and 36 buckets of ten minutes that end on the ten minutes after now.
  expect(made.asked.at(-1)?.params).toEqual([
    "2026-11-15T06:23:50.678Z", "2026-11-14T06:23:50.678Z", "2026-11-15T05:23:50.678Z", "2026-11-15T00:30:00.000Z", "2026-11-15T06:30:00.000Z",
  ]);
  expect(next).toMatchObject({ at: "2026-11-15T06:23:50.678Z", lastHour: 0, fightsEver: 0, activity: { minutes: 10, until: "2026-11-15T06:30:00.000Z" } });
  expect(next.activity.fights).toHaveLength(ACTIVITY_BUCKETS);
});

test("what the database gives back is checked: a list that is not one, too many rows or a row with a field missing is no hall", async () => {
  const row = { account_id: ACCOUNT_ID, hero: "Odysseus", best: 4105, stop: "polyphemus", style: "boxer", god: null };
  const good = await createHeroes(door({ hall: { ...HALL_ROW, tonight: JSON.stringify([row]), ever: JSON.stringify([{ ...row, best: "8150" }]), stops: JSON.stringify([{ stop: "circe", fights: "4", wins: 1 }]), last_hour: "7", fights_ever: 41 } }).statement).hall();
  expect(good).toMatchObject({
    tonight: [{ accountId: ACCOUNT_ID, hero: "Odysseus", score: 4105, stop: "polyphemus", style: "boxer", god: null }],
    allTime: [{ score: 8150 }], stops: [{ stop: "circe", fights: 4, wins: 1 }], lastHour: 7, fightsEver: 41,
  });
  // A line with a bucket missing is padded on the old side, never shifted.
  const short = await createHeroes(door({ hall: { ...HALL_ROW, activity: "[2,1]" } }).statement).hall();
  expect(short.activity.fights).toEqual([...Array.from({ length: ACTIVITY_BUCKETS - 2 }, () => 0), 2, 1]);
  const bad: readonly Record<string, unknown>[] = [
    { tonight: "not json" }, { tonight: "{}" }, { tonight: JSON.stringify([{ ...row, hero: "" }]) }, { tonight: JSON.stringify([{ ...row, best: -5 }]) },
    { tonight: JSON.stringify([{ hero: "Odysseus", best: 1, stop: "a", style: "b", god: null }]) },
    { ever: JSON.stringify(Array.from({ length: BOARD_SIZE + 1 }, () => row)) }, { stops: JSON.stringify([{ stop: "circe" }]) },
    { activity: JSON.stringify(Array.from({ length: ACTIVITY_BUCKETS + 1 }, () => 0)) }, { activity: "[1.5]" }, { last_hour: "many" }, { fights_ever: -1 },
  ];
  const log = captureLog();
  for (const change of bad) await expect(createHeroes(door({ hall: { ...HALL_ROW, ...change } }).statement).hall(), JSON.stringify(change).slice(0, 60)).rejects.toBeInstanceOf(Unavailable);
  await expect(createHeroes(door({ hall: null }).statement).hall()).rejects.toBeInstanceOf(Unavailable);
  expect(log.lines.every((line) => line.includes("heroes_bad_row") || line.includes("heroes_ready"))).toBe(true);
});
