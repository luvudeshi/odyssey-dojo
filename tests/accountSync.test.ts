// Signing in and keeping the account and the browser the same (src/account/session.ts), against a made-up server.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createAccountClient } from "../src/account/client";
import { createAccountSync, ERROR_TEXT, LEFT_KEY, NAME_TEXT, parseSession, PASSWORD_TEXT, PUSH_DELAY_MS, SESSION_KEY } from "../src/account/session";
import type { AccountSync } from "../src/account/session";
import { EMPTY_PROFILE, PROFILE_KEY } from "../src/account/store";
import type { Profile } from "../src/account/store";
import { DEFAULT_SETTINGS } from "../src/settings/store";
import { browser, fakeServer, fight, memory } from "./helpers/accountKit";
import type { Browser, FakeServer, Memory } from "./helpers/accountKit";

const PASSWORD = "correct horse 9";
const WIN = fight("polyphemus", true, 2400, { jab: 6 });
/** A whole profile: the empty one with these fields changed. */
const profileOf = (fields: Partial<Profile>): Profile => ({ ...EMPTY_PROFILE, ...fields });
/** The profile after WIN and nothing else, under this name. */
const afterWin = (name: string): Profile => profileOf({ name, cleared: ["polyphemus"], moves: { jab: 6 }, bestScore: 2400, fights: 1, wins: 1, styles: ["boxer"] });
/** The settings that travel, as a browser that never changed them has them. */
const SYNCED = { musicVolume: DEFAULT_SETTINGS.musicVolume, sfxVolume: DEFAULT_SETTINGS.sfxVolume, voiceVolume: DEFAULT_SETTINGS.voiceVolume, keyHints: DEFAULT_SETTINGS.keyHints };

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

const GET = "GET /api/account/save";
const PUT = "PUT /api/account/save";

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
  expect(p.profile.get()).toEqual(afterWin("Luv"));
  expect(server.saveOf("Luv")).toEqual({
    version: 1,
    profile: afterWin("Luv"),
    settings: { ...SYNCED, musicVolume: 0.35 },
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
  expect(stored).toEqual({ token: [...server.sessions.keys()][0], name: "Luv", merged: true, unsent: false, fresh: false });
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
  expect(parseSession(JSON.stringify({ token: "t".repeat(43), name: "Luv", unsent: "yes" }))).toEqual({ token: "t".repeat(43), name: "Luv", merged: false, unsent: false, fresh: false });
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
  expect(p.profile.get()).toEqual(afterWin("Luv"));
  // The volume comes with the player. The mirror is the first laptop's own and stays there.
  expect(p.settings.get()).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 0.35 });
  expect(p.stores.character.get()).toBe("zeus");
  expect(JSON.parse(p.storage.data.get(PROFILE_KEY) ?? "") as unknown).toMatchObject({ name: "Luv", cleared: ["polyphemus"] });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(server.calls).toHaveLength(2);
});

