// Signing in and keeping the account and the browser the same (src/account/session.ts), against a made-up server.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createAccountClient } from "../src/account/client";
import { createAccountSync, ERROR_TEXT, NAME_TEXT, parseSession, PASSWORD_TEXT, PUSH_DELAY_MS, SESSION_KEY } from "../src/account/session";
import type { AccountSync } from "../src/account/session";
import { EMPTY_PROFILE, PROFILE_KEY } from "../src/account/store";
import { DEFAULT_SETTINGS } from "../src/settings/store";
import { browser, fakeServer, memory } from "./helpers/accountKit";
import type { Browser, FakeServer, Memory } from "./helpers/accountKit";

const PASSWORD = "correct horse 9";
const WIN = { enemyId: "polyphemus", won: true, score: 2400, mastery: { jab: 6 } };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

/** Lets every pending answer arrive, without moving the clock. */
const settle = (): Promise<unknown> => vi.advanceTimersByTimeAsync(0);
const afterDelay = (): Promise<unknown> => vi.advanceTimersByTimeAsync(PUSH_DELAY_MS);

interface Page extends Browser {
  readonly account: AccountSync;
}

/** One page of the game on a browser: its stores and its account, started as the game starts them. */
function page(server: FakeServer, storage: Memory = memory()): Page {
  const b = browser(storage);
  const account = createAccountSync({ client: createAccountClient(server.fetch), storage, stores: b.stores });
  account.start();
  return { ...b, account };
}

/** A server that already has the account "Luv" with progress saved from another browser. */
async function withAccount(): Promise<FakeServer> {
  const server = fakeServer();
  const first = page(server);
  first.profile.record(WIN);
  first.settings.set({ musicVolume: 0.35, mirror: false });
  first.pick("zeus");
  await first.account.signUp("Luv", PASSWORD);
  expect(first.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });
  server.calls.length = 0;
  return server;
}

test("signed out with the Account page closed: playing, renaming and changing settings sends nothing at all", async () => {
  const server = fakeServer();
  const p = page(server);
  p.profile.rename("Luv");
  p.profile.record(WIN);
  p.settings.set({ musicVolume: 0.2 });
  p.pick("athena");
  await vi.advanceTimersByTimeAsync(60_000);
  expect(server.calls).toEqual([]);
  expect(p.account.get()).toEqual({ status: "unknown" });
  expect(p.storage.data.has(SESSION_KEY)).toBe(false);
  await p.account.signOut();
  expect(server.calls).toEqual([]);
});

test("the real account module (src/account/sync.ts) asks the network nothing when it loads and nobody is signed in", async () => {
  const fetch = vi.fn(() => Promise.reject(new Error("no network in this test")));
  vi.stubGlobal("fetch", fetch);
  const sync = await import("../src/account/sync");
  const store = await import("../src/account/store");
  const settings = await import("../src/settings/store");
  store.recordFight(WIN);
  store.renameProfile("Luv");
  settings.setSettings({ musicVolume: 0.4 });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetch).not.toHaveBeenCalled();
  expect(sync.getAccount()).toEqual({ status: "unknown" });
  expect(sync.SESSION_KEY).toBe("odyssey-dojo.session");
});

test("opening the Account page asks once whether accounts are on: off, on, or no server at all", async () => {
  const server = fakeServer();
  const p = page(server);
  server.available = false;
  await p.account.check();
  expect(p.account.get()).toEqual({ status: "off" });
  server.available = true;
  await p.account.check();
  expect(p.account.get()).toEqual({ status: "signedOut", error: "" });
  server.offline = true;
  await p.account.check();
  expect(p.account.get()).toEqual({ status: "off" });
  expect(server.calls).toEqual(["GET /api/account/status", "GET /api/account/status", "GET /api/account/status"]);
});

