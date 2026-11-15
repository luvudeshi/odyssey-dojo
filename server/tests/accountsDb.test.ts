// Accounts against a real Postgres, through the real app: sign up, sign in, save, read back, sign out, and every refusal.
//
// These need a database and the driver, so they run only when TEST_DATABASE_URL names a Postgres that tests may write to
// (a Tiger Data service, or any other Postgres). Without it they are SKIPPED, not faked: nothing here stands in for the
// database. Each run makes its own three tables under a random prefix and drops them at the end, so it can share a
// database with the real tables and with another run.
//
//   TEST_DATABASE_URL='postgres://...' npx vitest run server/tests/accountsDb.test.ts
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { KNOWN_SESSION_MS, SIGNINS_PER_NAME_AND_ADDRESS } from "../lib/accountLimits";
import { SAVE_BODY_BYTES } from "../lib/accountRules";
import { MAX_SESSIONS, SESSION_MS, createAccounts, tables, tokenHash, verifyPassword } from "../lib/accounts";
import { APPLICATION, QUERY_MS, STATEMENT_MS, failureCode, openDb, tlsFor } from "../lib/db";
import type { Db } from "../lib/db";
import { SIGNUPS_CLOSED_TEXT } from "../routes/account";

const url = (process.env.TEST_DATABASE_URL ?? "").trim();
const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const PASSWORD = "nine oars and a sail";
const OTHER_PASSWORD = "the wine-dark sea";

interface Answer {
  readonly status: number;
  readonly body: unknown;
}
interface Session {
  readonly token: string;
  readonly name: string;
}

function save(name: string, wins: number): Record<string, unknown> {
  return {
    version: 1,
    profile: { name, cleared: ["polyphemus"], moves: { jab: 4, cross: 1 }, bestScore: 1200 + wins, fights: wins + 1, wins, blocks: 3, bestCombo: 6, styles: ["boxer"], rooms: 0 },
    settings: { quality: "low", musicVolume: 0.5, mirror: false },
    character: "athena",
    achievements: ["first_win"],
  };
}

