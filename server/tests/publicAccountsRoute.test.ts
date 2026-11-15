// The account routes with no database: what the game sees when accounts are off, when the database is set but does
// not answer, and who may reach the routes at all. Sign-up, sign-in and saves against a real Postgres are in accountsDb.test.ts.
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Deps } from "../app";
import { loadConfig } from "../env";
import type { Config } from "../env";
import {
  PUBLIC_ATTEMPTS_PER_ADDRESS as ATTEMPTS_PER_ADDRESS, HASHES_AT_ONCE, HASHES_WAITING, PUBLIC_SIGNINS_PER_NAME_AND_ADDRESS as SIGNINS_PER_NAME_AND_ADDRESS, SIGNUPS_OVERALL, SIGNUPS_PER_HOUR, SIGNUP_WINDOW_MS, STRANGERS_AT_ONCE,
  STRANGERS_WAITING, PUBLIC_WRONG_TOKENS_PER_ADDRESS as WRONG_TOKENS_PER_ADDRESS,
} from "../lib/accountLimits";
import type { Gate } from "../lib/accountLimits";
import { createAccounts, makeToken } from "../lib/accounts";
import type { Accounts } from "../lib/accounts";
import type { Db } from "../lib/db";
import { isAccountPath, isOpenPath, isTunnelPath, mayAnswer, readsOwnBody } from "../lib/localOnly";
import { CLOSED_RETRY_S, SIGNUPS_CLOSED_TEXT, STATUS_MS, smallBody } from "../routes/account";
import { captureLog } from "./support/drill";

// Every test here runs with PUBLIC_ACCOUNTS=1; accountRoute.test.ts has the same routes without it.
beforeEach(() => { vi.stubEnv("PUBLIC_ACCOUNTS", "1"); });
afterEach(() => { vi.unstubAllEnvs(); });

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
/** Made up, and on purpose not shaped like real ones. No test may ever find them in an answer or a log line. */
const SECRET_PASSWORD = "made-up-database-password-314159";
const SECRET_URL = `postgres://dojo:${SECRET_PASSWORD}@127.0.0.1:1/made-up-database-name?sslmode=require`;
const LAN = "192.168.1.20";
/** What cloudflared puts on a request it hands to the server. The visitor's address is made up. */
const TUNNEL = { "Cf-Connecting-Ip": "203.0.113.7", "Cf-Ray": "8f1c2d3e4f5a6b7c-DFW", "X-Forwarded-For": "203.0.113.7", "X-Forwarded-Proto": "https", "Cdn-Loop": "cloudflare" };
const PATHS = ["/api/account/status", "/api/account/signup", "/api/account/signin", "/api/account/signout", "/api/account/save", "/api/account/rename", "/api/account/password"];
const CREDENTIALS = { name: "Odysseus", password: "nine oars and a sail" };
const SAVE = { save: { version: 1, profile: { name: "Odysseus", cleared: [], moves: {}, bestScore: 0, fights: 0, wins: 0, styles: ["boxer"] }, settings: {}, character: null } };

const closers: (() => void)[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const close of closers.splice(0)) close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

interface Answer {
  readonly status: number;
  readonly text: string;
  readonly cache: string | null;
  readonly retry: string | null;
}
type Call = (method: string, path: string, options?: { json?: unknown; token?: string; headers?: Record<string, string> }) => Promise<Answer>;

async function listen(app: express.Express): Promise<number> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => { server.close(); server.closeAllConnections(); });
  return (server.address() as AddressInfo).port;
}

/** The real app on a loopback port. */
async function serve(extra: Partial<Deps> = {}): Promise<{ readonly call: Call; readonly port: number }> {
  const port = await listen(await createApp({ config, ai: NO_AI, ...extra }));
  const call: Call = async (method, path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
      method,
      headers: {
        ...(options.json === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.token === undefined ? {} : { Authorization: `Bearer ${options.token}` }),
        ...options.headers,
      },
      ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
    });
    return { status: response.status, text: await response.text(), cache: response.headers.get("cache-control"), retry: response.headers.get("retry-after") };
  };
  return { call, port };
}

/** Sends a request byte for byte as written and resolves with the status and how long the answer took. Nothing after the headers is sent unless `body` says so. */
function raw(port: number, lines: readonly string[], body = ""): Promise<{ status: number; ms: number }> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const socket = connect(port, "127.0.0.1");
    let answer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      answer += chunk;
      const status = /^HTTP\/1\.1 (\d{3}) /.exec(answer)?.[1];
      if (status !== undefined) {
        resolve({ status: Number(status), ms: performance.now() - started });
        socket.destroy();
      }
    });
    socket.on("error", reject);
    socket.write([...lines, "Host: 127.0.0.1", "", body].join("\r\n"));
  });
}