test("a name or password that cannot be right is said at once, without a request", async () => {
  const server = fakeServer();
  const p = page(server);
  await p.account.signIn("Lu", PASSWORD);
  expect(p.account.get()).toEqual({ status: "signedOut", error: NAME_TEXT });
  await p.account.signUp("  Lu  ", PASSWORD);
  expect(p.account.get()).toEqual({ status: "signedOut", error: NAME_TEXT });
  await p.account.signUp("Luv", "short");
  expect(p.account.get()).toEqual({ status: "signedOut", error: PASSWORD_TEXT });
  await p.account.signUp("Luv", "x".repeat(201));
  expect(p.account.get()).toEqual({ status: "signedOut", error: PASSWORD_TEXT });
  expect(server.calls).toEqual([]);
});

test("the form is told in plain words: name taken, wrong name or password, too many tries, not available, cannot reach", async () => {
  const server = await withAccount();
  const p = page(server);
  const said = (): string => { const state = p.account.get(); return state.status === "signedOut" ? state.error : state.status; };
  await p.account.signUp("LUV", "another password");
  expect(said()).toBe(ERROR_TEXT.name_taken);
  await p.account.signIn("Luv", "not the password");
  expect(said()).toBe(ERROR_TEXT.wrong_name_or_password);
  await p.account.signIn("Nobody here", PASSWORD);
  expect(said()).toBe(ERROR_TEXT.wrong_name_or_password);
  server.fail = 429;
  await p.account.signIn("Luv", PASSWORD);
  expect(said()).toBe(ERROR_TEXT.slow_down);
  server.fail = 503;
  await p.account.signIn("Luv", PASSWORD);
  expect(said()).toBe(ERROR_TEXT.unavailable);
  server.fail = 400;
  await p.account.signUp("Luv2", PASSWORD);
  expect(said()).toBe(ERROR_TEXT.invalid);
  server.fail = null;
  server.offline = true;
  await p.account.signIn("Luv", PASSWORD);
  expect(said()).toBe(ERROR_TEXT.unreachable);
  for (const text of Object.values(ERROR_TEXT)) expect(text).not.toMatch(/[_{}]|undefined|error/i);
  // Nothing was stored and no progress was touched by any failed try.
  expect(p.storage.data.has(SESSION_KEY)).toBe(false);
  expect(p.profile.get()).toEqual(EMPTY_PROFILE);
});

test("the form is busy while a sign-in is on its way, and a second press is ignored", async () => {
  const server = await withAccount();
  const p = page(server);
  const first = p.account.signIn("Luv", PASSWORD);
  expect(p.account.get()).toEqual({ status: "busy" });
  await p.account.signIn("Luv", PASSWORD);
  await p.account.signUp("Other", PASSWORD);
  await first;
  expect(server.calls.filter((call) => call.startsWith("POST"))).toEqual(["POST /api/account/signin"]);
  expect(p.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });
});

test("first sign-up keeps this browser's progress, takes the account name and pushes it", async () => {
  const server = fakeServer();
  const p = page(server);
  p.profile.rename("Nobody");
  p.profile.record(WIN);
  p.settings.set({ musicVolume: 0.35 });
  await p.account.signUp(" Luv ", PASSWORD);
  expect(server.calls).toEqual(["POST /api/account/signup", "GET /api/account/save", "PUT /api/account/save"]);
  expect(p.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });
  expect(p.profile.get()).toEqual({ name: "Luv", cleared: ["polyphemus"], moves: { jab: 6 }, bestScore: 2400, fights: 1, wins: 1 });
  expect(server.saveOf("Luv")).toEqual({
    version: 1,
    profile: { name: "Luv", cleared: ["polyphemus"], moves: { jab: 6 }, bestScore: 2400, fights: 1, wins: 1 },
    settings: { ...DEFAULT_SETTINGS, musicVolume: 0.35 },
    character: "odysseus",
    achievements: ["beat_polyphemus"],
  });
});

