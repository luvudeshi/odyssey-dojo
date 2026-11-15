// The account limits on their own, on a clock the test moves: each budget, who is counted, what is given back, and the gates.
import { expect, test } from "vitest";
import {
  ATTEMPTS_PER_ADDRESS, Busy, COUNTER_KEYS_MAX, HASHES_AT_ONCE, HASHES_WAITING, KNOWN_SESSION_MS, REQUESTS_PER_ACCOUNT, SAVES_PER_ACCOUNT, SIGNINS_PER_ADDRESS,
  SIGNINS_PER_NAME, SIGNINS_PER_NAME_AND_ADDRESS, SIGNIN_NAME_WINDOW_MS, SIGNUPS_OVERALL, SIGNUPS_PER_ADDRESS, SIGNUPS_PER_DAY, SIGNUPS_PER_HOUR, SIGNUP_WINDOW_MS,
  STRANGERS_AT_ONCE, STRANGERS_WAITING, WRONG_TOKENS_PER_ADDRESS, callerOf, createAccountLimits, createCounter, createGate, createKnownSessions,
} from "../lib/accountLimits";
import { ACCOUNTS_KEPT_FOR_THIS_MACHINE, MAX_ACCOUNTS } from "../lib/accounts";
import { MAX_CONNECTIONS } from "../lib/db";
import { MINUTE_MS, RELAYED, THIS_MACHINE } from "../lib/roomLimits";

const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Takes `times` from a budget and says how many were let through. */
function passed(take: () => number, times: number): number {
  let through = 0;
  for (let index = 0; index < times; index += 1) if (take() === 0) through += 1;
  return through;
}

test("sign-up and sign-in requests are counted per address before the body is read, and one address cannot use up another's", () => {
  let now = 0;
  const limits = createAccountLimits(() => now);
  expect(passed(() => limits.attempt("a"), ATTEMPTS_PER_ADDRESS + 20)).toBe(ATTEMPTS_PER_ADDRESS);
  expect(limits.attempt("a")).toBe(60);
  // Nothing is shared: however many addresses are used up, the next one is untouched.
  for (let index = 0; index < 50; index += 1) passed(() => limits.attempt(`flood ${String(index)}`), ATTEMPTS_PER_ADDRESS + 5);
  expect(limits.attempt("b")).toBe(0);
  // Sign-ups are counted apart from sign-ins: an address that used up the one still has the other.
  expect(passed(() => limits.attempt("c", "signup"), ATTEMPTS_PER_ADDRESS + 20)).toBe(ATTEMPTS_PER_ADDRESS);
  expect(limits.attempt("c", "signup")).toBe(60);
  expect(passed(() => limits.attempt("c", "signin"), ATTEMPTS_PER_ADDRESS + 20)).toBe(ATTEMPTS_PER_ADDRESS);
  now += MINUTE_MS;
  expect(limits.attempt("a")).toBe(0);
  expect(limits.attempt("c", "signup")).toBe(0);
});

test("only an account that was made is counted: sixty an address and 120 for all strangers in ten minutes", () => {
  let now = 1_000;
  const limits = createAccountLimits(() => now);
  // A taken name, a full database or a failure gives the place back, any number of times.
  for (let index = 0; index < 500; index += 1) {
    expect(limits.signUp("a")).toBe(0);
    limits.signUpNotMade("a");
  }
  expect(passed(() => limits.signUp("a"), SIGNUPS_PER_ADDRESS + 5)).toBe(SIGNUPS_PER_ADDRESS);
  expect(limits.signUp("a")).toBe(SIGNUP_WINDOW_MS / 1000);
  // A refused attempt uses up nothing of the shared budget.
  expect(passed(() => limits.signUp("a"), 50)).toBe(0);
  expect(passed(() => limits.signUp("b"), SIGNUPS_PER_ADDRESS)).toBe(SIGNUPS_PER_ADDRESS);
  expect(passed(() => limits.signUp("c"), SIGNUPS_PER_ADDRESS + 5)).toBe(SIGNUPS_OVERALL - 2 * SIGNUPS_PER_ADDRESS);
  // The shared budget is used up by accounts really made: a fourth address waits too.
  expect(limits.signUp("d")).toBeGreaterThan(0);
  now += SIGNUP_WINDOW_MS - 1_500;
  expect(limits.signUp("d")).toBe(2);
  now += 1_500;
  expect(limits.signUp("d")).toBe(0);
  expect(limits.signUp("a")).toBe(0);
});