test("both sides have different stops: the browser and the account end with both", async () => {
  const server = await withAccount();
  const p = page(server);
  p.profile.rename("Local hero");
  p.profile.record(fight("sirens", true, 900, { duck: 9, jab: 1 }));
  p.profile.record(fight("circe", false, 100));
  p.settings.set({ musicVolume: 1 });
  await p.account.signIn("Luv", PASSWORD);
  const joined = profileOf({ name: "Luv", cleared: ["polyphemus", "sirens"], moves: { jab: 6, duck: 9 }, bestScore: 2400, fights: 2, wins: 1, styles: ["boxer"] });
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
  p.profile.record(fight("circe", true, 3000, { hook: 2 }));
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
  // One read and one write: the account's save is fetched and joined before anything is put over it.
  expect(server.calls).toEqual([GET, PUT]);
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
  expect(server.calls).toEqual([GET, PUT]);
  p.settings.set({ musicVolume: 0.9 });
  await afterDelay();
  await afterDelay();
  // Still one round: the second waits for the first to come back.
  expect(server.calls).toEqual([GET, PUT]);
  expect(p.account.get()).toMatchObject({ save: "saving" });
  server.release();
  await settle();
  expect(server.calls).toEqual([GET, PUT, GET, PUT]);
  server.release();
  await settle();
  expect(server.calls).toHaveLength(4);
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
  p.profile.record(fight("circe", true, 10));
  await afterDelay();
  expect(server.calls).toEqual([GET]);
  expect(p.account.get()).toEqual({ status: "signedOut", error: "" });
  expect(p.storage.data.has(SESSION_KEY)).toBe(false);
  expect(p.profile.get().cleared).toEqual(["polyphemus", "circe"]);
  // Signed out now: more play sends nothing.
  p.profile.record(fight("sirens", true, 10));
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
    p.profile.record(fight("circe", true, 10, { jab: 1 }));
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

test("opening the Account page while signed in fetches the account's save, and sends a save that was waiting", async () => {
  const server = await withAccount();
  const p = page(server);
  await p.account.signIn("Luv", PASSWORD);
  server.fail = 503;
  p.profile.record(fight("circe", true, 10));
  await afterDelay();
  expect(p.account.get()).toMatchObject({ save: "later" });
  server.fail = null;
  server.calls.length = 0;
  await p.account.check();
  expect(server.calls).toEqual([GET, PUT]);
  expect(p.account.get()).toMatchObject({ save: "saved" });
  // With nothing waiting, opening the page reads once and writes nothing.
  await p.account.check();
  expect(server.calls).toEqual([GET, PUT, GET]);
  expect(p.account.get()).toMatchObject({ save: "saved" });
});

test("start-up with a stored token fetches the save once, with no status call and no push when nothing differs", async () => {
  const server = await withAccount();
  const first = page(server);
  await first.account.signIn("Luv", PASSWORD);
  server.calls.length = 0;
  // The account moves on from another browser.
  const other = page(server);
  await other.account.signIn("Luv", PASSWORD);
  other.profile.record(fight("circe", true, 5000, { hook: 3 }));
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
  other.profile.record(fight("sirens", true, 10));
  await afterDelay();
  server.calls.length = 0;
  server.fail = 503;
  const next = page(server, first.storage);
  await settle();
  expect(next.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "later" });
  next.profile.record(fight("circe", true, 10));
  await afterDelay();
  // Only reads were tried: writing first could have put this browser's older progress over the account's.
  expect(server.calls).toEqual(["GET /api/account/save", "GET /api/account/save"]);
  server.fail = null;
  next.profile.record(fight("scylla", false, 10));
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
  p.profile.record(fight("circe", true, 10));
  await p.account.signIn("Luv", PASSWORD);
  p.profile.record(fight("sirens", true, 10));
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
  p.profile.record(fight("circe", true, 10));
  await p.account.signOut();
  expect(server.calls).toEqual([GET, PUT, "POST /api/account/signout"]);
  expect(server.saveOf("Luv")).toMatchObject({ profile: { cleared: ["polyphemus", "circe"] } });
  expect(p.account.get()).toEqual({ status: "signedOut", error: "" });
  expect(p.profile.get().cleared).toEqual(["polyphemus", "circe"]);
  // The change that was waiting does not fire after sign-out.
  await vi.advanceTimersByTimeAsync(60_000);
  expect(server.calls).toHaveLength(3);
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

test("two browsers signed in: a change on the one that was not looking does not put its old save over the other's win", async () => {
  const server = fakeServer();
  const a = page(server);
  await a.account.signUp("Luv", PASSWORD);
  const b = page(server);
  await b.account.signIn("Luv", PASSWORD);
  b.profile.record(fight("circe", true, 3000, { hook: 2 }));
  await afterDelay();
  expect(server.saveOf("Luv")).toMatchObject({ profile: { cleared: ["circe"], wins: 1 } });

  // A was never reloaded and knows nothing of the win. It moves a slider.
  server.calls.length = 0;
  a.settings.set({ musicVolume: 0.2 });
  await afterDelay();
  expect(server.calls).toEqual([GET, PUT]);
  expect(server.saveOf("Luv")).toMatchObject({ profile: { cleared: ["circe"], wins: 1, bestScore: 3000, styles: ["boxer"] }, settings: { musicVolume: 0.2 }, achievements: ["beat_circe"] });
  // And the win now shows on A too.
  expect(a.profile.get()).toMatchObject({ cleared: ["circe"], wins: 1, bestScore: 3000 });

  // B wins again. A only opens its Account page: the stop is there without a reload and nothing is written.
  b.profile.record(fight("sirens", true, 100));
  await afterDelay();
  server.calls.length = 0;
  await a.account.check();
  expect(server.calls).toEqual([GET]);
  expect(a.profile.get().cleared).toEqual(["circe", "sirens"]);
  expect(a.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });
});

test("another browser that plays with the keyboard in low quality does not turn this laptop's camera off", async () => {
  const server = fakeServer();
  const laptop = page(server);
  await laptop.account.signUp("Luv", PASSWORD);
  const other = page(server);
  await other.account.signIn("Luv", PASSWORD);
  other.settings.set({ controls: "keyboard", quality: "low", mirror: false, sfxVolume: 0.5 });
  await afterDelay();
  const saved = server.saveOf("Luv") as { settings: Record<string, unknown> };
  expect(Object.keys(saved.settings).sort()).toEqual(["keyHints", "musicVolume", "sfxVolume", "voiceVolume"]);

  const reloaded = page(server, laptop.storage);
  await settle();
  // The volume follows the player; how this machine is played and drawn does not change.
  expect(reloaded.settings.get()).toEqual({ ...DEFAULT_SETTINGS, sfxVolume: 0.5 });
});

test("a shared laptop: the next player to make an account does not inherit the last player's progress, and nobody loses any", async () => {
  const server = fakeServer();
  const p = page(server);
  p.profile.record(WIN);
  await p.account.signUp("Luv", PASSWORD);
  await p.account.signOut();
  expect(JSON.parse(p.storage.data.get(LEFT_KEY) ?? "null") as unknown).toMatchObject({ name: "Luv" });
  // Signing out leaves the progress in the browser, as before.
  expect(p.profile.get()).toEqual(afterWin("Luv"));

  await p.account.signUp("Judge", PASSWORD);
  expect(p.profile.get()).toEqual(profileOf({ name: "Judge" }));
  expect(server.saveOf("Judge")).toEqual({ version: 1, profile: profileOf({ name: "Judge" }), settings: SYNCED, character: "odysseus" });
  p.profile.record(fight("circe", true, 500));
  await p.account.signOut();
  expect(server.saveOf("Judge")).toMatchObject({ profile: { cleared: ["circe"], wins: 1 } });

  // The first player comes back to exactly their own progress.
  await p.account.signIn("luv", PASSWORD);
  expect(p.profile.get()).toEqual(afterWin("Luv"));
  expect(server.saveOf("Luv")).toMatchObject({ profile: afterWin("Luv") });
  expect(server.saveOf("Judge")).toMatchObject({ profile: { cleared: ["circe"], wins: 1 } });
});

test("progress played signed out after a sign-out is joined into the next account, as it always was", async () => {
  const server = fakeServer();
  const p = page(server);
  p.profile.record(WIN);
  await p.account.signUp("Luv", PASSWORD);
  await p.account.signOut();
  // Somebody plays on, signed out. That fight is in no account, so it must not be thrown away.
  p.profile.record(fight("sirens", true, 700));
  await p.account.signUp("Judge", PASSWORD);
  expect(p.profile.get()).toMatchObject({ name: "Judge", cleared: ["polyphemus", "sirens"], wins: 2 });
  expect(server.saveOf("Judge")).toMatchObject({ profile: { cleared: ["polyphemus", "sirens"], wins: 2 } });
});

test("a sign-out the account did not get everything from leaves no mark, so the progress is joined into whoever signs in next", async () => {
  const server = fakeServer();
  const p = page(server);
  await p.account.signUp("Luv", PASSWORD);
  server.offline = true;
  p.profile.record(WIN);
  await p.account.signOut();
  expect(p.storage.data.has(LEFT_KEY)).toBe(false);
  server.offline = false;
  await p.account.signUp("Judge", PASSWORD);
  // Nothing was lost: the fight is still here, under the new name.
  expect(p.profile.get()).toMatchObject({ name: "Judge", cleared: ["polyphemus"], wins: 1 });
});

test("signing in to the same account again on the same browser joins as before", async () => {
  const server = fakeServer();
  const p = page(server);
  p.profile.record(WIN);
  await p.account.signUp("Luv", PASSWORD);
  await p.account.signOut();
  await p.account.signIn(" LUV ", PASSWORD);
  expect(p.profile.get()).toEqual(afterWin("Luv"));
  expect(parseSession(p.storage.data.get(SESSION_KEY))).toMatchObject({ fresh: false, merged: true });
});

/** A second tab of the same browser: its own page over the same storage, told of changes the way the storage event tells it. */
function tab(server: FakeServer, storage: Memory): Page & { readonly storageChanged: () => void } {
  const b = browser(storage);
  let tell: () => void = () => undefined;
  const account = createAccountSync({ client: createAccountClient(server.fetch), storage, stores: b.stores, watch: (listener) => { tell = listener; } });
  account.start();
  return { ...b, account, storageChanged: () => { tell(); } };
}

test("two tabs: a tab with an old session never writes it back over a newer one, and follows the other tab", async () => {
  const server = fakeServer();
  const storage = memory();
  const one = tab(server, storage);
  await one.account.signUp("Luv", PASSWORD);
  const two = tab(server, storage);
  await settle();
  expect(two.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });

  // Tab one signs out and in again: a new token is stored. Tab two still holds the old one.
  await one.account.signOut();
  await one.account.signIn("Luv", PASSWORD);
  const fresh = parseSession(storage.data.get(SESSION_KEY))?.token;
  expect(server.sessions.size).toBe(1);
  server.calls.length = 0;
  two.settings.set({ musicVolume: 0.4 });
  // At once, before anything is sent: the stored session is still tab one's new one.
  expect(parseSession(storage.data.get(SESSION_KEY))?.token).toBe(fresh);
  await afterDelay();
  // Tab two took the new session and sent its change with it: no 401, nobody signed out.
  expect(server.calls).toEqual([GET, PUT]);
  expect(parseSession(storage.data.get(SESSION_KEY))?.token).toBe(fresh);
  expect(two.account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });
  expect(one.account.get()).toMatchObject({ status: "signedIn", name: "Luv" });
  expect(server.saveOf("Luv")).toMatchObject({ settings: { musicVolume: 0.4 } });
});