test("the token is kept under odyssey-dojo.session, the password nowhere, and sign-out removes it", async () => {
  const server = fakeServer();
  const p = page(server);
  await p.account.signUp("Luv", PASSWORD);
  expect(SESSION_KEY).toBe("odyssey-dojo.session");
  const stored = JSON.parse(p.storage.data.get(SESSION_KEY) ?? "null") as Record<string, unknown>;
  expect(stored).toEqual({ token: [...server.sessions.keys()][0], name: "Luv", merged: true, unsent: false });
  expect([...p.storage.data.values()].join("\n")).not.toContain(PASSWORD);
  // A new page on the same browser is signed in from the stored session, with no password asked.
  const again = page(server, p.storage);
  expect(again.account.get()).toMatchObject({ status: "signedIn", name: "Luv" });
  await again.account.signOut();
  expect(again.storage.data.has(SESSION_KEY)).toBe(false);
  expect(again.account.get()).toEqual({ status: "signedOut", error: "" });
  expect(server.sessions.size).toBe(0);
  expect(server.calls.at(-1)).toBe("POST /api/account/signout");
});

test("a stored session of any shape reads as signed out unless it is a real one", () => {
  for (const junk of [null, "", "not json", "[]", "{}", JSON.stringify({ token: "short", name: "Luv" }), JSON.stringify({ token: "t".repeat(43) }), JSON.stringify({ token: 7, name: "Luv" }), JSON.stringify({ token: "t".repeat(43), name: "\n" })]) {
    expect(parseSession(junk), String(junk)).toBeNull();
  }
  expect(parseSession(JSON.stringify({ token: "t".repeat(43), name: "Luv", unsent: "yes" }))).toEqual({ token: "t".repeat(43), name: "Luv", merged: false, unsent: false });
});

test("a storage that throws is survived: signing in still works for this page", async () => {
  const server = fakeServer();
  const broken = { data: new Map<string, string>(), getItem: () => { throw new Error("private window"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };
  const p = page(server, broken);
  await p.account.signUp("Luv", PASSWORD);
  expect(p.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });
  await p.account.signOut();
  expect(p.account.get()).toEqual({ status: "signedOut", error: "" });
  const none = createAccountSync({ client: createAccountClient(server.fetch), storage: null, stores: browser().stores });
  none.start();
  expect(none.get()).toEqual({ status: "unknown" });
});

test("second browser: signing in on an empty browser brings everything back and sends nothing it already has", async () => {
  const server = await withAccount();
  const p = page(server);
  await p.account.signIn("luv", PASSWORD);
  expect(server.calls).toEqual(["POST /api/account/signin", "GET /api/account/save"]);
  expect(p.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });
  expect(p.profile.get()).toEqual({ name: "Luv", cleared: ["polyphemus"], moves: { jab: 6 }, bestScore: 2400, fights: 1, wins: 1 });
  expect(p.settings.get()).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 0.35, mirror: false });
  expect(p.stores.character.get()).toBe("zeus");
  expect(JSON.parse(p.storage.data.get(PROFILE_KEY) ?? "") as unknown).toMatchObject({ name: "Luv", cleared: ["polyphemus"] });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(server.calls).toHaveLength(2);
});

test("both sides have different stops: the browser and the account end with both", async () => {
  const server = await withAccount();
  const p = page(server);
  p.profile.rename("Local hero");
  p.profile.record({ enemyId: "sirens", won: true, score: 900, mastery: { duck: 9, jab: 1 } });
  p.profile.record({ enemyId: "circe", won: false, score: 100, mastery: {} });
  p.settings.set({ musicVolume: 1 });
  await p.account.signIn("Luv", PASSWORD);
  const joined = { name: "Luv", cleared: ["polyphemus", "sirens"], moves: { jab: 6, duck: 9 }, bestScore: 2400, fights: 2, wins: 1 };
  expect(p.profile.get()).toEqual(joined);
  expect(p.settings.get().musicVolume).toBe(0.35);
  expect(server.calls).toEqual(["POST /api/account/signin", "GET /api/account/save", "PUT /api/account/save"]);
  expect(server.saveOf("Luv")).toMatchObject({ profile: joined, character: "zeus", achievements: ["beat_polyphemus", "beat_sirens"] });
});