test("all strangers together make 200 accounts in an hour and 600 in a day; past that sign-up is closed for them, with how long, and sign-in and this machine go on", () => {
  const start = 5_000;
  let now = start;
  const limits = createAccountLimits(() => now);
  // A new address for every account, so no per-address count is in the way.
  let address = 0;
  const make = (times: number): number => passed(() => limits.signUp(`address ${String(address++)}`), times);

  expect(limits.signUpsClosed("anybody")).toBe(0);
  // Ten minutes: 120. A place given back opens it again.
  expect(make(SIGNUPS_OVERALL + 10)).toBe(SIGNUPS_OVERALL);
  expect(limits.signUpsClosed("never seen before")).toBe(SIGNUP_WINDOW_MS / 1000);
  limits.signUpNotMade("address 0");
  expect(limits.signUpsClosed("never seen before")).toBe(0);
  expect(make(5)).toBe(1);

  // The hour: 200, however the ten minutes fall. Closed until the hour that began with the first account is over.
  now = start + SIGNUP_WINDOW_MS;
  expect(make(SIGNUPS_OVERALL)).toBe(SIGNUPS_PER_HOUR - SIGNUPS_OVERALL);
  now = start + 2 * SIGNUP_WINDOW_MS;
  expect(make(5)).toBe(0);
  expect(limits.signUpsClosed("never seen before")).toBe((HOUR_MS - 2 * SIGNUP_WINDOW_MS) / 1000);
  expect(limits.signUp("never seen before")).toBe((HOUR_MS - 2 * SIGNUP_WINDOW_MS) / 1000);

  // The day: 600, three such hours. Then closed until the day that began with the first account is over.
  for (const hour of [1, 2]) {
    now = start + hour * HOUR_MS;
    expect(limits.signUpsClosed("anybody"), String(hour)).toBe(0);
    expect(make(SIGNUPS_OVERALL + 10), String(hour)).toBe(SIGNUPS_OVERALL);
    now += SIGNUP_WINDOW_MS;
    expect(make(SIGNUPS_OVERALL), String(hour)).toBe(SIGNUPS_PER_HOUR - SIGNUPS_OVERALL);
  }
  expect(3 * SIGNUPS_PER_HOUR).toBe(SIGNUPS_PER_DAY);
  now = start + 3 * HOUR_MS;
  expect(make(5)).toBe(0);
  expect(limits.signUpsClosed("anybody")).toBe((DAY_MS - 3 * HOUR_MS) / 1000);

  // Closed is for making accounts only. Sign-in is not touched, and this machine still makes accounts.
  expect(limits.attempt("anybody", "signin")).toBe(0);
  expect(limits.signIn("anybody", "odysseus")).toBe(0);
  expect(limits.lookup("anybody")).toBe(0);
  expect(limits.signUpsClosed(THIS_MACHINE)).toBe(0);
  expect(passed(() => limits.signUp(THIS_MACHINE), 50)).toBe(50);

  now = start + DAY_MS;
  expect(limits.signUpsClosed("anybody")).toBe(0);
  expect(make(1)).toBe(1);
});

