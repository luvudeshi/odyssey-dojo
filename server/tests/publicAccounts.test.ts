// PUBLIC_ACCOUNTS=1 lets a request that was passed on by the server's own proxy reach the account paths and the hall
// of heroes from a socket that is not this machine's: the hosted copy (docs/accounts.md, "On a public server").
// Off, which is the default, the guard is what it has always been. On, it opens those paths and nothing else, a
// caller is counted by the address the proxy took the request from, and the limits hold.
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Deps } from "../app";
import type { Config } from "../env";
import { SIGNINS_PER_NAME, SIGNINS_PER_NAME_AND_ADDRESS } from "../lib/accountLimits";
import { makeToken } from "../lib/accounts";
import type { Accounts } from "../lib/accounts";
import type { Hall, Heroes } from "../lib/heroes";
import { behindOwnProxy, isAccountPath, isHeroesPath, isLoopback, mayAnswer, publicAccounts, wasRelayed } from "../lib/localOnly";
import { MINUTE_MS } from "../lib/roomLimits";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const LAN = "192.168.1.20";
/** The proxy's own address inside Docker, as the game server sees Caddy in deploy/vultr. */
const PROXY = "172.18.0.3";
/**
 * What reaches the game server on the hosted copy. Caddy writes the address it took the request from in
 * X-Forwarded-For; with the page on Vercel that is Vercel's address, and Vercel's own headers (the visitor's address
 * in X-Real-Ip and X-Vercel-Forwarded-For) come through Caddy as they are. `hop` is the address Caddy saw.
 */
const relayedFrom = (hop: string, visitor = "198.51.100.77"): Record<string, string> => ({
  "X-Forwarded-For": hop, "X-Forwarded-Proto": "https", "X-Forwarded-Host": "api.game.example", "X-Real-Ip": visitor, "X-Vercel-Forwarded-For": visitor, "X-Vercel-Id": "dfw1::abcde-1",
});
const VISITOR = relayedFrom("203.0.113.7");
const ACCOUNT_PATHS = [
  "/api/account/status", "/api/account/signup", "/api/account/signin", "/api/account/signout", "/api/account/save", "/api/account/fights", "/api/heroes",
] as const;
/** Every API path that must stay closed to a request that was passed on, flag or no flag. */
const CLOSED = [
  ["POST", "/api/level"], ["POST", "/api/speech"], ["POST", "/api/reveal"], ["GET", "/api/portrait/x"],
  ["POST", "/api/replays"], ["PUT", "/api/replays/abcdefghij/video"], ["GET", "/api/replays/abcdefghij/qr.svg"],
  ["GET", "/api/facetime/status"], ["POST", "/api/facetime/seat"], ["POST", "/api/facetime/call"], ["POST", "/api/facetime/standin"],
  ["POST", "/api/facetime/hangup"], ["GET", "/api/facetime/call/abc"], ["GET", "/api/facetime/waiting"],
  ["GET", "/api/health"], ["POST", "/API/Level"], ["POST", "/api/rooms"], ["GET", "/api/nope"],
  ["GET", "/api/account"], ["GET", "/api/account/admin"], ["POST", "/api/account/save/x"], ["GET", "/api/accounts/status"],
  ["GET", "/api/account/status.json"], ["GET", "/api/heroes/x"], ["GET", "/api/heroesx"], ["GET", "/api/account//save"],
] as const;

