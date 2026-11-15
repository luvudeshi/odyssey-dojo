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
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Deps } from "../app";
import { loadConfig } from "../env";
import type { Config } from "../env";
import { createAccounts, makeToken } from "../lib/accounts";
import { dbSecrets } from "../lib/db";
import type { Db } from "../lib/db";
import { isAccountPath, isOpenPath, isTunnelPath, mayAnswer } from "../lib/localOnly";
import { createRedactor } from "../lib/redact";
import { smallBody } from "../routes/account";
import { captureLog } from "./support/drill";

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
const PATHS = ["/api/account/status", "/api/account/signup", "/api/account/signin", "/api/account/signout", "/api/account/save"];
const CREDENTIALS = { name: "Odysseus", password: "nine oars and a sail" };
const SAVE = { save: { version: 1, profile: { name: "Odysseus", cleared: [], moves: {}, bestScore: 0, fights: 0, wins: 0 }, settings: {}, character: null } };

const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

interface Answer {
  readonly status: number;
  readonly text: string;
  readonly cache: string | null;
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
    return { status: response.status, text: await response.text(), cache: response.headers.get("cache-control") };
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
  // Said once, however many requests came: without the driver installed "no_driver", with it "no_answer".
  expect(log.lines.filter((line) => line.includes("accounts_unavailable"))).toHaveLength(1);
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
  const accounts = createAccounts(() => Promise.resolve(refusing), { redact: createRedactor(dbSecrets(SECRET_URL)) });
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

test("the account paths, and only those, are open to another device and to a request that was passed on", () => {
  const relayed = { "cf-ray": "8f1c2d3e4f5a6b7c-DFW", "cf-connecting-ip": "203.0.113.7" };
  for (const path of [...PATHS, "/API/Account/Status", "/api/account/save/", "/Api/Account/SignIn", "/api/account/signout/"]) {
    expect(mayAnswer(path, LAN), path).toBe(true);
    expect(mayAnswer(path, "127.0.0.1", relayed), path).toBe(true);
    expect(mayAnswer(path, LAN, relayed), path).toBe(true);
    expect(mayAnswer(path, undefined, relayed), path).toBe(true);
    // The app gives its 6 MB JSON parser to every /api/ path that is not open, so these read only their own small bodies.
    expect([isAccountPath(path.toLowerCase()), isOpenPath(path.toLowerCase()), isTunnelPath(path.toLowerCase())], path).toEqual([true, true, true]);
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
  // Opening them opened nothing else to a visitor through the tunnel.
  for (const path of ["/api/level", "/api/speech", "/api/reveal", "/api/portrait/x", "/api/rooms", "/api/health", "/api/replays/abc"]) {
    expect(mayAnswer(path, "127.0.0.1", relayed), path).toBe(false);
  }
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