test("the laptop that runs the server is never refused, whatever strangers have used up, and is not counted against anybody", () => {
  const limits = createAccountLimits(() => 0);
  for (const address of ["a", "b", "c", "d"]) {
    passed(() => limits.attempt(address), ATTEMPTS_PER_ADDRESS);
    passed(() => limits.signUp(address), SIGNUPS_PER_ADDRESS);
    for (let index = 0; index < SIGNINS_PER_ADDRESS; index += 1) limits.signIn(address, `name ${String(index)}`);
    passed(() => limits.lookup(address), WRONG_TOKENS_PER_ADDRESS);
    passed(() => limits.request(address, "account-1"), REQUESTS_PER_ACCOUNT);
  }
  expect([limits.attempt("a"), limits.signUp("e"), limits.signIn("a", "penelope"), limits.lookup("a"), limits.request("e", "account-1")].every((wait) => wait > 0)).toBe(true);
  expect(passed(() => limits.attempt(THIS_MACHINE), 500)).toBe(500);
  expect(passed(() => limits.signUp(THIS_MACHINE), 500)).toBe(500);
  expect(passed(() => limits.signIn(THIS_MACHINE, "odysseus"), 500)).toBe(500);
  expect(passed(() => limits.lookup(THIS_MACHINE), 500)).toBe(500);
  expect(passed(() => limits.request(THIS_MACHINE, "account-1"), 2_000)).toBe(2_000);
  // Giving back on the laptop's behalf takes nothing from what strangers have used.
  limits.signUpNotMade(THIS_MACHINE);
  limits.signedIn(THIS_MACHINE, "odysseus");
  limits.tokenKnown(THIS_MACHINE);
  expect([limits.signUp("e"), limits.lookup("a")].every((wait) => wait > 0)).toBe(true);
});

test("one address signs in sixty times a minute, and no other address pays for it", () => {
  let now = 0;
  const limits = createAccountLimits(() => now);
  const names = (index: number): string => `name ${String(index)}`;
  let through = 0;
  for (let index = 0; index < SIGNINS_PER_ADDRESS + 10; index += 1) if (limits.signIn("a", names(index)) === 0) through += 1;
  expect(through).toBe(SIGNINS_PER_ADDRESS);
  expect(limits.signIn("a", "one more")).toBe(60);
  // No budget for all strangers together: the hundredth address signs in like the first.
  for (let index = 0; index < 100; index += 1) expect(limits.signIn(`address ${String(index)}`, names(index))).toBe(0);
  now += MINUTE_MS;
  expect(limits.signIn("a", "one more")).toBe(0);
});

test("five wrong passwords on a name from one address hold only that address, for a minute at most, and a right password is not counted", () => {
  let now = 0;
  const limits = createAccountLimits(() => now);
  expect(passed(() => limits.signIn("guesser", "odysseus"), SIGNINS_PER_NAME_AND_ADDRESS + 5)).toBe(SIGNINS_PER_NAME_AND_ADDRESS);
  expect(limits.signIn("guesser", "odysseus")).toBe(SIGNIN_NAME_WINDOW_MS / 1000);
  // The owner, on another address, is not kept out, and neither is the guesser from another name.
  expect(limits.signIn("owner", "odysseus")).toBe(0);
  expect(limits.signIn("guesser", "penelope")).toBe(0);
  // The hold ends a minute after it began, whatever was sent meanwhile: refused tries are not counted and do not make it longer.
  expect(SIGNIN_NAME_WINDOW_MS).toBe(MINUTE_MS);
  now += MINUTE_MS - 1_000;
  expect(passed(() => limits.signIn("guesser", "odysseus"), 40)).toBe(0);
  now += 1_000;
  expect(limits.signIn("guesser", "odysseus")).toBe(0);
  limits.signedIn("guesser", "odysseus");
  // Signing in with the right password any number of times never uses the name up.
  for (let index = 0; index < 25; index += 1) {
    now += MINUTE_MS;
    expect(limits.signIn("owner", "odysseus"), String(index)).toBe(0);
    limits.signedIn("owner", "odysseus");
  }
});

