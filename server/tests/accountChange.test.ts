// The two routes that change an account: rename (the sign-in name) and password. Every status each can answer, the limits on
// them, and what the rules and the memory of known sessions do. The routes run over an Accounts object that gives scripted
// answers: it is not a database. What the real statements do is in accountsDb.test.ts, against a real Postgres.
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { afterEach, expect, test } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import {
  RENAMES_PER_ACCOUNT, WRONG_PASSWORDS_PER_ACCOUNT, WRONG_PASSWORD_WINDOW_MS, Busy, createAccountLimits, createKnownSessions,
} from "../lib/accountLimits";
import { nameKey, parsePasswordChange, parseRename } from "../lib/accountRules";
import { Unavailable, makeToken } from "../lib/accounts";
import type { Accounts } from "../lib/accounts";
import { THIS_MACHINE } from "../lib/roomLimits";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const KNOWN_TOKEN = makeToken();
const ACCOUNT_ID = "0d15ea5e-0000-4000-8000-000000000000";
const OTHER_ID = "0d15ea5e-0000-4000-8000-000000000001";
const RIGHT = "the right password";
const NEXT = "a brand new password";
const TUNNEL = { "Cf-Ray": "8f1c2d3e4f5a6b7c-DFW", "X-Forwarded-Proto": "https" };
const from = (address: string): Record<string, string> => ({ ...TUNNEL, "Cf-Connecting-Ip": address, "X-Forwarded-For": address });

const closers: (() => void)[] = [];
afterEach(() => { for (const close of closers.splice(0)) close(); });

interface Stand {
  readonly accounts: Accounts;
  /** What reached rename and changePassword, in order. Passwords are not written down: only whether they were the right ones. */
  readonly renamed: (readonly [string, string])[];
  readonly changed: (readonly [string, boolean, string])[];
  /** What the next call does instead of what it would: a failure, a full gate, an account that is gone. */
  next: "ok" | "unavailable" | "busy" | "gone" | "conflict";
}

function stand(): Stand {
  const never = (): never => { throw new Error("not part of these tests"); };
  const scripted = <T>(value: T, gone: T): Promise<T> => {
    if (made.next === "unavailable") return Promise.reject(new Unavailable());
    if (made.next === "busy") return Promise.reject(new Busy());
    return Promise.resolve(made.next === "gone" ? gone : value);
  };
  const made: Stand = {
    renamed: [], changed: [], next: "ok",
    accounts: {
      available: () => Promise.resolve(true),
      signUp: never, signIn: never, signOut: never, readSave: never, writeSave: never,
      accountOf: (token) => Promise.resolve(token === KNOWN_TOKEN ? ACCOUNT_ID : null),
      remembered: () => null,
      rename: (accountId, name) => {
        made.renamed.push([accountId, name]);
        return scripted(nameKey(name) === "taken name" ? "name_taken" as const : { name }, "gone" as const);
      },
      changePassword: (accountId, current, _next, keepToken) => {
        made.changed.push([accountId, current === RIGHT, keepToken]);
        if (made.next === "conflict") return Promise.resolve("conflict" as const);
        return scripted(current === RIGHT ? "changed" as const : "wrong_password" as const, "gone" as const);
      },
      close: () => Promise.resolve(),
    },
  };
  return made;
}

interface Answer {
  readonly status: number;
  readonly body: unknown;
  readonly retry: string | null;
}

async function serve(accounts?: Accounts): Promise<(path: string, json: unknown, options?: { token?: string | null; headers?: Record<string, string>; text?: string }) => Promise<Answer>> {
  const app: Express = await createApp({ config, ai: NO_AI, ...(accounts === undefined ? {} : { accounts }) });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => { server.close(); server.closeAllConnections(); });
  const port = (server.address() as AddressInfo).port;
  return async (path, json, options = {}) => {
    const token = options.token === undefined ? KNOWN_TOKEN : options.token;
    const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token === null ? {} : { Authorization: `Bearer ${token}` }), ...options.headers },
      body: options.text ?? JSON.stringify(json),
    });
    const text = await response.text();
    return { status: response.status, body: text === "" ? null : JSON.parse(text) as unknown, retry: response.headers.get("retry-after") };
  };
}

const RENAME = "/api/account/rename";
const PASSWORD = "/api/account/password";

