// The browser's client for /api/account/* (src/account/client.ts): what it sends, and what it makes of every answer
// in the contract. The fetch is made up; no server runs.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createAccountClient } from "../src/account/client";
import type { AccountFetch } from "../src/account/client";
import { SAVE_MAX_BYTES } from "../src/account/contracts";
import type { Save } from "../src/account/contracts";

type Init = Parameters<AccountFetch>[1];
const TOKEN = "t".repeat(43);
const SAVE: Save = { version: 1, profile: { name: "Luv", cleared: ["polyphemus"], moves: { jab: 2 }, bestScore: 10, fights: 1, wins: 1 }, settings: { mirror: true }, character: "zeus" };

/** A client whose server always gives one answer, and the requests it was sent. */
function answering(status: number, body?: unknown) {
  const sent: { url: string; init: Init }[] = [];
  const fetch: AccountFetch = (url, init) => {
    sent.push({ url, init });
    return Promise.resolve({ status, json: () => (body === undefined ? Promise.reject(new SyntaxError("no JSON")) : Promise.resolve(body)) });
  };
  return { client: createAccountClient(fetch), sent };
}

test("status is true only for a 200 that says available; every other answer is false", async () => {
  expect(await answering(200, { available: true }).client.status()).toBe(true);
  expect(await answering(200, { available: false }).client.status()).toBe(false);
  // A static host that answers every path with its page, a proxy with no server behind it, a server with no such route.
  for (const [status, body] of [[200, undefined], [200, { ok: true }], [200, "<!doctype html>"], [404, { error: "not_found" }], [500, undefined], [502, undefined], [503, { available: true }]] as const) {
    expect(await answering(status, body).client.status(), `${String(status)} ${JSON.stringify(body)}`).toBe(false);
  }
  const { client, sent } = answering(200, { available: true });
  await client.status();
  expect(sent[0]?.url).toBe("/api/account/status");
  expect(sent[0]?.init.method).toBe("GET");
  expect(sent[0]?.init.headers).toEqual({});
  expect(sent[0]?.init.signal).toBeInstanceOf(AbortSignal);
});

test("sign-up: 201 gives the session; 400, 409, 429 and 503 are named", async () => {
  const made = answering(201, { token: TOKEN, name: "Luv" });
  expect(await made.client.signUp("Luv", "correct horse")).toEqual({ ok: true, value: { token: TOKEN, name: "Luv" } });
  expect(made.sent[0]?.url).toBe("/api/account/signup");
  expect(made.sent[0]?.init.method).toBe("POST");
  expect(made.sent[0]?.init.headers).toEqual({ "Content-Type": "application/json" });
  expect((JSON.parse(made.sent[0]?.init.body ?? "") as unknown)).toEqual({ name: "Luv", password: "correct horse" });
  expect(await answering(400, { error: "invalid", field: "password" }).client.signUp("Luv", "x")).toEqual({ ok: false, error: "invalid", field: "password" });
  expect(await answering(400, { error: "invalid" }).client.signUp("Luv", "x")).toEqual({ ok: false, error: "invalid" });
  expect(await answering(409, { error: "name_taken" }).client.signUp("Luv", "x")).toEqual({ ok: false, error: "name_taken" });
  expect(await answering(429, { error: "slow_down" }).client.signUp("Luv", "x")).toEqual({ ok: false, error: "slow_down" });
  expect(await answering(503, { error: "unavailable" }).client.signUp("Luv", "x")).toEqual({ ok: false, error: "unavailable" });
  // The server makes no new accounts for now: said by name, with a 429 (try later) or a 503 (the database is full).
  expect(await answering(429, { error: "signups_closed", message: "No new accounts can be made right now." }).client.signUp("Luv", "x")).toEqual({ ok: false, error: "signups_closed" });
  expect(await answering(503, { error: "signups_closed" }).client.signUp("Luv", "x")).toEqual({ ok: false, error: "signups_closed" });
  // Only those two statuses carry it, and a body that is not an object is read by its status as before.
  expect(await answering(400, { error: "signups_closed" }).client.signUp("Luv", "x")).toEqual({ ok: false, error: "invalid" });
  expect(await answering(429, "signups_closed").client.signUp("Luv", "x")).toEqual({ ok: false, error: "slow_down" });
  expect(await answering(429).client.signUp("Luv", "x")).toEqual({ ok: false, error: "slow_down" });
  // The right status with the wrong body is not a session.
  expect(await answering(201, { name: "Luv" }).client.signUp("Luv", "x")).toEqual({ ok: false, error: "unreachable" });
  expect(await answering(200, { token: TOKEN, name: "Luv" }).client.signUp("Luv", "x")).toEqual({ ok: false, error: "unreachable" });
});

test("sign-in: 200 gives the session; 401, 429 and 503 are named", async () => {
  const made = answering(200, { token: TOKEN, name: "Luv" });
  expect(await made.client.signIn("luv", "correct horse")).toEqual({ ok: true, value: { token: TOKEN, name: "Luv" } });
  expect(made.sent[0]?.url).toBe("/api/account/signin");
  expect(await answering(401, { error: "wrong_name_or_password" }).client.signIn("Luv", "x")).toEqual({ ok: false, error: "wrong_name_or_password" });
  expect(await answering(429, { error: "slow_down" }).client.signIn("Luv", "x")).toEqual({ ok: false, error: "slow_down" });
  expect(await answering(503, { error: "unavailable" }).client.signIn("Luv", "x")).toEqual({ ok: false, error: "unavailable" });
  expect(await answering(500).client.signIn("Luv", "x")).toEqual({ ok: false, error: "unreachable" });
  expect(await answering(200, { token: "short", name: "Luv" }).client.signIn("Luv", "x")).toEqual({ ok: false, error: "unreachable" });
});