test("a fight while signed in is pushed after a short wait; a run of changes is one request", async () => {
  const server = await withAccount();
  const p = page(server);
  await p.account.signIn("Luv", PASSWORD);
  server.calls.length = 0;
  p.profile.record({ enemyId: "circe", won: true, score: 3000, mastery: { hook: 2 } });
  // Recording returned at once: the result screen does not wait for the network.
  expect(p.profile.get().cleared).toEqual(["polyphemus", "circe"]);
  expect(p.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saving" });
  p.settings.set({ musicVolume: 0.1 });
  p.settings.set({ musicVolume: 0.2 });
  p.pick("athena");
  p.profile.rename("Luv the Bold");
  await vi.advanceTimersByTimeAsync(PUSH_DELAY_MS - 1);
  expect(server.calls).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(server.calls).toEqual(["PUT /api/account/save"]);
  expect(p.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });
  expect(server.saveOf("Luv")).toMatchObject({ profile: { name: "Luv the Bold", cleared: ["polyphemus", "circe"], bestScore: 3000, wins: 2 }, settings: { musicVolume: 0.2 }, character: "athena" });
});

test("one request at a time: a change made while a save is on its way goes in the next one, and the last write wins", async () => {
  const server = await withAccount();
  const p = page(server);
  await p.account.signIn("Luv", PASSWORD);
  server.calls.length = 0;
  server.hold = true;
  p.settings.set({ musicVolume: 0.1 });
  await afterDelay();
  expect(server.calls).toEqual(["PUT /api/account/save"]);
  p.settings.set({ musicVolume: 0.9 });
  await afterDelay();
  await afterDelay();
  // Still one: the second waits for the first to come back.
  expect(server.calls).toEqual(["PUT /api/account/save"]);
  expect(p.account.get()).toMatchObject({ save: "saving" });
  server.release();
  await settle();
  expect(server.calls).toEqual(["PUT /api/account/save", "PUT /api/account/save"]);
  server.release();
  await settle();
  expect(server.calls).toHaveLength(2);
  expect(p.account.get()).toMatchObject({ save: "saved" });
  expect(server.saveOf("Luv")).toMatchObject({ settings: { musicVolume: 0.9 } });
  expect(parseSession(p.storage.data.get(SESSION_KEY))).toMatchObject({ unsent: false });
});

test("a 401 signs the browser out quietly and keeps the progress here", async () => {
  const server = await withAccount();
  const p = page(server);
  await p.account.signIn("Luv", PASSWORD);
  server.sessions.clear();
  server.calls.length = 0;
  p.profile.record({ enemyId: "circe", won: true, score: 10, mastery: {} });
  await afterDelay();
  expect(server.calls).toEqual(["PUT /api/account/save"]);
  expect(p.account.get()).toEqual({ status: "signedOut", error: "" });
  expect(p.storage.data.has(SESSION_KEY)).toBe(false);
  expect(p.profile.get().cleared).toEqual(["polyphemus", "circe"]);
  // Signed out now: more play sends nothing.
  p.profile.record({ enemyId: "sirens", won: true, score: 10, mastery: {} });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(server.calls).toHaveLength(1);
});