test("rename: 200 with the name as stored, the cleaned one, for the account the token belongs to", async () => {
  const s = stand();
  const post = await serve(s.accounts);
  expect(await post(RENAME, { name: "  Penelope  " })).toEqual({ status: 200, body: { name: "Penelope" }, retry: null });
  // The same name in other letters is not refused here: whether it is the account's own is for the store, which checks the key.
  expect((await post(RENAME, { name: "PENELOPE" })).body).toEqual({ name: "PENELOPE" });
  expect(s.renamed).toEqual([[ACCOUNT_ID, "Penelope"], [ACCOUNT_ID, "PENELOPE"]]);
});

test("rename: 400 for a name that fails the sign-up rules, a body that is not one, and a body that is too long; nothing reaches the store", async () => {
  const s = stand();
  const post = await serve(s.accounts);
  for (const json of [{ name: "ab" }, { name: "x".repeat(2) + "​" }, { name: "   " }, { name: 5 }]) {
    expect(await post(RENAME, json), JSON.stringify(json)).toEqual({ status: 400, body: { error: "invalid", field: json.name === 5 ? "body" : "name" }, retry: null });
  }
  for (const json of [{}, [], "Penelope", null]) expect((await post(RENAME, json)).body, JSON.stringify(json)).toEqual({ error: "invalid", field: "body" });
  expect((await post(RENAME, null, { text: "{not json" })).body).toEqual({ error: "invalid", field: "body" });
  expect((await post(RENAME, { name: "Penelope", pad: "p".repeat(3_000) })).body).toEqual({ error: "invalid", field: "body" });
  expect(s.renamed).toEqual([]);
});

test("rename: 409 name_taken, 401 signed_out with no valid session or an account that is gone, 503 unavailable", async () => {
  const s = stand();
  const post = await serve(s.accounts);
  expect(await post(RENAME, { name: "Taken Name" })).toEqual({ status: 409, body: { error: "name_taken" }, retry: null });
  expect((await post(RENAME, { name: "Taken  NAME" })).status).toBe(409);
  for (const token of [null, makeToken(), "not-a-token"]) expect(await post(RENAME, { name: "Penelope" }, { token }), String(token)).toEqual({ status: 401, body: { error: "signed_out" }, retry: null });
  s.next = "gone";
  expect(await post(RENAME, { name: "Penelope" })).toEqual({ status: 401, body: { error: "signed_out" }, retry: null });
  s.next = "unavailable";
  expect(await post(RENAME, { name: "Penelope" })).toEqual({ status: 503, body: { error: "unavailable" }, retry: null });
  // With no database at all the answer is the same one every account route gives.
  const off = await serve();
  expect(await off(RENAME, { name: "Penelope" })).toEqual({ status: 503, body: { error: "unavailable" }, retry: null });
});

test("rename: past RENAMES_PER_ACCOUNT a minute the account is told to slow down, and another account is not", async () => {
  const s = stand();
  const post = await serve(s.accounts);
  for (let index = 0; index < RENAMES_PER_ACCOUNT; index += 1) expect((await post(RENAME, { name: `Penelope ${String(index)}` })).status).toBe(200);
  const slow = await post(RENAME, { name: "Penelope again" });
  expect(slow.status).toBe(429);
  expect(slow.body).toEqual({ error: "slow_down" });
  expect(Number(slow.retry)).toBeGreaterThan(0);
  expect(s.renamed).toHaveLength(RENAMES_PER_ACCOUNT);
});

test("rename: a visitor through the tunnel who sends too many requests is counted by address before the session is looked up", async () => {
  const s = stand();
  const post = await serve(s.accounts);
  const answers: number[] = [];
  for (let index = 0; index < 70; index += 1) answers.push((await post(RENAME, { name: "Penelope" }, { token: null, headers: from("203.0.113.9") })).status);
  expect(answers.slice(0, 60)).toEqual(Array.from({ length: 60 }, () => 401));
  expect(answers.slice(60).every((status) => status === 429)).toBe(true);
  // Another address is not held by it.
  expect((await post(RENAME, { name: "Penelope" }, { headers: from("203.0.113.10") })).status).toBe(200);
});

test("password: 204 with nothing in the answer, and the caller's own token is the one kept", async () => {
  const s = stand();
  const post = await serve(s.accounts);
  expect(await post(PASSWORD, { current: RIGHT, next: NEXT })).toEqual({ status: 204, body: null, retry: null });
  expect(s.changed).toEqual([[ACCOUNT_ID, true, KNOWN_TOKEN]]);
});