const closers: (() => void)[] = [];
const flags = { accounts: process.env.PUBLIC_ACCOUNTS, rooms: process.env.PUBLIC_ROOMS };
afterEach(() => {
  vi.useRealTimers();
  for (const close of closers.splice(0)) close();
  for (const [name, value] of [["PUBLIC_ACCOUNTS", flags.accounts], ["PUBLIC_ROOMS", flags.rooms]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

interface Answer {
  readonly status: number;
  readonly text: string;
  readonly retry: string | null;
  readonly cache: string | null;
}
type Call = (
  method: string, path: string, options?: { json?: unknown; token?: string; headers?: Record<string, string>; socket?: string },
) => Promise<Answer>;

/**
 * The real app, with its real guard, over real HTTP. `flag` is what PUBLIC_ACCOUNTS is set to; undefined leaves it unset.
 * A test cannot open a connection from another machine, so the one thing stood in for is the socket's address: a
 * call that names a `socket` reaches the app with that address as the one the request came from, as a request from
 * the proxy's container or from another device would. A call that names none comes from this machine, as it is.
 */
async function serve(flag: string | undefined, extra: Partial<Deps> = {}): Promise<Call> {
  if (flag === undefined) delete process.env.PUBLIC_ACCOUNTS;
  else process.env.PUBLIC_ACCOUNTS = flag;
  delete process.env.PUBLIC_ROOMS;
  const app = await createApp({ config, ai: NO_AI, ...extra });
  const server = createServer((request, response) => {
    const socket = request.headers["x-test-socket"];
    delete request.headers["x-test-socket"];
    // A connection is used for more than one request, so the stand-in is set for this request and taken off for the next.
    if (typeof socket === "string") Object.defineProperty(request.socket, "remoteAddress", { value: socket, configurable: true });
    else Reflect.deleteProperty(request.socket, "remoteAddress");
    app(request, response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => { server.close(); server.closeAllConnections(); });
  const { port } = server.address() as AddressInfo;
  return async (method, path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
      method,
      headers: {
        ...(options.json === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.token === undefined ? {} : { Authorization: `Bearer ${options.token}` }),
        ...(options.socket === undefined ? {} : { "X-Test-Socket": options.socket }),
        ...options.headers,
      },
      ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
    });
    return { status: response.status, text: await response.text(), retry: response.headers.get("retry-after"), cache: response.headers.get("cache-control") };
  };
}

// The routes run over objects that give fixed answers: not a database, and they store nothing but one save in memory.
const RIGHT_PASSWORD = "the right password";
const KNOWN_TOKEN = makeToken();
const ACCOUNT_ID = "0d15ea5e-0000-4000-8000-000000000000";
const SAVE = { version: 1, profile: { name: "Odysseus", cleared: ["polyphemus"], moves: {}, bestScore: 1840, fights: 1, wins: 1, styles: ["boxer"] }, settings: {}, character: null };
const FIGHT = { stop: "polyphemus", won: true, score: 1840, style: "boxer", god: "athena", seconds: 62.4, bestCombo: 7, hero: "Odysseus" };
const HALL: Hall = {
  at: "2026-11-15T06:00:00.000Z",
  tonight: [{ accountId: ACCOUNT_ID, hero: "Odysseus", score: 1840, stop: "polyphemus", style: "boxer", god: "athena" }],
  allTime: [{ accountId: ACCOUNT_ID, hero: "Odysseus", score: 1840, stop: "polyphemus", style: "boxer", god: "athena" }],
  lastHour: 1, fightsEver: 1, stops: [{ stop: "polyphemus", fights: 1, wins: 1 }],
  activity: { minutes: 10, until: "2026-11-15T06:10:00.000Z", fights: Array.from({ length: 36 }, () => 0) },
};

function standIns(): { readonly accounts: Accounts; readonly heroes: Heroes; readonly asked: string[] } {
  const asked: string[] = [];
  let stored: unknown = null;
  let signedIn = false;
  const accounts: Accounts = {
    available: () => Promise.resolve(true),
    signUp: (name) => {
      asked.push("signUp");
      return Promise.resolve({ token: KNOWN_TOKEN, name });
    },
    signIn: (name, password) => {
      asked.push("signIn");
      return Promise.resolve(password === RIGHT_PASSWORD ? { token: KNOWN_TOKEN, name } : null);
    },
    signOut: () => {
      asked.push("signOut");
      signedIn = false;
      return Promise.resolve();
    },
    accountOf: (token) => {
      asked.push("accountOf");
      signedIn = token === KNOWN_TOKEN;
      return Promise.resolve(token === KNOWN_TOKEN ? ACCOUNT_ID : null);
    },
    remembered: (token) => (signedIn && token === KNOWN_TOKEN ? ACCOUNT_ID : null),
    readSave: () => Promise.resolve({ save: stored as never, updatedAt: stored === null ? null : "2026-11-15T07:00:00.000Z" }),
    writeSave: (_accountId, save) => {
      stored = save;
      return Promise.resolve({ updatedAt: "2026-11-15T07:00:00.000Z" });
    },
    close: () => Promise.resolve(),
  };
  const heroes: Heroes = {
    record: () => {
      asked.push("record");
      return Promise.resolve(true);
    },
    hall: () => Promise.resolve(HALL),
  };
  return { accounts, heroes, asked };
}

test("the flag is on only when PUBLIC_ACCOUNTS is exactly 1", () => {
  expect(publicAccounts({ PUBLIC_ACCOUNTS: "1" })).toBe(true);
  expect(publicAccounts({ PUBLIC_ACCOUNTS: " 1 " })).toBe(true);
  for (const value of [undefined, "", " ", "0", "true", "TRUE", "yes", "on", "2", "01", "11", "1x", "1;", "1.0", "+1"]) {
    expect(publicAccounts({ PUBLIC_ACCOUNTS: value }), String(value)).toBe(false);
  }
  expect(publicAccounts({})).toBe(false);
  // The other flag is another flag: neither turns the other on.
  expect(publicAccounts({ PUBLIC_ROOMS: "1" })).toBe(false);
  // Either one says the server stands behind its own proxy, which is what decides how a caller is counted.
  expect([behindOwnProxy({}), behindOwnProxy({ PUBLIC_ROOMS: "1" }), behindOwnProxy({ PUBLIC_ACCOUNTS: "1" }), behindOwnProxy({ PUBLIC_ACCOUNTS: "true", PUBLIC_ROOMS: "0" })]).toEqual([false, true, true, false]);
});

/** Paths, sockets and header sets for the grid below: every kind of caller against every kind of path. */
const GRID_PATHS = [
  ...ACCOUNT_PATHS, "/API/Account/SignIn", "/api/account/save/", "/Api/Heroes/", ...CLOSED.map(([, path]) => path),
  "/api/rooms/", "/api/rooms/KXTR/join", "/api/rooms/KXTR/events", "/api/rooms/address", "/api/replays/abc", "/", "/replays/abc", "/assets/x.js",
];
const GRID_SOCKETS = ["127.0.0.1", "::1", "::ffff:127.0.0.1", LAN, PROXY, "203.0.113.7", "2001:db8::1", undefined];
const GRID_HEADERS: readonly Record<string, string>[] = [
  {}, { "x-forwarded-for": "203.0.113.7" }, { "x-forwarded-for": "" }, { "x-forwarded-proto": "https" }, { "x-real-ip": "203.0.113.7" },
  { "cf-connecting-ip": "203.0.113.7", "cf-ray": "8f1c2d3e4f5a6b7c-DFW" }, { forwarded: "for=203.0.113.7" }, { via: "1.1 vercel" }, { "x-vercel-id": "dfw1::abcde-1" },
  { authorization: `Bearer ${KNOWN_TOKEN}` }, { "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.77", "x-vercel-forwarded-for": "198.51.100.77" },
];

const GRID_METHODS = ["GET", "POST", "PUT"];

test("flag off: the guard answers every caller exactly as before, with PUBLIC_ROOMS on or off", () => {
  let cells = 0;
  for (const path of GRID_PATHS) {
    for (const address of GRID_SOCKETS) {
      for (const headers of GRID_HEADERS) {
        for (const rooms of [false, true]) {
          for (const method of GRID_METHODS) {
            cells += 1;
            const where = `${method} ${path} from ${String(address)} with ${JSON.stringify(headers)}`;
            // Leaving the flag out and passing false are the same thing.
            expect(mayAnswer(path, address, headers, rooms, method, false), where).toBe(mayAnswer(path, address, headers, rooms, method));
            // The rule as it was before the flag: the account paths and the hall answer a loopback socket and no other.
            const lower = path.toLowerCase();
            if (isAccountPath(lower) || isHeroesPath(lower)) expect(mayAnswer(path, address, headers, rooms, method), where).toBe(isLoopback(address));
          }
        }
      }
    }
  }
  expect(cells).toBe(GRID_PATHS.length * GRID_SOCKETS.length * GRID_HEADERS.length * 2 * GRID_METHODS.length);
  expect(cells).toBeGreaterThan(20_000);
});

test("flag on: the account paths and the hall also answer a request that was passed on to any socket, and no other cell of the grid changes", () => {
  let opened = 0;
  for (const path of GRID_PATHS) {
    for (const address of GRID_SOCKETS) {
      for (const headers of GRID_HEADERS) {
        for (const rooms of [false, true]) {
          for (const method of GRID_METHODS) {
            const where = `${method} ${path} from ${String(address)} with ${JSON.stringify(headers)}`;
            const off = mayAnswer(path, address, headers, rooms, method, false);
            const on = mayAnswer(path, address, headers, rooms, method, true);
            const lower = path.toLowerCase();
            const opens = (isAccountPath(lower) || isHeroesPath(lower)) && wasRelayed(headers) && !isLoopback(address);
            if (opens) {
              opened += 1;
              expect([off, on], where).toEqual([false, true]);
            } else expect(on, where).toBe(off);
          }
        }
      }
    }
  }
  expect(opened).toBeGreaterThan(1_500);
  // Said plainly, for the callers that matter. The proxy's container, with what the proxy adds:
  for (const path of ACCOUNT_PATHS) expect(mayAnswer(path, PROXY, { "x-forwarded-for": "203.0.113.7" }, false, "POST", true), path).toBe(true);
  // Another device with no proxy header is plain HTTP on the network: still refused, so a password never crosses it in the clear by accident.
  for (const path of ACCOUNT_PATHS) expect(mayAnswer(path, LAN, {}, false, "POST", true), path).toBe(false);
  for (const path of ACCOUNT_PATHS) expect(mayAnswer(path, PROXY, { authorization: `Bearer ${KNOWN_TOKEN}` }, false, "POST", true), path).toBe(false);
  // Nothing that spends a key, and nothing beside the named account paths.
  for (const [method, path] of CLOSED) expect(mayAnswer(path, PROXY, { "x-forwarded-for": "203.0.113.7" }, false, method, true), path).toBe(false);
});

test("flag off, over HTTP: from the proxy's socket every account path and the hall are 403, with the flag unset, empty, 0 or true", async () => {
  for (const flag of [undefined, "", "0", "true"]) {
    const stand = standIns();
    const call = await serve(flag, stand);
    for (const path of ACCOUNT_PATHS) {
      for (const method of ["GET", "POST", "PUT"]) {
        const answer = await call(method, path, { headers: VISITOR, socket: PROXY, token: KNOWN_TOKEN });
        expect([answer.status, JSON.parse(answer.text)], `${String(flag)} ${method} ${path}`).toEqual([403, { error: "local_only" }]);
      }
    }
    // Nothing reached the accounts, and this machine is untouched.
    expect(stand.asked).toEqual([]);
    expect(JSON.parse((await call("GET", "/api/account/status")).text)).toEqual({ available: true });
    expect((await call("GET", "/api/health")).status).toBe(200);
    for (const close of closers.splice(0)) close();
  }
});

test("flag on, over HTTP: through the proxy a visitor signs up, signs in, saves, reads the save back, records a fight, reads the hall and signs out", async () => {
  const stand = standIns();
  const call = await serve("1", stand);
  const through = { headers: VISITOR, socket: PROXY };

  const status = await call("GET", "/api/account/status", through);
  expect([status.status, JSON.parse(status.text), status.cache]).toEqual([200, { available: true }, "no-store"]);
  const made = await call("POST", "/api/account/signup", { ...through, json: { name: "Odysseus", password: RIGHT_PASSWORD } });
  expect([made.status, JSON.parse(made.text), made.cache]).toEqual([201, { token: KNOWN_TOKEN, name: "Odysseus" }, "no-store"]);
  const signed = await call("POST", "/api/account/signin", { ...through, json: { name: "Odysseus", password: RIGHT_PASSWORD } });
  expect([signed.status, JSON.parse(signed.text)]).toEqual([200, { token: KNOWN_TOKEN, name: "Odysseus" }]);
  expect((await call("PUT", "/api/account/save", { ...through, token: KNOWN_TOKEN, json: { save: SAVE } })).status).toBe(200);
  const read = await call("GET", "/api/account/save", { ...through, token: KNOWN_TOKEN });
  expect([read.status, JSON.parse(read.text)]).toEqual([200, { save: SAVE, updatedAt: "2026-11-15T07:00:00.000Z" }]);
  const fight = await call("POST", "/api/account/fights", { ...through, token: KNOWN_TOKEN, json: { fight: FIGHT } });
  expect([fight.status, JSON.parse(fight.text)]).toEqual([201, { recorded: true }]);
  const hall = await call("GET", "/api/heroes", { ...through, token: KNOWN_TOKEN });
  expect(hall.status).toBe(200);
  expect((JSON.parse(hall.text) as { tonight: unknown[] }).tonight).toEqual([{ hero: "Odysseus", score: 1840, stop: "polyphemus", style: "boxer", god: "athena", you: true }]);
  // No account id in it, and nothing on the way may keep a copy.
  expect(hall.text).not.toContain(ACCOUNT_ID);
  expect(hall.cache).toBe("no-store");
  expect((await call("POST", "/api/account/signout", { ...through, token: KNOWN_TOKEN })).status).toBe(204);
  expect(stand.asked).toContain("signOut");
  // A wrong password and a missing session read as they do everywhere.
  const wrong = await call("POST", "/api/account/signin", { ...through, json: { name: "Odysseus", password: "not the password" } });
  expect([wrong.status, JSON.parse(wrong.text)]).toEqual([401, { error: "wrong_name_or_password" }]);
  expect((await call("GET", "/api/account/save", through)).status).toBe(401);
});

test("flag on, over HTTP: AI, speech, the god scan, FaceTime, replay upload, health and making a room stay closed, and so does a caller with no proxy header", async () => {
  const stand = standIns();
  const call = await serve("1", stand);
  for (const socket of [PROXY, undefined]) {
    for (const [method, path] of CLOSED) {
      const answer = await call(method, path, { headers: VISITOR, ...(socket === undefined ? {} : { socket }) });
      expect([answer.status, JSON.parse(answer.text)], `${method} ${path} from ${String(socket)}`).toEqual([403, { error: "local_only" }]);
    }
  }
  // One proxy header of any kind is still enough to close a spending route.
  for (const header of ["X-Real-Ip", "Forwarded", "Via", "X-Forwarded-Host", "X-Forwarded-Proto"]) {
    expect((await call("POST", "/api/level", { headers: { [header]: "x" }, socket: PROXY })).status, header).toBe(403);
  }
  // Another device on the network, or the proxy's address with no proxy header at all: plain HTTP, refused.
  for (const socket of [LAN, PROXY]) {
    for (const path of ACCOUNT_PATHS) {
      const answer = await call("GET", path, { socket, token: KNOWN_TOKEN });
      expect([answer.status, JSON.parse(answer.text)], `${path} from ${socket}`).toEqual([403, { error: "local_only" }]);
    }
  }
  expect(stand.asked).toEqual([]);
  // This machine still reaches everything it did.
  expect((await call("GET", "/api/health")).status).toBe(200);
  expect((await call("GET", "/api/account/status")).status).toBe(200);
});

test("flag on: a caller is the address the proxy took the request from, so one caller's wrong passwords do not hold another's, and what a caller writes in front changes nothing", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const stand = standIns();
  const call = await serve("1", stand);
  const signIn = (hop: string, password: string, name = "Odysseus"): Promise<Answer> =>
    call("POST", "/api/account/signin", { headers: relayedFrom(hop), socket: PROXY, json: { name, password } });

  // A guesser who calls the server's own name arrives with an address of their own.
  for (let index = 0; index < SIGNINS_PER_NAME_AND_ADDRESS; index += 1) expect((await signIn("203.0.113.66", "a wrong password")).status, String(index)).toBe(401);
  const held = await signIn("203.0.113.66", "a wrong password");
  expect([held.status, JSON.parse(held.text), held.retry]).toEqual([429, { error: "slow_down" }, "60"]);
  // Addresses written in front of the proxy's own entry, or in the headers a host adds, give no fresh budget.
  expect((await signIn("198.51.100.1, 203.0.113.66", "a wrong password")).status).toBe(429);
  expect((await call("POST", "/api/account/signin", {
    headers: { ...relayedFrom("203.0.113.66", "192.0.2.200"), "Cf-Connecting-Ip": "192.0.2.201" }, socket: PROXY, json: { name: "Odysseus", password: "a wrong password" },
  })).status).toBe(429);
  // The owner, who comes through another address, signs in.
  expect((await signIn("203.0.113.7", RIGHT_PASSWORD)).status).toBe(200);

  // Without the flag every one of these callers would be one caller, the proxy's address: the first test of this file shows they are refused outright.
  // With it, callers who really share an address are one caller. Behind a host that passes /api on (Vercel), that is
  // every visitor of the page: five wrong passwords through the page hold the name for the others who come through it.
  for (let index = 0; index < SIGNINS_PER_NAME_AND_ADDRESS; index += 1) expect((await signIn("203.0.113.7", "a wrong password", "Penelope")).status).toBe(401);
  const owner = await signIn("203.0.113.7", RIGHT_PASSWORD, "Penelope");
  // What the owner sees on a browser that is not signed in yet: wait, for a minute at most.
  expect([owner.status, JSON.parse(owner.text), owner.retry]).toEqual([429, { error: "slow_down" }, "60"]);
  // A browser that is already signed in is not touched by any of it: its save is read and written as before.
  expect((await call("GET", "/api/account/save", { headers: relayedFrom("203.0.113.7"), socket: PROXY, token: KNOWN_TOKEN })).status).toBe(200);
  expect((await call("PUT", "/api/account/save", { headers: relayedFrom("203.0.113.7"), socket: PROXY, token: KNOWN_TOKEN, json: { save: SAVE } })).status).toBe(200);
  // A minute after the wrong passwords began the name is free again, whatever was sent meanwhile.
  vi.setSystemTime(Date.now() + MINUTE_MS);
  expect((await signIn("203.0.113.7", RIGHT_PASSWORD, "Penelope")).status).toBe(200);
});

test("with the proxy inside the server's own network (a loopback socket): either setting makes the proxy's own entry the caller, and a made-up Cf-Connecting-Ip buys nothing", async () => {
  // Caddy with network_mode "service:game" reaches the game at 127.0.0.1, as a tunnel on a laptop does. The account
  // paths then answer with or without the flag. What the flag changes there is who is counted.
  const guess = (call: Call, index: number): Promise<Answer> => call("POST", "/api/account/signin", {
    headers: { ...relayedFrom("203.0.113.66"), "Cf-Connecting-Ip": `192.0.2.${String(index)}` }, json: { name: "Odysseus", password: "a wrong password" },
  });
  for (const [accounts, rooms] of [["1", undefined], [undefined, "1"], ["1", "1"]] as const) {
    const call = await serve(accounts, standIns());
    if (rooms !== undefined) process.env.PUBLIC_ROOMS = rooms;
    for (let index = 0; index < SIGNINS_PER_NAME_AND_ADDRESS; index += 1) expect((await guess(call, index)).status, `${String(accounts)} ${String(rooms)} ${String(index)}`).toBe(401);
    expect((await guess(call, 99)).status, `${String(accounts)} ${String(rooms)}`).toBe(429);
    // The spending routes are closed from there as from anywhere, and this machine's own requests carry no proxy header.
    expect((await call("POST", "/api/level", { headers: relayedFrom("203.0.113.66"), json: {} })).status).toBe(403);
    expect((await call("GET", "/api/health")).status).toBe(200);
    for (const close of closers.splice(0)) close();
  }
  // With neither setting the server takes that proxy for a tunnel and believes the header: every made-up value is a new caller.
  // Only the count for the name over all callers still stops the guesses. This is why a public server sets the flag.
  const call = await serve(undefined, standIns());
  const answers: number[] = [];
  for (let index = 0; index < SIGNINS_PER_NAME + 2; index += 1) answers.push((await guess(call, index)).status);
  expect(answers.filter((status) => status === 401)).toHaveLength(SIGNINS_PER_NAME);
  expect(answers.slice(SIGNINS_PER_NAME)).toEqual([429, 429]);
});

// The doc's commands read the connection string from the environment, and one is run on the public server right after
// the string was typed in by hand. Node's own "Invalid URL" error prints the whole string it was given, password and
// all; a slip of the hand must never put that on a screen. So each command is run here as the doc has it, with a
// made-up string that is no URL. Nothing is reached: the command stops at its first statement.
test("no command in the doc prints the connection string when the string is not a URL", () => {
  const doc = readFileSync(new URL("../../docs/accounts.md", import.meta.url), "utf8");
  const commands = [...doc.matchAll(/^\s*node (?:--env-file=\.env )?-e "(.*)"\s*$/gm)].map((found) => found[1] ?? "").filter((script) => script.includes("DATABASE_URL"));
  // The laptop's CA file, the public server's CA file, and the database tests.
  expect(commands).toHaveLength(3);
  const user = "madeupuser7", password = "madeuppass7", host = "madeup-host7.example";
  for (const bad of [`postgres://${user}:${password}@${host}:notaport/tsdb?sslmode=require`, `postgres://${user}:${password}@${host} :5432/tsdb`, ""]) {
    for (const script of commands) {
      const ran = spawnSync(process.execPath, ["-e", script], { env: { PATH: process.env.PATH ?? "", DATABASE_URL: bad }, encoding: "utf8", timeout: 20_000 });
      const said = ran.stdout + ran.stderr;
      expect(ran.status, said.slice(0, 200)).toBe(1);
      expect(said.trim()).toBe("DATABASE_URL is not a URL");
      for (const part of [user, password, host]) expect(said).not.toContain(part);
    }
  }
});