test("offline or a 503: the game keeps playing, the save waits and goes with the next change", async () => {
  const server = await withAccount();
  const p = page(server);
  await p.account.signIn("Luv", PASSWORD);
  server.calls.length = 0;
  for (const down of ["offline", "503"] as const) {
    server.offline = down === "offline";
    server.fail = down === "503" ? 503 : null;
    p.profile.record({ enemyId: "circe", won: true, score: 10, mastery: { jab: 1 } });
    await afterDelay();
    expect(p.account.get(), down).toEqual({ status: "signedIn", name: "Luv", save: "later" });
    expect(parseSession(p.storage.data.get(SESSION_KEY)), down).toMatchObject({ unsent: true });
    // No timer keeps knocking on a server that is down.
    const before = server.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.calls.length, down).toBe(before);
  }
  server.offline = false;
  server.fail = null;
  p.settings.set({ keyHints: false });
  await afterDelay();
  expect(p.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });
  expect(server.saveOf("Luv")).toMatchObject({ profile: { cleared: ["polyphemus", "circe"], fights: 3, wins: 3 }, settings: { keyHints: false } });
  expect(parseSession(p.storage.data.get(SESSION_KEY))).toMatchObject({ unsent: false });
});

test("a save that is waiting is tried again when the Account page opens", async () => {
  const server = await withAccount();
  const p = page(server);
  await p.account.signIn("Luv", PASSWORD);
  server.fail = 503;
  p.profile.record({ enemyId: "circe", won: true, score: 10, mastery: {} });
  await afterDelay();
  expect(p.account.get()).toMatchObject({ save: "later" });
  server.fail = null;
  server.calls.length = 0;
  await p.account.check();
  expect(server.calls).toEqual(["PUT /api/account/save"]);
  expect(p.account.get()).toMatchObject({ save: "saved" });
  // With nothing waiting, opening the page asks nothing.
  await p.account.check();
  expect(server.calls).toHaveLength(1);
});

test("start-up with a stored token fetches the save once, with no status call and no push when nothing differs", async () => {
  const server = await withAccount();
  const first = page(server);
  await first.account.signIn("Luv", PASSWORD);
  server.calls.length = 0;
  // The account moves on from another browser.
  const other = page(server);
  await other.account.signIn("Luv", PASSWORD);
  other.profile.record({ enemyId: "circe", won: true, score: 5000, mastery: { hook: 3 } });
  await afterDelay();
  server.calls.length = 0;
  const next = page(server, first.storage);
  expect(next.account.get()).toMatchObject({ status: "signedIn", name: "Luv" });
  await settle();
  expect(server.calls).toEqual(["GET /api/account/save"]);
  expect(next.profile.get()).toMatchObject({ cleared: ["polyphemus", "circe"], bestScore: 5000, wins: 2 });
  expect(next.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });
});

test("start-up with a token the server no longer knows: signed out quietly, progress kept", async () => {
  const server = await withAccount();
  const first = page(server);
  await first.account.signIn("Luv", PASSWORD);
  server.sessions.clear();
  server.calls.length = 0;
  const next = page(server, first.storage);
  await settle();
  expect(server.calls).toEqual(["GET /api/account/save"]);
  expect(next.account.get()).toEqual({ status: "signedOut", error: "" });
  expect(next.storage.data.has(SESSION_KEY)).toBe(false);
  expect(next.profile.get().cleared).toEqual(["polyphemus"]);
});

test("start-up while the server is down: play goes on, nothing is pushed before the save has been fetched", async () => {
  const server = await withAccount();
  const first = page(server);
  await first.account.signIn("Luv", PASSWORD);
  const other = page(server);
  await other.account.signIn("Luv", PASSWORD);
  other.profile.record({ enemyId: "sirens", won: true, score: 10, mastery: {} });
  await afterDelay();
  server.calls.length = 0;
  server.fail = 503;
  const next = page(server, first.storage);
  await settle();
  expect(next.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "later" });
  next.profile.record({ enemyId: "circe", won: true, score: 10, mastery: {} });
  await afterDelay();
  // Only reads were tried: writing first could have put this browser's older progress over the account's.
  expect(server.calls).toEqual(["GET /api/account/save", "GET /api/account/save"]);
  server.fail = null;
  next.profile.record({ enemyId: "scylla", won: false, score: 10, mastery: {} });
  await afterDelay();
  expect(server.calls.slice(2)).toEqual(["GET /api/account/save", "PUT /api/account/save"]);
  expect(next.profile.get().cleared).toEqual(["polyphemus", "sirens", "circe"]);
  expect(server.saveOf("Luv")).toMatchObject({ profile: { cleared: ["polyphemus", "sirens", "circe"] } });
  expect(next.account.get()).toMatchObject({ save: "saved" });
});

