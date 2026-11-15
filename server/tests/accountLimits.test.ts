// The account limits on their own, on a clock the test moves: each budget, who is counted, what is given back, and the gates.
import { expect, test } from "vitest";
import {
  ATTEMPTS_PER_ADDRESS, Busy, HASHES_AT_ONCE, HASHES_WAITING, KNOWN_SESSION_MS, REQUESTS_PER_ACCOUNT, SAVES_PER_ACCOUNT, SIGNINS_PER_ADDRESS, SIGNINS_PER_NAME,
  SIGNINS_PER_NAME_AND_ADDRESS, SIGNIN_NAME_WINDOW_MS, SIGNUPS_OVERALL, SIGNUPS_PER_ADDRESS, SIGNUP_WINDOW_MS, STRANGERS_AT_ONCE, STRANGERS_WAITING,
  WRONG_TOKENS_PER_ADDRESS, createAccountLimits, createGate, createKnownSessions,
} from "../lib/accountLimits";
import { ACCOUNTS_KEPT_FOR_THIS_MACHINE, MAX_ACCOUNTS } from "../lib/accounts";
import { MAX_CONNECTIONS } from "../lib/db";
import { MINUTE_MS, THIS_MACHINE } from "../lib/roomLimits";

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
  now += MINUTE_MS;
  expect(limits.attempt("a")).toBe(0);
});

test("only an account that was made is counted: forty an address and 120 for all strangers in ten minutes", () => {
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

test("one address signs in thirty times a minute, and no other address pays for it", () => {
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

test("ten wrong passwords on a name from one address hold only that address, and a right password is not counted", () => {
  let now = 0;
  const limits = createAccountLimits(() => now);
  expect(passed(() => limits.signIn("guesser", "odysseus"), SIGNINS_PER_NAME_AND_ADDRESS + 5)).toBe(SIGNINS_PER_NAME_AND_ADDRESS);
  expect(limits.signIn("guesser", "odysseus")).toBe(SIGNIN_NAME_WINDOW_MS / 1000);
  // The owner, on another address, is not kept out, and neither is the guesser from another name.
  expect(limits.signIn("owner", "odysseus")).toBe(0);
  expect(limits.signIn("guesser", "penelope")).toBe(0);
  // Signing in with the right password any number of times never uses the name up.
  for (let index = 0; index < 25; index += 1) {
    now += MINUTE_MS;
    expect(limits.signIn("owner", "odysseus"), String(index)).toBe(0);
    limits.signedIn("owner", "odysseus");
  }
});

test("a hundred wrong passwords on a name from many addresses hold the name for everybody but the laptop", () => {
  let now = 0;
  const limits = createAccountLimits(() => now);
  for (let index = 0; index < SIGNINS_PER_NAME; index += 1) expect(limits.signIn(`address ${String(index)}`, "odysseus")).toBe(0);
  expect(limits.signIn("one more address", "odysseus")).toBe(SIGNIN_NAME_WINDOW_MS / 1000);
  expect(limits.signIn("one more address", "penelope")).toBe(0);
  expect(limits.signIn(THIS_MACHINE, "odysseus")).toBe(0);
  now += SIGNIN_NAME_WINDOW_MS;
  expect(limits.signIn("one more address", "odysseus")).toBe(0);
  // At this rate one account gets 14,400 guesses a day at most, from however many addresses.
  expect((24 * 60 * MINUTE_MS / SIGNIN_NAME_WINDOW_MS) * SIGNINS_PER_NAME).toBe(14_400);
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