test("twenty wrong passwords on a name from many addresses hold the name for everybody but the laptop, for a minute at most", () => {
  let now = 0;
  const limits = createAccountLimits(() => now);
  for (let index = 0; index < SIGNINS_PER_NAME; index += 1) expect(limits.signIn(`address ${String(index)}`, "odysseus")).toBe(0);
  expect(limits.signIn("one more address", "odysseus")).toBe(SIGNIN_NAME_WINDOW_MS / 1000);
  expect(limits.signIn("one more address", "penelope")).toBe(0);
  expect(limits.signIn(THIS_MACHINE, "odysseus")).toBe(0);
  now += SIGNIN_NAME_WINDOW_MS;
  expect(limits.signIn("one more address", "odysseus")).toBe(0);
  // At this rate one account gets 28,800 guesses a day at most, from however many addresses, and 7,200 from one.
  expect((DAY_MS / SIGNIN_NAME_WINDOW_MS) * SIGNINS_PER_NAME).toBe(28_800);
  expect((DAY_MS / SIGNIN_NAME_WINDOW_MS) * SIGNINS_PER_NAME_AND_ADDRESS).toBe(7_200);
});

test("made-up names cannot wipe the wrong passwords held against a real name: a full counter drops what it counted least, and stays bounded", () => {
  const counter = createCounter(5, MINUTE_MS, () => 0, 100);
  for (let index = 0; index < 5; index += 1) counter.count("odysseus");
  counter.count("penelope");
  counter.count("penelope");
  expect(counter.wait("odysseus")).toBe(60);
  // Fifty times as many keys as it holds, each counted once: they push each other out, never the two counted more.
  for (let index = 0; index < 5_000; index += 1) counter.count(`made up ${String(index)}`);
  expect(counter.wait("odysseus")).toBe(60);
  for (let index = 0; index < 3; index += 1) counter.count("penelope");
  expect(counter.wait("penelope")).toBe(60);
  // The newest of the made-up ones are still counted too.
  for (let index = 0; index < 4; index += 1) counter.count("made up 4999");
  expect(counter.wait("made up 4999")).toBe(60);

  // The same through the limits as the routes use them: a name held by wrong passwords stays held through a flood
  // of sign-ins to three times as many made-up names as a counter holds, from as many addresses.
  const limits = createAccountLimits(() => 0);
  for (let index = 0; index < SIGNINS_PER_NAME; index += 1) expect(limits.signIn(`address ${String(index)}`, "odysseus")).toBe(0);
  expect(passed(() => limits.signIn("guesser", "nestor"), SIGNINS_PER_NAME_AND_ADDRESS)).toBe(SIGNINS_PER_NAME_AND_ADDRESS);
  for (let index = 0; index < 3 * COUNTER_KEYS_MAX; index += 1) limits.signIn(`flood ${String(index)}`, `made up ${String(index)}`);
  expect(limits.signIn("one more address", "odysseus")).toBe(60);
  expect(limits.signIn("guesser", "nestor")).toBe(60);
  // A key that ran out is dropped before any live one: after the minute the same flood finds room without touching what is held.
  expect(COUNTER_KEYS_MAX).toBe(10_000);
});

test("who is counted: the proxy's own X-Forwarded-For entry behind a public server's proxy, and never this machine for a request that was passed on", () => {
  const PROXY = "172.18.0.3";
  // Not behind a proxy (the laptop): as it has always been.
  expect(callerOf("127.0.0.1", {})).toBe(THIS_MACHINE);
  expect(callerOf("127.0.0.1", { "x-forwarded-for": "203.0.113.7" })).toBe(RELAYED);
  expect(callerOf("127.0.0.1", { "x-forwarded-proto": "https" })).toBe(RELAYED);
  expect(callerOf("127.0.0.1", { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "203.0.113.7" })).toBe("via 203.0.113.7");
  expect(callerOf(PROXY, { "x-forwarded-for": "203.0.113.7" })).toBe(PROXY);
  // Behind its own proxy: the last entry, which that proxy wrote. What the caller wrote in front of it is not read.
  expect(callerOf(PROXY, { "x-forwarded-for": "203.0.113.7" }, true)).toBe("via 203.0.113.7");
  expect(callerOf(PROXY, { "x-forwarded-for": "198.51.100.1, 9.9.9.9, 203.0.113.7" }, true)).toBe("via 203.0.113.7");
  expect(callerOf(PROXY, { "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.1", "x-vercel-forwarded-for": "198.51.100.1" }, true)).toBe("via 203.0.113.7");
  // No usable entry: all such callers are one caller, the proxy's address. Never this machine.
  for (const headers of [{ "x-forwarded-proto": "https" }, { "x-forwarded-for": "unknown" }, { "x-real-ip": "203.0.113.7" }]) {
    expect(callerOf(PROXY, headers, true), JSON.stringify(headers)).toBe(PROXY);
    expect(callerOf("127.0.0.1", headers, true), JSON.stringify(headers)).toBe(RELAYED);
  }
  expect(callerOf("127.0.0.1", {}, true)).toBe(THIS_MACHINE);
});