test("two tabs: signing out in one signs the other out as soon as it hears of it, and it sends nothing more", async () => {
  const server = fakeServer();
  const storage = memory();
  const one = tab(server, storage);
  await one.account.signUp("Luv", PASSWORD);
  const two = tab(server, storage);
  await settle();
  await one.account.signOut();
  server.calls.length = 0;
  two.storageChanged();
  expect(two.account.get()).toEqual({ status: "signedOut", error: "" });
  two.profile.record(WIN);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(server.calls).toEqual([]);
  expect(storage.data.has(SESSION_KEY)).toBe(false);

  // And signing in again in tab one signs tab two in, with one read of the save.
  await one.account.signIn("Luv", PASSWORD);
  server.calls.length = 0;
  two.storageChanged();
  await settle();
  expect(two.account.get()).toMatchObject({ status: "signedIn", name: "Luv" });
  expect(server.calls.filter((call) => call.startsWith("POST"))).toEqual([]);
});

test("two tabs: a tab whose old session the server refuses does not remove the newer session the other tab stored meanwhile", async () => {
  const server = fakeServer();
  const storage = memory();
  const one = tab(server, storage);
  await one.account.signUp("Luv", PASSWORD);
  const stale = parseSession(storage.data.get(SESSION_KEY));
  if (!stale) throw new Error("no session was stored");
  // The second tab, set up so the other tab's new sign-in lands exactly while its request is on its way:
  // it reads a copy of the storage until its request leaves, and the shared storage from then on.
  const seen = memory({ [SESSION_KEY]: JSON.stringify(stale) });
  const b = browser(seen);
  const fetch: typeof server.fetch = (url, init) => {
    seen.getItem = (key) => storage.getItem(key);
    seen.setItem = (key, value) => { storage.setItem(key, value); };
    seen.removeItem = (key) => { storage.removeItem(key); };
    return server.fetch(url, init);
  };
  const two = createAccountSync({ client: createAccountClient(fetch), storage: seen, stores: b.stores });
  await one.account.signOut();
  await one.account.signIn("Luv", PASSWORD);
  const fresh = parseSession(storage.data.get(SESSION_KEY))?.token;
  expect(fresh).not.toBe(stale.token);

  two.start();
  await settle();
  // Its old session was refused, so it is signed out. The newer session is not its to remove.
  expect(two.get()).toEqual({ status: "signedOut", error: "" });
  expect(parseSession(storage.data.get(SESSION_KEY))?.token).toBe(fresh);
  expect(one.account.get()).toMatchObject({ status: "signedIn" });
  // On its next change it finds the newer session and carries on with it.
  b.settings.set({ musicVolume: 0.9 });
  await afterDelay();
  expect(two.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });
  expect(server.saveOf("Luv")).toMatchObject({ settings: { musicVolume: 0.9 } });
});