/** Every request an account screen can make but status, each as [what it is, the call]. */
function everyRoute(call: Call, headers: Record<string, string> = {}): readonly (readonly [string, () => Promise<Answer>])[] {
  const token = makeToken();
  return [
    ["sign up", () => call("POST", "/api/account/signup", { json: CREDENTIALS, headers })],
    ["sign up with nothing", () => call("POST", "/api/account/signup", { headers })],
    ["sign up with a bad body", () => call("POST", "/api/account/signup", { json: { name: 5 }, headers })],
    ["sign in", () => call("POST", "/api/account/signin", { json: CREDENTIALS, headers })],
    ["sign out", () => call("POST", "/api/account/signout", { token, headers })],
    ["sign out with no token", () => call("POST", "/api/account/signout", { headers })],
    ["read the save", () => call("GET", "/api/account/save", { token, headers })],
    ["read the save with no token", () => call("GET", "/api/account/save", { headers })],
    ["write the save", () => call("PUT", "/api/account/save", { token, json: SAVE, headers })],
    ["write a bad save", () => call("PUT", "/api/account/save", { token, json: { save: 5 }, headers })],
    ["write the save with no token", () => call("PUT", "/api/account/save", { json: SAVE, headers })],
    ["the path with a slash after it", () => call("POST", "/api/account/signin/", { json: CREDENTIALS, headers })],
    ["the path in capitals", () => call("POST", "/API/Account/SignUp", { json: CREDENTIALS, headers })],
  ];
}

test("with no DATABASE_URL status says accounts are off and every other route answers 503, for this machine and for a visitor through the tunnel", async () => {
  const log = captureLog();
  const { call } = await serve();
  for (const headers of [{}, TUNNEL]) {
    const status = await call("GET", "/api/account/status", { headers });
    expect([status.status, JSON.parse(status.text), status.cache]).toEqual([200, { available: false }, "no-store"]);
    for (const [what, ask] of everyRoute(call, headers)) {
      const answer = await ask();
      expect([answer.status, JSON.parse(answer.text), answer.cache], what).toEqual([503, { error: "unavailable" }, "no-store"]);
    }
  }
  // Nothing threw and nothing was worth a log line: being off is the normal state.
  expect(log.lines).toEqual([]);
});

test("with accounts off no body is read: a request that promises 5 MB and sends none is answered at once", async () => {
  const { port } = await serve();
  for (const [method, path] of [["POST", "/api/account/signup"], ["POST", "/api/account/signin"], ["PUT", "/api/account/save"]] as const) {
    const answer = await raw(port, [`${method} ${path} HTTP/1.1`, "Content-Type: application/json", "Content-Length: 5000000", "Cf-Ray: 1"]);
    expect([answer.status, answer.ms < 2_000], `${method} ${path}`).toEqual([503, true]);
  }
});

test("a DATABASE_URL that cannot be used leaves accounts off, and no part of it reaches an answer or the log", async () => {
  const log = captureLog();
  const { call } = await serve({ config: { ...config, databaseUrl: SECRET_URL } });
  const answers = [await call("GET", "/api/account/status")];
  expect([answers[0]?.status, JSON.parse(answers[0]?.text ?? "{}")]).toEqual([200, { available: false }]);
  for (const [what, ask] of everyRoute(call)) {
    const answer = await ask();
    expect([answer.status, JSON.parse(answer.text)], what).toEqual([503, { error: "unavailable" }]);
    answers.push(answer);
  }
  // Said once, however many requests came: nothing listens there, so the driver is refused.
  const said = log.lines.filter((line) => line.includes("accounts_unavailable"));
  expect(said.map((line) => (JSON.parse(line) as { detail: unknown }).detail)).toEqual([{ reason: "no_answer", code: "ECONNREFUSED" }]);
  for (const text of [...answers.map((answer) => answer.text), ...log.lines]) {
    expect(text).not.toContain(SECRET_PASSWORD);
    expect(text).not.toContain("made-up-database-name");
    expect(text).not.toContain("postgres://");
  }
});

test("a database that refuses every statement: 503 on every route, and its error text reaches neither the browser nor the log", async () => {
  const log = captureLog();
  const refusing: Db = {
    query: () => Promise.reject(new Error(`password authentication failed for ${SECRET_URL} using ${SECRET_PASSWORD}`)),
    close: () => Promise.resolve(),
  };
  const accounts = createAccounts(() => Promise.resolve(refusing));
  const { call } = await serve({ accounts });
  const status = await call("GET", "/api/account/status");
  expect([status.status, JSON.parse(status.text)]).toEqual([200, { available: false }]);
  const texts = [status.text];
  for (const [what, ask] of everyRoute(call)) {
    const answer = await ask();
    expect([answer.status, JSON.parse(answer.text)], what).toEqual([503, { error: "unavailable" }]);
    texts.push(answer.text);
  }
  expect(log.lines.some((line) => line.includes("accounts_tables_failed"))).toBe(true);
  // Never the app's own error handler, which logs an error as it is.
  expect(log.lines.some((line) => line.includes("request_failed"))).toBe(false);
  for (const text of [...texts, ...log.lines]) {
    expect(text).not.toContain(SECRET_PASSWORD);
    expect(text).not.toContain("postgres://");
  }
});