test("password: 400 for a new password outside 8 to 200, and for a current one that is missing or not text; 403 is only for a wrong one", async () => {
  const s = stand();
  const post = await serve(s.accounts);
  const bad: readonly [unknown, string][] = [
    [{ current: RIGHT, next: "short" }, "next"], [{ current: RIGHT, next: "x".repeat(201) }, "next"], [{ current: RIGHT }, "next"], [{ current: RIGHT, next: 12345678 }, "next"],
    [{ next: NEXT }, "current"], [{ current: 5, next: NEXT }, "current"], [{ current: null, next: NEXT }, "current"], [{ current: "x".repeat(201), next: NEXT }, "current"],
    [{}, "current"], [[], "body"], ["text", "body"], [null, "body"],
  ];
  for (const [json, field] of bad) expect(await post(PASSWORD, json), JSON.stringify(json)).toEqual({ status: 400, body: { error: "invalid", field }, retry: null });
  expect((await post(PASSWORD, null, { text: "{nope" })).body).toEqual({ error: "invalid", field: "body" });
  expect((await post(PASSWORD, { current: RIGHT, next: NEXT, pad: "p".repeat(3_000) })).body).toEqual({ error: "invalid", field: "body" });
  expect(s.changed).toEqual([]);
  // A current password of any length up to 200 reaches the check, and a wrong one is 403, not 401.
  expect(await post(PASSWORD, { current: "x", next: NEXT })).toEqual({ status: 403, body: { error: "wrong_password" }, retry: null });
});

test("password: 401 signed_out with no valid session or an account that is gone, 503 unavailable, 429 when the hash gate is full", async () => {
  const s = stand();
  const post = await serve(s.accounts);
  for (const token of [null, makeToken()]) expect(await post(PASSWORD, { current: RIGHT, next: NEXT }, { token }), String(token)).toEqual({ status: 401, body: { error: "signed_out" }, retry: null });
  s.next = "gone";
  expect((await post(PASSWORD, { current: RIGHT, next: NEXT })).status).toBe(401);
  s.next = "unavailable";
  expect(await post(PASSWORD, { current: RIGHT, next: NEXT })).toEqual({ status: 503, body: { error: "unavailable" }, retry: null });
  s.next = "busy";
  const busy = await post(PASSWORD, { current: RIGHT, next: NEXT });
  expect([busy.status, busy.body, busy.retry]).toEqual([429, { error: "slow_down" }, "1"]);
  const off = await serve();
  expect(await off(PASSWORD, { current: RIGHT, next: NEXT })).toEqual({ status: 503, body: { error: "unavailable" }, retry: null });
});

test("password: a stranger gets WRONG_PASSWORDS_PER_ACCOUNT wrong tries, then 429 for every try, right or wrong; this machine is never held", async () => {
  const s = stand();
  const post = await serve(s.accounts);
  const visitor = from("203.0.113.20");
  for (let index = 0; index < WRONG_PASSWORDS_PER_ACCOUNT; index += 1) {
    expect((await post(PASSWORD, { current: "wrong", next: NEXT }, { headers: visitor })).status).toBe(403);
  }
  const held = await post(PASSWORD, { current: RIGHT, next: NEXT }, { headers: visitor });
  expect([held.status, held.body, Number(held.retry) > 0]).toEqual([429, { error: "slow_down" }, true]);
  // The hash was not spent on it, and another address is held too: the count is the account's, not the address's.
  expect(s.changed).toHaveLength(WRONG_PASSWORDS_PER_ACCOUNT);
  expect((await post(PASSWORD, { current: RIGHT, next: NEXT }, { headers: from("203.0.113.21") })).status).toBe(429);
  // The laptop's own browser sends no relay header and is not counted.
  for (let index = 0; index < 3 * WRONG_PASSWORDS_PER_ACCOUNT; index += 1) expect((await post(PASSWORD, { current: "wrong", next: NEXT })).status).toBe(403);
  expect((await post(PASSWORD, { current: RIGHT, next: NEXT })).status).toBe(204);
});