test("changes that could not be sent are not undone by the older save at the next start-up", async () => {
  const server = await withAccount();
  const first = page(server);
  await first.account.signIn("Luv", PASSWORD);
  server.offline = true;
  first.profile.rename("Luv the Bold");
  first.settings.set({ musicVolume: 0 });
  first.pick("achilles");
  await afterDelay();
  expect(first.account.get()).toMatchObject({ save: "later" });
  server.offline = false;
  server.calls.length = 0;
  const next = page(server, first.storage);
  await settle();
  expect(server.calls).toEqual(["GET /api/account/save", "PUT /api/account/save"]);
  expect(next.profile.get().name).toBe("Luv the Bold");
  expect(next.settings.get().musicVolume).toBe(0);
  expect(next.stores.character.get()).toBe("achilles");
  expect(server.saveOf("Luv")).toMatchObject({ profile: { name: "Luv the Bold" }, settings: { musicVolume: 0 }, character: "achilles" });
});

test("a save this version cannot read is neither merged nor written over", async () => {
  const server = await withAccount();
  const row = server.accounts.get("luv");
  if (!row) throw new Error("the account is missing");
  row.save = { version: 2, heroes: [] };
  const p = page(server);
  p.profile.record({ enemyId: "circe", won: true, score: 10, mastery: {} });
  await p.account.signIn("Luv", PASSWORD);
  p.profile.record({ enemyId: "sirens", won: true, score: 10, mastery: {} });
  await afterDelay();
  expect(server.calls.filter((call) => call.startsWith("PUT"))).toEqual([]);
  expect(row.save).toEqual({ version: 2, heroes: [] });
  expect(p.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "later" });
  expect(p.profile.get().cleared).toEqual(["circe", "sirens"]);
});

test("signing out sends a change that was still waiting, ends the session, and leaves the progress in the browser", async () => {
  const server = await withAccount();
  const p = page(server);
  await p.account.signIn("Luv", PASSWORD);
  server.calls.length = 0;
  p.profile.record({ enemyId: "circe", won: true, score: 10, mastery: {} });
  await p.account.signOut();
  expect(server.calls).toEqual(["PUT /api/account/save", "POST /api/account/signout"]);
  expect(server.saveOf("Luv")).toMatchObject({ profile: { cleared: ["polyphemus", "circe"] } });
  expect(p.account.get()).toEqual({ status: "signedOut", error: "" });
  expect(p.profile.get().cleared).toEqual(["polyphemus", "circe"]);
  // The change that was waiting does not fire after sign-out.
  await vi.advanceTimersByTimeAsync(60_000);
  expect(server.calls).toHaveLength(2);
});

test("signing out with no server still signs this browser out", async () => {
  const server = await withAccount();
  const p = page(server);
  await p.account.signIn("Luv", PASSWORD);
  server.offline = true;
  await p.account.signOut();
  expect(p.account.get()).toEqual({ status: "signedOut", error: "" });
  expect(p.storage.data.has(SESSION_KEY)).toBe(false);
});

test("listeners hear every change of state and stop when they leave", async () => {
  const server = fakeServer();
  const p = page(server);
  const seen: string[] = [];
  const leave = p.account.subscribe(() => { seen.push(p.account.get().status); });
  await p.account.check();
  await p.account.signUp("Luv", PASSWORD);
  leave();
  await p.account.signOut();
  expect(seen[0]).toBe("signedOut");
  expect(seen).toContain("busy");
  expect(seen.at(-1)).toBe("signedIn");
  expect(seen).not.toContain("off");
});