test("the account paths, and only those, answer the tunnel and this machine, and never another device on plain HTTP", () => {
  const relayed = { "cf-ray": "8f1c2d3e4f5a6b7c-DFW", "cf-connecting-ip": "203.0.113.7" };
  for (const path of [...PATHS, "/API/Account/Status", "/api/account/save/", "/Api/Account/SignIn", "/api/account/signout/"]) {
    // This machine's own browser, and a tunnel that runs on this machine: both arrive on a loopback socket.
    expect(mayAnswer(path, "127.0.0.1"), path).toBe(true);
    expect(mayAnswer(path, "127.0.0.1", relayed), path).toBe(true);
    expect(mayAnswer(path, "::1", relayed), path).toBe(true);
    // Another device speaks plain HTTP to this server: a password must not cross the Wi-Fi that way, whatever headers it sends.
    expect(mayAnswer(path, LAN), path).toBe(false);
    expect(mayAnswer(path, LAN, relayed), path).toBe(false);
    expect(mayAnswer(path, undefined, relayed), path).toBe(false);
    // The app gives its 6 MB JSON parser to every /api/ path that does not read its own body, so these read only their small ones.
    expect([isAccountPath(path.toLowerCase()), isOpenPath(path.toLowerCase()), isTunnelPath(path.toLowerCase()), readsOwnBody(path.toLowerCase())], path).toEqual([true, false, true, true]);
  }
  const closed = [
    "/api/account", "/api/account/", "/api/account/admin", "/api/account/save/x", "/api/account/save//", "/api/accounts/save", "/api/account/savex",
    "/api/account/status.json", "/api/accountx/status", "/api/account/sign", "/api/account//save", "/api/level/account/save", "/api/account/save/../../level",
  ];
  for (const path of closed) {
    expect(isAccountPath(path), path).toBe(false);
    expect(mayAnswer(path, LAN), path).toBe(false);
    expect(mayAnswer(path, "127.0.0.1", relayed), path).toBe(false);
    expect(mayAnswer(path, "127.0.0.1"), path).toBe(true);
  }
  // Opening them opened nothing else to a visitor through the tunnel, and closed nothing a second laptop already had.
  for (const path of ["/api/level", "/api/speech", "/api/reveal", "/api/portrait/x", "/api/rooms", "/api/health", "/api/replays/abc"]) {
    expect(mayAnswer(path, "127.0.0.1", relayed), path).toBe(false);
  }
  for (const path of ["/api/rooms", "/api/rooms/abcd/join", "/api/health", "/api/replays/abc"]) expect(mayAnswer(path, LAN), path).toBe(true);
});

test("through the tunnel the account routes answer for themselves, and a path beside them is refused by the guard", async () => {
  const { call } = await serve();
  expect((await call("GET", "/api/account/status", { headers: TUNNEL })).status).toBe(200);
  // 503 is the route's own answer with accounts off. The guard's answer would be 403.
  expect((await call("POST", "/api/account/signup", { json: CREDENTIALS, headers: TUNNEL })).status).toBe(503);
  for (const [method, path] of [["GET", "/api/account"], ["GET", "/api/account/admin"], ["POST", "/api/account/save/x"], ["GET", "/api/accounts/status"], ["POST", "/api/level"]] as const) {
    const answer = await call(method, path, { headers: TUNNEL });
    expect([answer.status, JSON.parse(answer.text)], path).toEqual([403, { error: "local_only" }]);
  }
});