test("unknown tokens are counted before the database is asked, a known one is given back, and a known account is counted for itself", () => {
  let now = 0;
  const limits = createAccountLimits(() => now);
  // A signed-in player can ask as often as the account's own budget allows without using up the address.
  for (let index = 0; index < 500; index += 1) {
    expect(limits.lookup("a")).toBe(0);
    limits.tokenKnown("a");
  }
  // Thirty lookups sent together all hold a place before any answer is back: the thirty-first waits.
  expect(passed(() => limits.lookup("a"), WRONG_TOKENS_PER_ADDRESS + 10)).toBe(WRONG_TOKENS_PER_ADDRESS);
  expect(limits.lookup("a")).toBe(60);
  expect(limits.lookup("b")).toBe(0);

  expect(passed(() => limits.request("a", "account-1"), REQUESTS_PER_ACCOUNT + 30)).toBe(REQUESTS_PER_ACCOUNT);
  expect(limits.request("b", "account-1")).toBe(60);
  expect(limits.request("a", "account-2")).toBe(0);
  now += MINUTE_MS;
  expect([limits.lookup("a"), limits.request("a", "account-1")]).toEqual([0, 0]);
});

test("one account is written sixty times a minute at most, and the laptop is counted too", () => {
  let now = 0;
  const limits = createAccountLimits(() => now);
  expect(passed(() => limits.save("account-1"), SAVES_PER_ACCOUNT + 10)).toBe(SAVES_PER_ACCOUNT);
  expect(limits.save("account-1")).toBe(60);
  expect(limits.save("account-2")).toBe(0);
  now += MINUTE_MS;
  expect(limits.save("account-1")).toBe(0);
});

test("a token the database knew is remembered for five minutes, forgotten on sign-out, and the list cannot grow without end", () => {
  let now = 0;
  const known = createKnownSessions(() => now, KNOWN_SESSION_MS, 3);
  expect(known.get("hash-1")).toBeNull();
  known.remember("hash-1", "account-1");
  expect(known.get("hash-1")).toBe("account-1");
  now += KNOWN_SESSION_MS - 1;
  expect(known.get("hash-1")).toBe("account-1");
  now += 1;
  expect(known.get("hash-1")).toBeNull();

  known.remember("hash-2", "account-2");
  known.forget("hash-2");
  expect(known.get("hash-2")).toBeNull();

  // Full: the ones that ran out go first, and when none has, all go. A forgotten one only costs a lookup.
  for (const hash of ["a", "b", "c"]) known.remember(hash, "account-3");
  known.remember("d", "account-4");
  expect([known.get("a"), known.get("d")]).toEqual([null, "account-4"]);
});