test("password: a right password and a try that never reached a check are given back, so only wrong ones are held", async () => {
  const s = stand();
  const post = await serve(s.accounts);
  const visitor = from("203.0.113.30");
  for (let index = 0; index < 3 * WRONG_PASSWORDS_PER_ACCOUNT; index += 1) {
    expect((await post(PASSWORD, { current: RIGHT, next: NEXT }, { headers: visitor })).status).toBe(204);
  }
  s.next = "busy";
  for (let index = 0; index < 3 * WRONG_PASSWORDS_PER_ACCOUNT; index += 1) expect((await post(PASSWORD, { current: "wrong", next: NEXT }, { headers: visitor })).status).toBe(429);
  s.next = "ok";
  expect((await post(PASSWORD, { current: "wrong", next: NEXT }, { headers: visitor })).status).toBe(403);
});

test("password: 409 conflict when another change got in first, and it counts as no wrong try", async () => {
  const s = stand();
  const post = await serve(s.accounts);
  const visitor = from("203.0.113.40");
  s.next = "conflict";
  for (let index = 0; index < 3 * WRONG_PASSWORDS_PER_ACCOUNT; index += 1) {
    expect(await post(PASSWORD, { current: RIGHT, next: NEXT }, { headers: visitor })).toEqual({ status: 409, body: { error: "conflict" }, retry: null });
  }
  s.next = "ok";
  expect((await post(PASSWORD, { current: "wrong", next: NEXT }, { headers: visitor })).status).toBe(403);
});

test("the wrong-password count is per account and runs out with its window", () => {
  let clock = 1_000_000;
  const limits = createAccountLimits(() => clock, () => false);
  const stranger = "203.0.113.40";
  for (let index = 0; index < WRONG_PASSWORDS_PER_ACCOUNT; index += 1) expect(limits.password(stranger, ACCOUNT_ID)).toBe(0);
  expect(limits.password(stranger, ACCOUNT_ID)).toBe(WRONG_PASSWORD_WINDOW_MS / 1000);
  // Another account, and this machine, are not held by it.
  expect(limits.password(stranger, OTHER_ID)).toBe(0);
  expect(limits.password(THIS_MACHINE, ACCOUNT_ID)).toBe(0);
  clock += WRONG_PASSWORD_WINDOW_MS - 1_000;
  expect(limits.password(stranger, ACCOUNT_ID)).toBe(1);
  clock += 1_000;
  expect(limits.password(stranger, ACCOUNT_ID)).toBe(0);
  // A right password gives its count back.
  limits.passwordRight(stranger, ACCOUNT_ID);
  limits.passwordRight(THIS_MACHINE, ACCOUNT_ID);
  expect(limits.password(stranger, ACCOUNT_ID)).toBe(0);
});

test("the memory of known sessions forgets every session of an account but the one kept", () => {
  let clock = 0;
  const known = createKnownSessions(() => clock);
  known.remember("a", ACCOUNT_ID);
  known.remember("b", ACCOUNT_ID);
  known.remember("c", OTHER_ID);
  known.forgetAccount(ACCOUNT_ID, "b");
  expect([known.get("a"), known.get("b"), known.get("c")]).toEqual([null, ACCOUNT_ID, OTHER_ID]);
  known.forgetAccount(ACCOUNT_ID, "none of them");
  expect(known.get("b")).toBeNull();
  expect(known.get("c")).toBe(OTHER_ID);
});

test("forgetting an account raises the epoch, so a lookup begun before it can tell its answer is old", () => {
  const known = createKnownSessions(() => 0);
  const before = known.epoch();
  known.remember("a", ACCOUNT_ID);
  known.forget("a");
  expect(known.epoch()).toBe(before);
  known.forgetAccount(ACCOUNT_ID, "x");
  expect(known.epoch()).toBe(before + 1);
});

test("a new name goes by the sign-up rule, and a change of password body by 8 to 200 characters", () => {
  expect(parseRename({ name: " Penelope " })).toEqual({ name: "Penelope" });
  expect(parseRename({ name: "ab" })).toEqual({ field: "name" });
  expect(parseRename({ name: 3 })).toEqual({ field: "body" });
  expect(parseRename(null)).toEqual({ field: "body" });
  expect(parsePasswordChange({ current: "x", next: "12345678", extra: 1 })).toEqual({ current: "x", next: "12345678" });
  expect(parsePasswordChange({ current: "", next: "x".repeat(200) })).toEqual({ current: "", next: "x".repeat(200) });
  expect(parsePasswordChange({ current: "x", next: "1234567" })).toEqual({ field: "next" });
  expect(parsePasswordChange({ next: "12345678" })).toEqual({ field: "current" });
  expect(parsePasswordChange({})).toEqual({ field: "current" });
  expect(parsePasswordChange(undefined)).toEqual({ field: "body" });
});