/** A POST to a small app whose one route reads at most 64 bytes. `chunks` are sent without saying how long the body is. */
async function small(): Promise<{ readonly port: number; readonly chunked: (chunks: readonly string[]) => Promise<number> }> {
  const app = express();
  app.post(
    "/x",
    smallBody(64, (response) => { response.status(413).json({ error: "too_big" }); }, (response) => { response.status(400).json({ error: "invalid" }); }),
    (request, response) => { response.json({ got: request.body as unknown, has: request.body !== undefined }); },
  );
  const port = await listen(app);
  const chunked = (chunks: readonly string[]): Promise<number> => new Promise((resolve, reject) => {
    const sending = httpRequest({ host: "127.0.0.1", port, path: "/x", method: "POST", headers: { "Content-Type": "application/json" } }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    // The server may answer and hang up before everything is written.
    sending.on("error", (error: NodeJS.ErrnoException) => { if (error.code !== "EPIPE" && error.code !== "ECONNRESET") reject(error); });
    for (const chunk of chunks) sending.write(chunk);
    sending.end();
  });
  return { port, chunked };
}

test("the body reader of the account routes takes a small JSON body and refuses everything else", async () => {
  const { port, chunked } = await small();
  const post = (body: string, type = "application/json"): Promise<Response> =>
    fetch(`http://127.0.0.1:${String(port)}/x`, { method: "POST", headers: { "Content-Type": type }, body });
  const fits = JSON.stringify({ name: "Odysseus", password: "x".repeat(31) });
  expect(Buffer.byteLength(fits)).toBe(64);
  const taken = await post(fits);
  expect([taken.status, await taken.json()]).toEqual([200, { got: JSON.parse(fits), has: true }]);

  // One byte more, said in the header.
  expect((await post(`${fits} `)).status).toBe(413);
  // Far too long, said in the header, and not a byte of it sent: refused without waiting for it.
  const promised = await raw(port, ["POST /x HTTP/1.1", "Content-Type: application/json", "Content-Length: 5000000"]);
  expect([promised.status, promised.ms < 2_000]).toEqual([413, true]);
  // Too long without saying so.
  expect(await chunked(['{"name":"', "x".repeat(40), "x".repeat(40), '"}'])).toBe(413);
  expect(await chunked(['{"a":', "1}"])).toBe(200);

  // Not JSON, or JSON that is not an object or a list.
  for (const body of ["{", "name=Odysseus", '"just a string"', "5", "null", '{"a":1}{"b":2}']) expect((await post(body)).status, body).toBe(400);
  // Another content type is not parsed at all, so the route sees no body and refuses it itself.
  const form = await post("name=Odysseus&password=12345678", "application/x-www-form-urlencoded");
  expect([form.status, await form.json()]).toEqual([200, { has: false }]);
  const plain = await post(fits, "text/plain");
  expect(await plain.json()).toEqual({ has: false });
});

test("the connection string is read from DATABASE_URL, and is null when that is not set", () => {
  const root = mkdtempSync(join(tmpdir(), "env-"));
  try {
    vi.stubEnv("DATABASE_URL", "");
    expect(loadConfig(root).databaseUrl).toBeNull();
    vi.stubEnv("DATABASE_URL", "   ");
    expect(loadConfig(root).databaseUrl).toBeNull();
    vi.stubEnv("DATABASE_URL", ` ${SECRET_URL} `);
    expect(loadConfig(root).databaseUrl).toBe(SECRET_URL);
    // A config written by hand, as the tests do, may leave it out: that is off too.
    expect(config.databaseUrl ?? null).toBeNull();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// From here on the routes run over an Accounts object that gives fixed answers: it is not a database and stores no
// account and no save. It is only there to see in which order the routes count, refuse and ask.
const RIGHT_PASSWORD = "the right password";
const KNOWN_TOKEN = makeToken();
const ACCOUNT_ID = "0d15ea5e-0000-4000-8000-000000000000";

interface Fixed {
  readonly accounts: Accounts;
  /** The name of each call that reached the accounts, in order. */
  asked: string[];
  /** How many calls are inside the accounts right now, and the most there ever were at once. */
  inside: number;
  most: number;
  /** When set, every call waits for this before it answers. */
  hold: Promise<void> | null;
}

function fixed(): Fixed {
  const state: Omit<Fixed, "accounts"> = { asked: [], inside: 0, most: 0, hold: null };
  const answer = async <T>(what: string, value: T): Promise<T> => {
    state.asked.push(what);
    state.inside += 1;
    state.most = Math.max(state.most, state.inside);
    try {
      if (state.hold !== null) await state.hold;
      return value;
    } finally {
      state.inside -= 1;
    }
  };
  // What the real accounts remember of a token they were asked about: here, only whether the one known token is signed in.
  let remembered = false;
  const accounts: Accounts = {
    available: () => Promise.resolve(true),
    signUp: (name) => answer("signUp", name === "Taken" ? "name_taken" as const : name === "Past The Hour" ? "closed" as const : name === "Brim" ? "full" as const : { token: KNOWN_TOKEN, name }),
    signIn: (name, password) => answer("signIn", password === RIGHT_PASSWORD ? { token: KNOWN_TOKEN, name } : null),
    signOut: (token) => {
      if (token === KNOWN_TOKEN) remembered = false;
      return answer("signOut", undefined);
    },
    accountOf: async (token) => {
      const found = await answer("accountOf", token === KNOWN_TOKEN ? ACCOUNT_ID : null);
      if (found !== null) remembered = true;
      return found;
    },
    remembered: (token) => (remembered && token === KNOWN_TOKEN ? ACCOUNT_ID : null),
    rename: (_accountId, name) => answer("rename", { name }),
    changePassword: () => answer("changePassword", "changed" as const),
    readSave: () => answer("readSave", { save: null, updatedAt: null }),
    writeSave: () => answer("writeSave", { updatedAt: "2026-11-15T07:00:00.000Z" }),
    close: () => Promise.resolve(),
  };
  return Object.assign(state, { accounts });
}

/** The headers cloudflared adds for a visitor at `address`. */
const from = (address: string): Record<string, string> => ({ ...TUNNEL, "Cf-Connecting-Ip": address, "X-Forwarded-For": address });
const statuses = async (asks: readonly Promise<Answer>[]): Promise<number[]> => (await Promise.all(asks)).map((answer) => answer.status);
const times = <T>(count: number, make: (index: number) => T): T[] => Array.from({ length: count }, (_, index) => make(index));
/**
 * The statuses of `count` requests, sent 50 at a time, each batch answered before the next is sent. A test server on Windows
 * refuses hundreds of new connections in one instant (ECONNREFUSED); what is counted is the same either way.
 */
const BATCH = 50;
async function inBatches(count: number, make: (index: number) => Promise<Answer>): Promise<number[]> {
  const got: number[] = [];
  for (let start = 0; start < count; start += BATCH) got.push(...await statuses(times(Math.min(BATCH, count - start), (index) => make(start + index))));
  return got;
}
/** Waits until `met` is true, for five seconds at most. */
async function until(met: () => boolean): Promise<void> {
  for (let waited = 0; waited < 500 && !met(); waited += 1) await new Promise((resolve) => { setTimeout(resolve, 10); });
}

test("empty and malformed sign-ups use up nobody's sign-ups: the same address and every other one can still make an account", async () => {
  const stand = fixed();
  const { call } = await serve({ accounts: stand.accounts });
  const venue = from("198.51.100.1");
  // A hall of people behind one address: no body, a short password, a taken name. None of it is an account made.
  for (let index = 0; index < 15; index += 1) expect((await call("POST", "/api/account/signup", { headers: venue })).status).toBe(400);
  for (let index = 0; index < 15; index += 1) {
    const short = await call("POST", "/api/account/signup", { json: { name: "Odysseus", password: "short" }, headers: venue });
    expect([short.status, JSON.parse(short.text)]).toEqual([400, { error: "invalid", field: "password" }]);
  }
  for (let index = 0; index < 15; index += 1) expect((await call("POST", "/api/account/signup", { json: { name: "Taken", password: RIGHT_PASSWORD }, headers: venue })).status).toBe(409);
  // Only the taken names reached the accounts at all.
  expect(stand.asked).toEqual(times(15, () => "signUp"));
  const made = await call("POST", "/api/account/signup", { json: CREDENTIALS, headers: venue });
  expect([made.status, JSON.parse(made.text)]).toEqual([201, { token: KNOWN_TOKEN, name: "Odysseus" }]);

  // Past the per-address count of requests the venue waits a minute; an address that did nothing is not held up by it.
  const flood = await inBatches(ATTEMPTS_PER_ADDRESS, () => call("POST", "/api/account/signup", { headers: venue }));
  expect(flood.filter((status) => status === 429).length).toBeGreaterThan(0);
  const refused = await call("POST", "/api/account/signup", { json: CREDENTIALS, headers: venue });
  expect([refused.status, JSON.parse(refused.text)]).toEqual([429, { error: "slow_down" }]);
  for (const address of ["198.51.100.2", "198.51.100.3", "2001:db8:1::5"]) {
    expect((await call("POST", "/api/account/signup", { json: CREDENTIALS, headers: from(address) })).status, address).toBe(201);
    expect((await call("POST", "/api/account/signin", { json: { name: "Odysseus", password: RIGHT_PASSWORD }, headers: from(address) })).status, address).toBe(200);
  }
});

test("empty sign-ins cost nothing, wrong passwords hold one address on one name, and the owner still gets in from another", async () => {
  const stand = fixed();
  const { call } = await serve({ accounts: stand.accounts });
  const guesser = from("198.51.100.9");
  for (let index = 0; index < 20; index += 1) expect((await call("POST", "/api/account/signin", { headers: guesser })).status).toBe(401);
  expect(stand.asked).toEqual([]);

  const guess = (headers: Record<string, string>, name = "Odysseus"): Promise<Answer> => call("POST", "/api/account/signin", { json: { name, password: "a wrong password" }, headers });
  for (let index = 0; index < SIGNINS_PER_NAME_AND_ADDRESS; index += 1) {
    const answer = await guess(guesser);
    expect([answer.status, JSON.parse(answer.text)]).toEqual([401, { error: "wrong_name_or_password" }]);
  }
  // Same answer for a name in any spelling: the count is on the key.
  expect((await guess(guesser, " ODYSSEUS ")).status).toBe(429);
  expect(stand.asked.filter((what) => what === "signIn")).toHaveLength(SIGNINS_PER_NAME_AND_ADDRESS);
  // The owner on another address, and the guesser on another name, are not held.
  const owner = await call("POST", "/api/account/signin", { json: { name: "Odysseus", password: RIGHT_PASSWORD }, headers: from("198.51.100.10") });
  expect([owner.status, JSON.parse(owner.text)]).toEqual([200, { token: KNOWN_TOKEN, name: "Odysseus" }]);
  expect((await guess(guesser, "Penelope")).status).toBe(401);
  // The right password never uses the name up, however often it is used.
  for (let index = 0; index < SIGNINS_PER_NAME_AND_ADDRESS + 5; index += 1) {
    expect((await call("POST", "/api/account/signin", { json: { name: "Telemachus", password: RIGHT_PASSWORD }, headers: from("198.51.100.11") })).status).toBe(200);
  }
});

test("junk tokens from an address are counted before the database is asked, and do not stop a player there who is signed in", async () => {
  const stand = fixed();
  const { call } = await serve({ accounts: stand.accounts });
  const venue = from("198.51.100.20");
  // The player's token is looked up once, then remembered: a read and a write after it ask nothing more about it.
  expect((await call("GET", "/api/account/save", { token: KNOWN_TOKEN, headers: venue })).status).toBe(200);
  expect((await call("PUT", "/api/account/save", { token: KNOWN_TOKEN, json: SAVE, headers: venue })).status).toBe(200);
  expect(stand.asked).toEqual(["accountOf", "readSave", "writeSave"]);

  // No token at all costs nothing and is counted nowhere.
  expect(await inBatches(200, () => call("GET", "/api/account/save", { headers: venue }))).toEqual(times(200, () => 401));
  expect(stand.asked).toHaveLength(3);

  // Somebody else at the same address sends junk, fifty at once. Only as many as the budget holds reach the database.
  const junk = await inBatches(WRONG_TOKENS_PER_ADDRESS + 40, () => call("GET", "/api/account/save", { token: makeToken(), headers: venue }));
  expect(junk.filter((status) => status === 401)).toHaveLength(WRONG_TOKENS_PER_ADDRESS);
  expect(junk.filter((status) => status === 429)).toHaveLength(40);
  expect(stand.asked.filter((what) => what === "accountOf")).toHaveLength(1 + WRONG_TOKENS_PER_ADDRESS);
  // Sign-out with junk is counted the same way, and no delete is sent for it.
  expect((await call("POST", "/api/account/signout", { token: makeToken(), headers: venue })).status).toBe(429);
  expect(stand.asked).not.toContain("signOut");

  // The player goes on reading and writing.
  expect((await call("GET", "/api/account/save", { token: KNOWN_TOKEN, headers: venue })).status).toBe(200);
  expect((await call("PUT", "/api/account/save", { token: KNOWN_TOKEN, json: SAVE, headers: venue })).status).toBe(200);
  // And can sign out: the session is ended in the database and forgotten here, so the token is asked about again after it.
  expect((await call("POST", "/api/account/signout", { token: KNOWN_TOKEN, headers: venue })).status).toBe(204);
  expect(stand.asked.at(-1)).toBe("signOut");
  expect((await call("GET", "/api/account/save", { token: KNOWN_TOKEN, headers: venue })).status).toBe(429);
  // Another address was never part of it.
  expect((await call("GET", "/api/account/save", { token: makeToken(), headers: from("198.51.100.21") })).status).toBe(401);
});

test("sign-out with no token or a malformed one is 204 and asks nothing", async () => {
  const stand = fixed();
  const { call } = await serve({ accounts: stand.accounts });
  expect(await inBatches(150, () => call("POST", "/api/account/signout", { headers: TUNNEL }))).toEqual(times(150, () => 204));
  expect((await call("POST", "/api/account/signout", { headers: { ...TUNNEL, Authorization: "Bearer not-a-token" } })).status).toBe(204);
  expect(stand.asked).toEqual([]);
});

test("a request from this machine that carries any relay header is counted like a stranger, never as the laptop", async () => {
  const stand = fixed();
  const { call } = await serve({ accounts: stand.accounts });
  // clientKey does not know these two headers; the guard does. Without the check they would get the laptop's free pass.
  for (const headers of [{ "X-Forwarded-Proto": "https" }, { "Cf-Ray": "8f1c2d3e4f5a6b7c-DFW" }]) {
    const answers = await statuses(times(SIGNINS_PER_NAME_AND_ADDRESS + 5, () => call("POST", "/api/account/signin", { json: { name: "Odysseus", password: "a wrong password" }, headers })));
    expect(answers.filter((status) => status === 429).length, JSON.stringify(headers)).toBeGreaterThan(0);
  }
  // The laptop's own browser sends none, and is never refused.
  const own = await inBatches(ATTEMPTS_PER_ADDRESS + 20, () => call("POST", "/api/account/signin", { json: { name: "Nestor", password: "a wrong password" } }));
  expect(own).toEqual(times(ATTEMPTS_PER_ADDRESS + 20, () => 401));
});

test("strangers' database work goes two at a time with a short line, and the laptop is served while they wait", async () => {
  const stand = fixed();
  const { call } = await serve({ accounts: stand.accounts });
  let release: () => void = () => undefined;
  stand.hold = new Promise<void>((resolve) => { release = resolve; });
  // Sixty lookups in one instant, from enough addresses that no per-address count stops them.
  const burst = times(60, (index) => call("GET", "/api/account/save", { token: makeToken(), headers: from(`198.51.100.${String(100 + (index % 6))}`) }));
  // All sixty have arrived once the ones that found no place in the line have their answer.
  let turnedAway = 0;
  for (const ask of burst) void ask.then((answer) => { if (answer.status === 429) turnedAway += 1; });
  await until(() => turnedAway === 60 - STRANGERS_AT_ONCE - STRANGERS_WAITING);
  expect(stand.inside).toBe(STRANGERS_AT_ONCE);
  // The laptop does not stand in that line.
  const own = call("GET", "/api/account/save", { token: KNOWN_TOKEN });
  await until(() => stand.inside === STRANGERS_AT_ONCE + 1);
  expect(stand.inside).toBe(STRANGERS_AT_ONCE + 1);
  release();
  stand.hold = null;
  expect((await own).status).toBe(200);
  const answers = await statuses(burst);
  // Two ran, sixteen waited, the rest were told to come back, and nothing ever ran more than two at once beside the laptop.
  expect(answers.filter((status) => status === 401)).toHaveLength(STRANGERS_AT_ONCE + STRANGERS_WAITING);
  expect(answers.filter((status) => status === 429)).toHaveLength(60 - STRANGERS_AT_ONCE - STRANGERS_WAITING);
  expect(stand.most).toBeLessThanOrEqual(STRANGERS_AT_ONCE + 1);
});

test("a database that takes too long to say it is there is answered for as not available, without waiting for it", async () => {
  const stand = fixed();
  const slow: Accounts = { ...stand.accounts, available: () => new Promise(() => undefined) };
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const { call } = await serve({ accounts: slow });
    const status = call("GET", "/api/account/status");
    const signIn = call("POST", "/api/account/signin", { json: CREDENTIALS });
    // Give the two requests time to reach the server before the clock is moved.
    await new Promise((resolve) => { setImmediate(resolve); });
    await new Promise((resolve) => { setImmediate(resolve); });
    for (let waited = 0; waited < 20; waited += 1) {
      await vi.advanceTimersByTimeAsync(STATUS_MS / 4);
      await new Promise((resolve) => { setImmediate(resolve); });
    }
    expect(JSON.parse((await status).text)).toEqual({ available: false });
    expect((await signIn).status).toBe(503);
  } finally {
    vi.useRealTimers();
  }
});

/**
 * A Db that keeps nothing: it answers the count before a sign-up with zeros and everything else with no rows, after
 * `hold` when one is set. It says how many statements are inside it right now and the most there ever were at once.
 */
function heldDb(): { readonly db: Db; inside: number; most: number; hold: Promise<void> | null } {
  const state = {
    inside: 0, most: 0, hold: null as Promise<void> | null,
    db: {
      query: async (text: string): Promise<never[]> => {
        state.inside += 1;
        state.most = Math.max(state.most, state.inside);
        try {
          if (state.hold !== null) await state.hold;
          return (text.includes("count(*)") ? [{ n: 0, hour: 0, day: 0 }] : []) as never[];
        } finally {
          state.inside -= 1;
        }
      },
      close: () => Promise.resolve(),
    } satisfies Db,
  };
  return state;
}

test("sign-ins that wait for their password hash hold no place at the database: other strangers are served meanwhile", async () => {
  captureLog();
  const stand = heldDb();
  // The hash gate, held by the test: every sign-in gets as far as its hash and waits there.
  let release: () => void = () => undefined;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let hashing = 0;
  const gate: Gate = async (work) => {
    hashing += 1;
    await hold;
    return work();
  };
  const accounts = createAccounts(() => Promise.resolve(stand.db), { gate });
  expect(await accounts.available()).toBe(true);
  const { call } = await serve({ accounts });
  const slow = times(6, (index) => call("POST", "/api/account/signin", { json: { name: `Hero ${String(index)}`, password: "a wrong password" }, headers: from(`198.51.100.${String(index)}`) }));
  await until(() => hashing === 6);
  // Six sign-ins are in the middle of their work. Before, the first two held both of the strangers' places for as long as their hashes took.
  expect(stand.inside).toBe(0);
  const others = times(10, (index) => call("GET", "/api/account/save", { token: makeToken(), headers: from(`198.51.100.${String(50 + index)}`) }));
  expect(await statuses(others)).toEqual(times(10, () => 401));
  release();
  expect(await statuses(slow)).toEqual(times(6, () => 401));
  expect(stand.most).toBeLessThanOrEqual(STRANGERS_AT_ONCE);
});

test("a flood of sign-ins holds two places at the database and one hash at a time, waits in two short lines, and the rest are told to come back", async () => {
  captureLog();
  const stand = heldDb();
  const accounts = createAccounts(() => Promise.resolve(stand.db));
  expect(await accounts.available()).toBe(true);
  const { call } = await serve({ accounts });
  let release: () => void = () => undefined;
  stand.hold = new Promise<void>((resolve) => { release = resolve; });
  // Fifty sign-ins in one instant (a test server on Windows refuses many more new connections at once), each from its own address and to its own name, so no count per address or per name stops them.
  const FLOOD = 50;
  const burst = times(FLOOD, (index) => call("POST", "/api/account/signin", { json: { name: `Hero ${String(index)}`, password: "a wrong password" }, headers: from(`198.51.100.${String(index)}`) }));
  let turnedAway = 0;
  for (const ask of burst) void ask.then((answer) => { if (answer.status === 429) turnedAway += 1; });
  // The database is slow: two look-ups are in it, sixteen wait, and the other 32 already have their answer.
  await until(() => turnedAway === FLOOD - STRANGERS_AT_ONCE - STRANGERS_WAITING);
  expect(turnedAway).toBe(FLOOD - STRANGERS_AT_ONCE - STRANGERS_WAITING);
  expect(stand.inside).toBe(STRANGERS_AT_ONCE);
  release();
  stand.hold = null;
  const answers = await statuses(burst);
  // Eighteen reach the hash: one runs, eight wait, nine are told to come back. Nothing waits without a bound.
  expect(answers.filter((status) => status === 401)).toHaveLength(HASHES_AT_ONCE + HASHES_WAITING);
  expect(answers.filter((status) => status === 429)).toHaveLength(FLOOD - HASHES_AT_ONCE - HASHES_WAITING);
  // Each of them is told to come back in one second, and the page does that by itself (BUSY_RETRIES in src/account/client.ts).
  for (const answer of await Promise.all(burst)) if (answer.status === 429) expect([answer.retry, JSON.parse(answer.text)]).toEqual(["1", { error: "slow_down" }]);
  expect(stand.most).toBe(STRANGERS_AT_ONCE);
  // The same for sign-ups: the count before the hash takes a place, the hash does not.
  stand.most = 0;
  const signUps = await statuses(times(40, (index) => call("POST", "/api/account/signup", { json: { name: `New ${String(index)}`, password: RIGHT_PASSWORD }, headers: from(`198.51.101.${String(index)}`) })));
  expect(signUps.filter((status) => status === 429).length).toBeGreaterThan(0);
  expect(signUps.every((status) => status === 429 || status === 409)).toBe(true);
  expect(stand.most).toBeLessThanOrEqual(STRANGERS_AT_ONCE);
}, 30_000);

test("when strangers have made their accounts for the ten minutes or the hour, sign-up says so in plain words with how long, and sign-in and this machine go on", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const stand = fixed();
  const { call } = await serve({ accounts: stand.accounts });
  // Every account from another address, so no count per address is in the way.
  let made = 0;
  const signUp = (name = `Hero ${String(made)}`): Promise<Answer> => {
    made += 1;
    return call("POST", "/api/account/signup", { json: { name, password: RIGHT_PASSWORD }, headers: from(`198.51.${String(100 + (made >> 6))}.${String(made & 63)}`) });
  };
  const closed = { error: "signups_closed", message: SIGNUPS_CLOSED_TEXT };

  for (let index = 0; index < SIGNUPS_OVERALL; index += 1) expect((await signUp()).status, String(index)).toBe(201);
  const tenMinutes = await signUp();
  expect([tenMinutes.status, JSON.parse(tenMinutes.text), tenMinutes.retry]).toEqual([429, closed, String(SIGNUP_WINDOW_MS / 1000)]);
  // The words are for a person and say nothing of a name: the same for a name that is taken as for a new one.
  expect(JSON.parse((await signUp("Taken")).text)).toEqual(closed);
  expect(SIGNUPS_CLOSED_TEXT).not.toMatch(/[_{}]|undefined|error/i);
  // Nothing reached the accounts for the closed ones.
  expect(stand.asked.filter((what) => what === "signUp")).toHaveLength(SIGNUPS_OVERALL);
  // Sign-in is not closed, from the same address or any other, and neither is the laptop's own sign-up.
  expect((await call("POST", "/api/account/signin", { json: { name: "Hero 3", password: RIGHT_PASSWORD }, headers: from("198.51.100.3") })).status).toBe(200);
  expect((await call("POST", "/api/account/signup", { json: { name: "Demo Hero", password: RIGHT_PASSWORD } })).status).toBe(201);

  // Ten minutes on: 80 more make the hour's 200, and then it is closed until the hour is over.
  vi.setSystemTime(Date.now() + SIGNUP_WINDOW_MS);
  for (let index = SIGNUPS_OVERALL; index < SIGNUPS_PER_HOUR; index += 1) expect((await signUp()).status, String(index)).toBe(201);
  const hour = await signUp();
  expect([hour.status, JSON.parse(hour.text), hour.retry]).toEqual([429, closed, String(50 * 60)]);
  expect((await call("POST", "/api/account/signin", { json: { name: "Hero 3", password: RIGHT_PASSWORD }, headers: from("198.51.100.3") })).status).toBe(200);
  vi.setSystemTime(Date.now() + 50 * 60 * 1000);
  expect((await signUp()).status).toBe(201);

  // What the database says is answered the same way: as many made this hour or today as may be (429), or as many accounts as it may hold (503).
  const pastTheHour = await signUp("Past The Hour");
  expect([pastTheHour.status, JSON.parse(pastTheHour.text), pastTheHour.retry]).toEqual([429, closed, String(CLOSED_RETRY_S)]);
  const brim = await signUp("Brim");
  expect([brim.status, JSON.parse(brim.text), brim.retry]).toEqual([503, closed, null]);
  // Neither was an account made, so neither used up a place.
  expect((await signUp()).status).toBe(201);
});