describe.skipIf(url === "")("accounts on a real Postgres", () => {
  // A letter first, so it is a table name; random, so two runs never meet.
  const prefix = `t${randomBytes(5).toString("hex")}_`;
  const t = tables(prefix);
  let db: Db | null = null;
  let server: Server | null = null;
  let port = 0;
  let clock = Date.now();
  let serial = 0;
  /** A hero name no other test in this run has used. */
  const hero = (): string => { serial += 1; return `Hero ${String(serial)} ${prefix.slice(1, 7)}`; };

  /** One statement straight to the database, to see what the routes left there. */
  const sql = <T>(text: string, params: readonly unknown[]): Promise<T[]> => {
    if (db === null) throw new Error("the database is not open");
    return db.query<T>(text, params);
  };

  const call = async (method: string, path: string, options: { json?: unknown; token?: string; headers?: Record<string, string>; text?: string } = {}): Promise<Answer> => {
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
    const text = await response.text();
    return { status: response.status, body: text === "" ? null : JSON.parse(text) as unknown };
  };
  const signUp = async (name: string, password = PASSWORD): Promise<Session> => {
    const answer = await call("POST", "/api/account/signup", { json: { name, password } });
    expect(answer.status).toBe(201);
    return answer.body as Session;
  };
  const signIn = async (name: string, password = PASSWORD): Promise<Session> => {
    const answer = await call("POST", "/api/account/signin", { json: { name, password } });
    expect(answer.status).toBe(200);
    return answer.body as Session;
  };

  beforeAll(async () => {
    const opened = await openDb(url);
    if (opened === null) throw new Error("TEST_DATABASE_URL is set but the database did not open: is the pg package installed, and does the database answer?");
    db = opened;
    const accounts = createAccounts(() => Promise.resolve(opened), { prefix, now: () => clock });
    const app = await createApp({ config, ai: NO_AI, accounts });
    const listening = app.listen(0, "127.0.0.1");
    await once(listening, "listening");
    server = listening;
    port = (listening.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server?.close();
    server?.closeAllConnections();
    if (db === null) return;
    // In this order: the two that point at accounts go first.
    for (const table of [t.saves, t.sessions, t.accounts]) await db.query(`drop table if exists ${table}`, []);
    await db.close();
  });

  test("the tables are made at first use, and making them again changes nothing", async () => {
    expect(await call("GET", "/api/account/status")).toEqual({ status: 200, body: { available: true } });
    const again = createAccounts(() => Promise.resolve(db), { prefix });
    expect(await again.available()).toBe(true);
    const rows = await sql<{ table_name: string }>(
      "select table_name::text as table_name from information_schema.tables where table_name in ($1::text, $2::text, $3::text) order by table_name",
      [t.accounts, t.saves, t.sessions],
    );
    expect(rows.map((row) => row.table_name)).toEqual([t.accounts, t.saves, t.sessions]);
  });

  test("the connection is encrypted when the address asks for it, carries the game's name, and a slow statement is stopped in time", async () => {
    const [seen] = await sql<{ ssl: boolean; name: string; limit: string }>(
      "select (select ssl from pg_stat_ssl where pid = pg_backend_pid()) as ssl, current_setting('application_name') as name, current_setting('statement_timeout') as limit", [],
    );
    expect(seen).toEqual({ ssl: tlsFor(url) !== false, name: APPLICATION, limit: `${String(STATEMENT_MS / 1000)}s` });
    // The database stops it itself (57014), before this server's own limit, and the connection is still good afterwards.
    const started = performance.now();
    const stopped = await sql("select pg_sleep(30)", []).then(() => "it answered", failureCode);
    expect(stopped).toBe("57014");
    expect(performance.now() - started).toBeLessThan(QUERY_MS);
    expect(await sql("select 1 as one", [])).toEqual([{ one: 1 }]);
  });

  test("sign up, save, sign in from a second browser, and the save is there", async () => {
    const name = hero();
    const first = await signUp(` ${name} `);
    expect(first.name).toBe(name);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // A new account has no save yet.
    expect(await call("GET", "/api/account/save", { token: first.token })).toEqual({ status: 200, body: { save: null, updatedAt: null } });

    const written = await call("PUT", "/api/account/save", { token: first.token, json: { save: save(name, 3) } });
    expect(written.status).toBe(200);
    const { updatedAt } = written.body as { updatedAt: string };
    expect(new Date(updatedAt).toISOString()).toBe(updatedAt);

    // Another browser: another session of the same account, signed in with the name in other letters.
    const second = await signIn(name.toUpperCase());
    expect(second.name).toBe(name);
    expect(second.token).not.toBe(first.token);
    expect(await call("GET", "/api/account/save", { token: second.token })).toEqual({ status: 200, body: { save: save(name, 3), updatedAt } });

    // The second browser wins a fight; the first one sees it.
    clock += 1_000;
    const later = await call("PUT", "/api/account/save", { token: second.token, json: { save: save(name, 4) } });
    const read = await call("GET", "/api/account/save", { token: first.token });
    expect(read.body).toEqual({ save: save(name, 4), updatedAt: (later.body as { updatedAt: string }).updatedAt });
    expect((later.body as { updatedAt: string }).updatedAt > updatedAt).toBe(true);
  });

  test("the database holds a salted hash and the hash of the token, never the password or the token", async () => {
    const name = hero();
    const { token } = await signUp(name);
    const [account] = await sql<{ pass_hash: string; salt: string; name_key: string }>(
      `select encode(pass_hash, 'hex') as pass_hash, encode(salt, 'hex') as salt, name_key from ${t.accounts} where name = $1::text`, [name],
    );
    if (account === undefined) throw new Error("no account row");
    expect(account.name_key).toBe(name.toLowerCase());
    expect(account.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(account.pass_hash).toMatch(/^[0-9a-f]{128}$/);
    expect(account.pass_hash).not.toContain(Buffer.from(PASSWORD).toString("hex"));
    expect(await verifyPassword(PASSWORD, Buffer.from(account.salt, "hex"), Buffer.from(account.pass_hash, "hex"))).toBe(true);
    // Two accounts with the same password do not have the same hash.
    await signUp(hero());
    const hashes = await sql<{ pass_hash: string }>(`select encode(pass_hash, 'hex') as pass_hash from ${t.accounts}`, []);
    expect(new Set(hashes.map((row) => row.pass_hash)).size).toBe(hashes.length);

    const sessions = await sql<{ token_hash: string }>(`select encode(token_hash, 'hex') as token_hash from ${t.sessions}`, []);
    expect(sessions.map((row) => row.token_hash)).toContain(tokenHash(token));
    expect(JSON.stringify(sessions)).not.toContain(token);
    expect(JSON.stringify(sessions)).not.toContain(Buffer.from(token).toString("hex"));
  });

  test("a name is taken without regard to case or to the spaces around it, and a taken name makes no second account", async () => {
    const name = hero();
    await signUp(name);
    for (const again of [name, name.toUpperCase(), name.toLowerCase(), `  ${name}  `, name.replace(/ /g, "  ")]) {
      expect(await call("POST", "/api/account/signup", { json: { name: again, password: OTHER_PASSWORD } }), again).toEqual({ status: 409, body: { error: "name_taken" } });
    }
    // The first owner's password still works and the other one never did.
    expect((await call("POST", "/api/account/signin", { json: { name, password: OTHER_PASSWORD } })).status).toBe(401);
    await signIn(name);
    const rows = await sql(`select id from ${t.accounts} where name_key = $1::text`, [name.toLowerCase()]);
    expect(rows).toHaveLength(1);
  });

  test("a sign-up that breaks a rule is refused with the field, and makes nothing", async () => {
    const before = await sql(`select id from ${t.accounts}`, []);
    const bad: readonly (readonly [unknown, string])[] = [
      [{ name: "ab", password: PASSWORD }, "name"], [{ name: "   ", password: PASSWORD }, "name"], [{ password: PASSWORD }, "name"],
      [{ name: hero(), password: "short" }, "password"], [{ name: hero(), password: "x".repeat(201) }, "password"], [{ name: hero() }, "password"],
      [[], "body"], ["a string", "body"],
    ];
    for (const [json, field] of bad) {
      expect(await call("POST", "/api/account/signup", { json }), JSON.stringify(json)).toEqual({ status: 400, body: { error: "invalid", field } });
    }
    expect(await call("POST", "/api/account/signup")).toEqual({ status: 400, body: { error: "invalid", field: "body" } });
    expect(await call("POST", "/api/account/signup", { text: "{not json" })).toEqual({ status: 400, body: { error: "invalid", field: "body" } });
    expect(await call("POST", "/api/account/signup", { text: JSON.stringify({ name: hero(), password: "x".repeat(4000) }) })).toEqual({ status: 400, body: { error: "invalid", field: "body" } });
    expect(await sql(`select id from ${t.accounts}`, [])).toHaveLength(before.length);
  });

  test("a wrong password and a name nobody has get the same answer, after the same work", async () => {
    const name = hero();
    await signUp(name);
    const timed = async (json: unknown): Promise<{ answer: Answer; ms: number }> => {
      const started = performance.now();
      const answer = await call("POST", "/api/account/signin", { json });
      return { answer, ms: performance.now() - started };
    };
    const wrong = await timed({ name, password: OTHER_PASSWORD });
    const nobody = await timed({ name: hero(), password: OTHER_PASSWORD });
    expect(wrong.answer).toEqual({ status: 401, body: { error: "wrong_name_or_password" } });
    expect(nobody.answer).toEqual(wrong.answer);
    // Both made one password hash, which is most of the time either takes. A name nobody has is not answered in a fraction of it.
    expect(nobody.ms).toBeGreaterThan(wrong.ms / 3);
    // A body that is not a name and a password gets the same answer too.
    for (const json of [{ name }, { name, password: "short" }, { name: "ab", password: PASSWORD }, [], "x"]) {
      expect(await call("POST", "/api/account/signin", { json }), JSON.stringify(json)).toEqual(wrong.answer);
    }
  });

  test("without a session nothing is read or written", async () => {
    const name = hero();
    const { token } = await signUp(name);
    await call("PUT", "/api/account/save", { token, json: { save: save(name, 1) } });
    const stranger = "A".repeat(43);
    const refused = { status: 401, body: { error: "signed_out" } };
    for (const headers of [{}, { Authorization: `Bearer ${stranger}` }, { Authorization: token }, { Authorization: `Basic ${token}` }, { Authorization: `Bearer ${token}x` }, { Authorization: "Bearer" }] as Record<string, string>[]) {
      expect(await call("GET", "/api/account/save", { headers }), JSON.stringify(headers)).toEqual(refused);
      expect(await call("PUT", "/api/account/save", { headers, json: { save: save("thief", 99) } }), JSON.stringify(headers)).toEqual(refused);
    }
    // The token in the address or in the body is not a session either.
    expect(await call("GET", `/api/account/save?token=${token}`)).toEqual(refused);
    expect(await call("PUT", "/api/account/save", { json: { save: save("thief", 99), token } })).toEqual(refused);
    expect((await call("GET", "/api/account/save", { token })).body).toMatchObject({ save: save(name, 1) });
  });

  test("another account cannot read or write this save: a session only ever reaches its own row", async () => {
    const mine = hero();
    const theirs = hero();
    const me = await signUp(mine);
    const them = await signUp(theirs, OTHER_PASSWORD);
    await call("PUT", "/api/account/save", { token: me.token, json: { save: save(mine, 7) } });

    // They see their own empty account, and nothing in the request lets them name another: extra fields are dropped.
    expect((await call("GET", "/api/account/save", { token: them.token })).body).toEqual({ save: null, updatedAt: null });
    const [myRow] = await sql<{ id: string }>(`select id::text as id from ${t.accounts} where name = $1::text`, [mine]);
    const aimed = { save: { ...save(theirs, 1), accountId: myRow?.id, account_id: myRow?.id }, accountId: myRow?.id, account_id: myRow?.id, name: mine };
    expect((await call("PUT", "/api/account/save", { token: them.token, json: aimed, headers: { "X-Account-Id": myRow?.id ?? "" } })).status).toBe(200);
    expect((await call("GET", `/api/account/save?accountId=${myRow?.id ?? ""}&name=${encodeURIComponent(mine)}`, { token: them.token })).body).toMatchObject({ save: save(theirs, 1) });

    // Mine is as I left it.
    expect((await call("GET", "/api/account/save", { token: me.token })).body).toMatchObject({ save: save(mine, 7) });
    const rows = await sql(`select account_id from ${t.saves} where account_id = $1::uuid`, [myRow?.id]);
    expect(rows).toHaveLength(1);
  });

  test("signing out ends that session and no other, and always answers 204", async () => {
    const name = hero();
    const first = await signUp(name);
    const second = await signIn(name);
    expect(await call("POST", "/api/account/signout", { token: first.token })).toEqual({ status: 204, body: null });
    expect((await call("GET", "/api/account/save", { token: first.token })).status).toBe(401);
    expect((await call("GET", "/api/account/save", { token: second.token })).status).toBe(200);
    // Again, with a token nobody has, and with none: the answer says nothing about a token.
    for (const options of [{ token: first.token }, { token: "B".repeat(43) }, {}, { headers: { Authorization: "nonsense" } }]) {
      expect(await call("POST", "/api/account/signout", options)).toEqual({ status: 204, body: null });
    }
    const rows = await sql(`select 1 from ${t.sessions} where token_hash = decode($1::text, 'hex')`, [tokenHash(first.token)]);
    expect(rows).toHaveLength(0);
  });

  test("a session runs out after thirty days", async () => {
    const name = hero();
    const { token } = await signUp(name);
    const started = clock;
    try {
      // The server takes a token it has just seen on trust for KNOWN_SESSION_MS, so the last look before the end is that long before it.
      clock = started + SESSION_MS - KNOWN_SESSION_MS - 1_000;
      expect((await call("GET", "/api/account/save", { token })).status).toBe(200);
      clock = started + SESSION_MS;
      expect(await call("GET", "/api/account/save", { token })).toEqual({ status: 401, body: { error: "signed_out" } });
      expect((await call("PUT", "/api/account/save", { token, json: { save: save(name, 1) } })).status).toBe(401);
      // Signing in again works, and clears the session that ran out.
      const fresh = await signIn(name);
      expect((await call("GET", "/api/account/save", { token: fresh.token })).status).toBe(200);
      const rows = await sql(`select 1 from ${t.sessions} where token_hash = decode($1::text, 'hex')`, [tokenHash(token)]);
      expect(rows).toHaveLength(0);
    } finally {
      clock = started;
    }
  });

  test("an account keeps five sessions: one more ends the oldest", async () => {
    const name = hero();
    const sessions = [await signUp(name)];
    for (let index = 1; index < MAX_SESSIONS + 1; index += 1) {
      clock += 1_000;
      sessions.push(await signIn(name));
    }
    const statuses = [];
    for (const session of sessions) statuses.push((await call("GET", "/api/account/save", { token: session.token })).status);
    expect(statuses).toEqual([401, ...Array.from({ length: MAX_SESSIONS }, () => 200)]);
  });

  test("a save that is too big, not a save, or holds what Postgres cannot store", async () => {
    const name = hero();
    const { token } = await signUp(name);
    const big = { save: { ...save(name, 1), settings: { note: "x".repeat(200) } }, padding: "x".repeat(SAVE_BODY_BYTES) };
    expect(await call("PUT", "/api/account/save", { token, json: big })).toEqual({ status: 413, body: { error: "too_big" } });
    for (const json of [{}, { save: null }, { save: { ...save(name, 1), version: 2 } }, { save: { ...save(name, 1), profile: [name] } }, []]) {
      expect(await call("PUT", "/api/account/save", { token, json }), JSON.stringify(json)).toEqual({ status: 400, body: { error: "invalid", field: "save" } });
    }
    expect(await call("PUT", "/api/account/save", { token, text: "{not json" })).toEqual({ status: 400, body: { error: "invalid", field: "body" } });
    expect((await call("GET", "/api/account/save", { token })).body).toEqual({ save: null, updatedAt: null });

    // A zero byte and half an emoji would make Postgres refuse the document. They are mended, and the write goes through.
    const odd = { ...save(name, 2), profile: { ...(save(name, 2).profile as Record<string, unknown>), name: "Ody\u0000sseus \ud83c" }, settings: { note: "a\u0000b" } };
    expect((await call("PUT", "/api/account/save", { token, json: { save: odd } })).status).toBe(200);
    const read = (await call("GET", "/api/account/save", { token })).body as { save: { profile: { name: string }; settings: unknown } };
    expect([read.save.profile.name, read.save.settings]).toEqual(["Odysseus \ufffd", { note: "ab" }]);
    // Accounts are still on: one odd save did not turn them off for everybody.
    expect(await call("GET", "/api/account/status")).toEqual({ status: 200, body: { available: true } });
  });

  test("a name or a save written like a statement is stored as text and runs nothing", async () => {
    const name = `x'); drop table ${t.accounts.slice(0, 4)}`;
    const { token } = await signUp(name);
    const cruel = { ...save(name, 1), settings: { note: `'; drop table ${t.saves}; --`, other: "$1::text" }, character: `"}'); delete from ${t.accounts}; --`.slice(0, 40) };
    expect((await call("PUT", "/api/account/save", { token, json: { save: cruel } })).status).toBe(200);
    expect((await call("GET", "/api/account/save", { token })).body).toMatchObject({ save: cruel });
    expect((await signIn(name)).name).toBe(name);
    expect((await call("POST", "/api/account/signin", { json: { name: "' or '1'='1", password: "' or '1'='1" } })).status).toBe(401);
    expect((await sql(`select id from ${t.accounts}`, [])).length).toBeGreaterThan(0);
  });

  test("a visitor through the tunnel: typos and taken names use up no sign-ups, and wrong guesses hold that visitor on that name only", async () => {
    const visitor = { "Cf-Connecting-Ip": "203.0.113.50", "Cf-Ray": "8f1c2d3e4f5a6b7c-DFW", "X-Forwarded-For": "203.0.113.50" };
    const name = hero();
    await signUp(name);
    for (let index = 0; index < 5; index += 1) {
      expect((await call("POST", "/api/account/signup", { headers: visitor })).status).toBe(400);
      expect((await call("POST", "/api/account/signup", { json: { name: hero(), password: "short" }, headers: visitor })).status).toBe(400);
    }
    expect((await call("POST", "/api/account/signup", { json: { name, password: PASSWORD }, headers: visitor })).status).toBe(409);
    expect((await call("POST", "/api/account/signup", { json: { name: hero(), password: PASSWORD }, headers: visitor })).status).toBe(201);

    const guesser = { "Cf-Connecting-Ip": "203.0.113.51", "Cf-Ray": "8f1c2d3e4f5a6b7c-DFW", "X-Forwarded-For": "203.0.113.51" };
    for (let index = 0; index < SIGNINS_PER_NAME_AND_ADDRESS; index += 1) {
      expect((await call("POST", "/api/account/signin", { json: { name, password: `wrong guess ${String(index)}` }, headers: guesser })).status, `guess ${String(index + 1)}`).toBe(401);
    }
    // Past the limit even the right password waits from that address, and a name nobody has is treated the same.
    expect(await call("POST", "/api/account/signin", { json: { name, password: PASSWORD }, headers: guesser })).toEqual({ status: 429, body: { error: "slow_down" } });
    // The owner on another address gets in, as often as they like, and so does the laptop.
    for (let index = 0; index < 3; index += 1) {
      expect((await call("POST", "/api/account/signin", { json: { name, password: PASSWORD }, headers: { ...guesser, "Cf-Connecting-Ip": "203.0.113.52" } })).status).toBe(200);
    }
    await signIn(name);
  }, 30_000);

  test("the hour and the total are counted in the database: past them a stranger is told sign-up is closed, sign-in goes on, and this machine is not held by the hour", async () => {
    if (db === null) throw new Error("the database is not open");
    const opened = db;
    const started = clock;
    const HOUR_MS = 60 * 60 * 1000;
    const count = async (since: number | null): Promise<number> => (await sql<{ n: number }>(
      `select count(*)::int as n from ${t.accounts} where $1::text is null or created_at > $1::timestamptz`, [since === null ? null : new Date(since).toISOString()],
    ))[0]?.n ?? -1;
    // A second server on the same tables, as the laptop and the hosted copy are on the same database. It has made
    // nothing itself, and it lets strangers make two more accounts this hour than the tables already hold.
    const madeThisHour = await count(started - HOUR_MS);
    expect(madeThisHour).toBeGreaterThan(0);
    const strict = createAccounts(() => Promise.resolve(opened), { prefix, now: () => clock, caps: { perHour: madeThisHour + 2 } });
    const second = (await createApp({ config, ai: NO_AI, accounts: strict })).listen(0, "127.0.0.1");
    await once(second, "listening");
    const secondPort = (second.address() as AddressInfo).port;
    const post = async (path: string, json: unknown, headers: Record<string, string> = {}): Promise<Answer & { retry: string | null }> => {
      const response = await fetch(`http://127.0.0.1:${String(secondPort)}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(json) });
      const text = await response.text();
      return { status: response.status, body: text === "" ? null : JSON.parse(text) as unknown, retry: response.headers.get("retry-after") };
    };
    const visitor = { "Cf-Connecting-Ip": "203.0.113.60", "Cf-Ray": "8f1c2d3e4f5a6b7c-DFW", "X-Forwarded-For": "203.0.113.60" };
    try {
      const first = hero();
      expect((await post("/api/account/signup", { name: first, password: PASSWORD }, visitor)).status).toBe(201);
      expect((await post("/api/account/signup", { name: hero(), password: PASSWORD }, visitor)).status).toBe(201);
      // The third finds the hour used up: by accounts this server never made itself, so its own memory could not have known.
      const before = await count(null);
      const refused = hero();
      const closed = await post("/api/account/signup", { name: refused, password: PASSWORD }, visitor);
      expect(closed).toEqual({ status: 429, body: { error: "signups_closed", message: SIGNUPS_CLOSED_TEXT }, retry: "600" });
      // The same for a name that is taken: the answer says nothing about a name.
      expect((await post("/api/account/signup", { name: first, password: PASSWORD }, visitor)).body).toEqual(closed.body);
      expect(await count(null)).toBe(before);
      expect(await sql(`select 1 from ${t.accounts} where name = $1::text`, [refused])).toHaveLength(0);
      // Sign-in goes on, for the same visitor, and the first server reads the save of an account the second one made.
      const session = await post("/api/account/signin", { name: first, password: PASSWORD }, visitor);
      expect(session.status).toBe(200);
      expect((await call("GET", "/api/account/save", { token: (session.body as Session).token })).status).toBe(200);
      // This machine is not held by the hour.
      expect((await post("/api/account/signup", { name: hero(), password: PASSWORD })).status).toBe(201);
      // An hour on, the accounts of this run are older than an hour, and the visitor makes one again.
      clock = started + HOUR_MS + 1_000;
      expect((await post("/api/account/signup", { name: hero(), password: PASSWORD }, visitor)).status).toBe(201);

      // The total: a server whose database holds as many accounts as it may answers 503, in the same words, also to this machine.
      const brim = createAccounts(() => Promise.resolve(opened), { prefix, now: () => clock, caps: { total: await count(null), keptForThisMachine: 0 } });
      expect(await brim.signUp(hero(), PASSWORD)).toBe("full");
      expect(await brim.signUp(hero(), PASSWORD, true)).toBe("full");
      expect(await brim.signIn(first, PASSWORD)).toMatchObject({ name: first });
    } finally {
      clock = started;
      second.close();
      second.closeAllConnections();
    }
  }, 30_000);
});