test("a save that could not be fetched at sign-in: changes made since are not undone when it is fetched later", async () => {
  const server = await withAccount();
  const p = page(server);
  server.fail = null;
  // Signed in, but the save route is down: nothing has been joined yet.
  const realFetch = server.fetch;
  let down = true;
  const fetch: typeof realFetch = (url, init) => (down && url.endsWith("/save") ? Promise.resolve({ status: 503, json: () => Promise.resolve({ error: "unavailable" }) }) : realFetch(url, init));
  const b = browser();
  const account = createAccountSync({ client: createAccountClient(fetch), storage: b.storage, stores: b.stores });
  account.start();
  await account.signIn("Luv", PASSWORD);
  expect(account.get()).toEqual({ status: "signedIn", name: "Luv", save: "later" });
  b.profile.rename("Renamed here");
  b.settings.set({ musicVolume: 0.9 });
  down = false;
  await afterDelay();
  expect(account.get()).toEqual({ status: "signedIn", name: "Luv", save: "saved" });
  // The account's progress came in; the name and the volume set here in the meantime stayed.
  expect(b.profile.get()).toMatchObject({ name: "Renamed here", cleared: ["polyphemus"], wins: 1 });
  expect(b.settings.get().musicVolume).toBe(0.9);
  expect(p.account.get().status).toBe("unknown");
});

test("two browsers signed in: a fight on the one that was not looking does not undo a rename and a volume change made on the other", async () => {
  const server = fakeServer();
  const a = page(server);
  await a.account.signUp("Luv", PASSWORD);
  const b = page(server);
  await b.account.signIn("Luv", PASSWORD);
  a.profile.rename("Luv the Bold");
  a.settings.set({ musicVolume: 0.2 });
  a.pick("zeus");
  await afterDelay();
  // B knows nothing of that and wins a fight.
  b.profile.record(fight("circe", true, 3000));
  await afterDelay();
  expect(server.saveOf("Luv")).toMatchObject({ profile: { name: "Luv the Bold", cleared: ["circe"] }, settings: { musicVolume: 0.2 }, character: "zeus" });
  expect(b.profile.get().name).toBe("Luv the Bold");
  expect(b.settings.get().musicVolume).toBe(0.2);
  expect(b.stores.character.get()).toBe("zeus");
  // What B itself changes still wins.
  b.settings.set({ sfxVolume: 0.4 });
  await afterDelay();
  expect(server.saveOf("Luv")).toMatchObject({ profile: { name: "Luv the Bold" }, settings: { musicVolume: 0.2, sfxVolume: 0.4 } });
});