test("the numbers bound what strangers can cost: accounts made, and connections held", () => {
  // Filling the database as far as strangers may takes more than two and a half hours at the fastest, and the laptop keeps places past that.
  expect(((MAX_ACCOUNTS - ACCOUNTS_KEPT_FOR_THIS_MACHINE) / SIGNUPS_OVERALL) * SIGNUP_WINDOW_MS).toBeGreaterThan(150 * MINUTE_MS);
  expect(ACCOUNTS_KEPT_FOR_THIS_MACHINE).toBe(100);
  // With the cap of a day it takes more than three days, and a day of new accounts is under 20 MB of saves at 32 KB each.
  expect((MAX_ACCOUNTS - ACCOUNTS_KEPT_FOR_THIS_MACHINE) / SIGNUPS_PER_DAY).toBeGreaterThan(3);
  expect(SIGNUPS_PER_DAY * 32 * 1024).toBeLessThan(20 * 1024 * 1024);
  expect([SIGNUPS_PER_ADDRESS, SIGNUPS_OVERALL, SIGNUPS_PER_HOUR, SIGNUPS_PER_DAY]).toEqual([60, 120, 200, 600]);
  // One hash at a time whoever asks, so strangers get one core at most.
  expect([HASHES_AT_ONCE, HASHES_WAITING]).toEqual([1, 8]);
  // Strangers' database work leaves connections free for the laptop.
  expect([STRANGERS_AT_ONCE, STRANGERS_WAITING]).toEqual([2, 16]);
  expect(MAX_CONNECTIONS - STRANGERS_AT_ONCE).toBeGreaterThanOrEqual(2);
});

/** Work that ends when the test says so. */
function held(): { readonly work: () => Promise<string>; readonly finish: (value?: string) => void; readonly fail: () => void; started: boolean } {
  let settle: { resolve: (value: string) => void; reject: (error: Error) => void } | null = null;
  const state = {
    started: false,
    work: () => new Promise<string>((resolve, reject) => {
      state.started = true;
      settle = { resolve, reject };
    }),
    finish: (value = "done") => { settle?.resolve(value); },
    fail: () => { settle?.reject(new Error("the work failed")); },
  };
  return state;
}

const tick = (): Promise<void> => new Promise((resolve) => { setImmediate(resolve); });

test("the gate runs one at a time, in the order they came, and refuses one more than the line holds", async () => {
  const gate = createGate(1, 2);
  const jobs = [held(), held(), held()];
  const results = jobs.map((job) => gate(job.work));
  await tick();
  expect(jobs.map((job) => job.started)).toEqual([true, false, false]);
  // The line is full: a stranger is refused at once, and the refused work never starts.
  const refused = held();
  await expect(gate(refused.work)).rejects.toBeInstanceOf(Busy);
  expect(refused.started).toBe(false);

  jobs[0]?.finish("first");
  expect(await results[0]).toBe("first");
  await tick();
  expect(jobs.map((job) => job.started)).toEqual([true, true, false]);
  // A place in the line is free again.
  const fourth = held();
  const fourthResult = gate(fourth.work);
  jobs[1]?.finish("second");
  expect(await results[1]).toBe("second");
  await tick();
  jobs[2]?.finish("third");
  expect(await results[2]).toBe("third");
  await tick();
  expect(fourth.started).toBe(true);
  fourth.finish("fourth");
  expect(await fourthResult).toBe("fourth");
});

test("the laptop's own work waits its turn but is never refused, and failed work gives its place back", async () => {
  const gate = createGate(1, 1);
  const first = held();
  const second = held();
  const firstResult = gate(first.work);
  const secondResult = gate(second.work);
  await tick();
  await expect(gate(() => Promise.resolve("stranger"))).rejects.toBeInstanceOf(Busy);
  const local = held();
  const localResult = gate(local.work, true);
  await tick();
  expect(local.started).toBe(false);

  first.fail();
  await expect(firstResult).rejects.toThrow("the work failed");
  await tick();
  expect(second.started).toBe(true);
  second.finish();
  await secondResult;
  await tick();
  expect(local.started).toBe(true);
  local.finish("local");
  expect(await localResult).toBe("local");
  // Everything has ended: the next comes straight through.
  expect(await gate(() => Promise.resolve("after"))).toBe("after");
});