test("sign-out sends the token and never fails, whatever comes back", async () => {
  const done = answering(204);
  await expect(done.client.signOut(TOKEN)).resolves.toBeUndefined();
  expect(done.sent[0]?.url).toBe("/api/account/signout");
  expect(done.sent[0]?.init.method).toBe("POST");
  expect(done.sent[0]?.init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  await expect(answering(500).client.signOut(TOKEN)).resolves.toBeUndefined();
});

test("reading the save: 200 with a save or with none; 401 and 503 are named", async () => {
  const got = answering(200, { save: SAVE, updatedAt: "2026-11-15T06:00:00Z" });
  expect(await got.client.load(TOKEN)).toEqual({ ok: true, value: { save: SAVE, updatedAt: "2026-11-15T06:00:00Z" } });
  expect(got.sent[0]?.url).toBe("/api/account/save");
  expect(got.sent[0]?.init.method).toBe("GET");
  expect(got.sent[0]?.init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  expect(got.sent[0]?.init.body).toBeUndefined();
  expect(await answering(200, { save: null, updatedAt: null }).client.load(TOKEN)).toEqual({ ok: true, value: { save: null, updatedAt: null } });
  expect(await answering(401, { error: "signed_out" }).client.load(TOKEN)).toEqual({ ok: false, error: "signed_out" });
  expect(await answering(503, { error: "unavailable" }).client.load(TOKEN)).toEqual({ ok: false, error: "unavailable" });
  expect(await answering(200, { nothing: true }).client.load(TOKEN)).toEqual({ ok: false, error: "unreachable" });
  expect(await answering(200).client.load(TOKEN)).toEqual({ ok: false, error: "unreachable" });
});

test("writing the save: 200 gives the time; 400, 401, 413 and 503 are named; a save over the limit is never sent", async () => {
  const put = answering(200, { updatedAt: "2026-11-15T06:00:00Z" });
  expect(await put.client.store(TOKEN, SAVE)).toEqual({ ok: true, value: { updatedAt: "2026-11-15T06:00:00Z" } });
  expect(put.sent[0]?.url).toBe("/api/account/save");
  expect(put.sent[0]?.init.method).toBe("PUT");
  expect(put.sent[0]?.init.headers).toEqual({ "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` });
  expect((JSON.parse(put.sent[0]?.init.body ?? "") as unknown)).toEqual({ save: SAVE });
  expect(await answering(400, { error: "invalid", field: "profile" }).client.store(TOKEN, SAVE)).toEqual({ ok: false, error: "invalid", field: "profile" });
  expect(await answering(401, { error: "signed_out" }).client.store(TOKEN, SAVE)).toEqual({ ok: false, error: "signed_out" });
  expect(await answering(413, { error: "too_big" }).client.store(TOKEN, SAVE)).toEqual({ ok: false, error: "too_big" });
  expect(await answering(503, { error: "unavailable" }).client.store(TOKEN, SAVE)).toEqual({ ok: false, error: "unavailable" });
  expect(await answering(200, {}).client.store(TOKEN, SAVE)).toEqual({ ok: false, error: "unreachable" });
  const huge = answering(200, { updatedAt: "x" });
  const big: Save = { ...SAVE, settings: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${String(i)}`, "y".repeat(200)])), profile: { ...SAVE.profile, moves: Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`move_number_${String(i)}`, i])) } };
  expect(JSON.stringify({ save: big }).length).toBeGreaterThan(SAVE_MAX_BYTES);
  expect(await huge.client.store(TOKEN, big)).toEqual({ ok: false, error: "too_big" });
  expect(huge.sent).toHaveLength(0);
});

test("no network, a refused connection or a time-out is 'unreachable' on every call, and nothing throws", async () => {
  for (const failure of [new TypeError("Failed to fetch"), new DOMException("timed out", "TimeoutError")]) {
    const client = createAccountClient(() => Promise.reject(failure));
    expect(await client.status()).toBe(false);
    expect(await client.signUp("Luv", "x")).toEqual({ ok: false, error: "unreachable" });
    expect(await client.signIn("Luv", "x")).toEqual({ ok: false, error: "unreachable" });
    await expect(client.signOut(TOKEN)).resolves.toBeUndefined();
    expect(await client.load(TOKEN)).toEqual({ ok: false, error: "unreachable" });
    expect(await client.store(TOKEN, SAVE)).toEqual({ ok: false, error: "unreachable" });
  }
  const thrower = createAccountClient(() => { throw new Error("fetch is not there"); });
  expect(await thrower.status()).toBe(false);
});

test("every request goes to /api/account/ and nowhere else", async () => {
  const { client, sent } = answering(200, {});
  await client.status();
  await client.signUp("a", "b");
  await client.signIn("a", "b");
  await client.signOut(TOKEN);
  await client.load(TOKEN);
  await client.store(TOKEN, SAVE);
  expect(sent.map((request) => request.url)).toEqual(["/api/account/status", "/api/account/signup", "/api/account/signin", "/api/account/signout", "/api/account/save", "/api/account/save"]);
});

test("nothing in src/ names a database: no connection string, no host, no variable the server keeps", () => {
  const SECRETS = /postgres(ql)?:\/\/|DATABASE_URL|sslmode=|timescale\.com|tigerdata\.(com|cloud)|process\.env/i;
  const files = readdirSync("src", { recursive: true, encoding: "utf8" }).filter((name) => /\.(ts|tsx|css|json|html)$/.test(name));
  expect(files.length).toBeGreaterThan(100);
  expect(files.some((name) => name.endsWith("sync.ts"))).toBe(true);
  expect(files.filter((name) => SECRETS.test(readFileSync(join("src", name), "utf8")))).toEqual([]);
});
