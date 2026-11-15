// The account limits on their own, on a clock the test moves: each budget, who is counted, and the gate for password hashes.
import { expect, test } from "vitest";
import {
  Busy, HASHES_AT_ONCE, HASHES_WAITING, REQUESTS_OVERALL, REQUESTS_PER_ADDRESS, SAVES_PER_ACCOUNT, SIGNINS_OVERALL, SIGNINS_PER_ADDRESS, SIGNINS_PER_NAME,
  SIGNIN_NAME_WINDOW_MS, SIGNUPS_OVERALL, SIGNUPS_PER_ADDRESS, SIGNUP_WINDOW_MS, WRONG_TOKENS_PER_ADDRESS, createAccountLimits, createGate,
} from "../lib/accountLimits";
import { MAX_ACCOUNTS } from "../lib/accounts";
import { MINUTE_MS, THIS_MACHINE } from "../lib/roomLimits";

/** Takes `times` from a budget and says how many were let through. */
function passed(take: () => number, times: number): number {
  let through = 0;
  for (let index = 0; index < times; index += 1) if (take() === 0) through += 1;
  return through;
}

test("one address signs up ten times in ten minutes, and all strangers together thirty times", () => {
  let now = 1_000;
  const limits = createAccountLimits(() => now);
  expect(passed(() => limits.signUp("a"), SIGNUPS_PER_ADDRESS)).toBe(SIGNUPS_PER_ADDRESS);
  expect(limits.signUp("a")).toBe(SIGNUP_WINDOW_MS / 1000);
  // Another address has a budget of its own, and a refused attempt uses up nothing of the shared one.
  expect(passed(() => limits.signUp("a"), 50)).toBe(0);
  expect(passed(() => limits.signUp("b"), SIGNUPS_PER_ADDRESS + 5)).toBe(SIGNUPS_PER_ADDRESS);
  expect(passed(() => limits.signUp("c"), SIGNUPS_PER_ADDRESS + 5)).toBe(SIGNUPS_OVERALL - 2 * SIGNUPS_PER_ADDRESS);
  // The shared budget is used up: a fourth address that has done nothing waits too.
  expect(limits.signUp("d")).toBeGreaterThan(0);
  now += SIGNUP_WINDOW_MS - 1_500;
  expect(limits.signUp("d")).toBe(2);
  now += 1_500;
  expect(limits.signUp("d")).toBe(0);
  expect(limits.signUp("a")).toBe(0);
});

test("the laptop that runs the server is never refused, whatever strangers have used up", () => {
  const limits = createAccountLimits(() => 0);
  for (const address of ["a", "b", "c", "d"]) {
    passed(() => limits.signUp(address), SIGNUPS_PER_ADDRESS);
    passed(() => limits.signIn(address), SIGNINS_PER_ADDRESS);
    passed(() => limits.request(address), REQUESTS_PER_ADDRESS);
  }
  expect([limits.signUp("e"), limits.signIn("e")].every((wait) => wait > 0)).toBe(true);
  expect(passed(() => limits.signUp(THIS_MACHINE), 200)).toBe(200);
  expect(passed(() => limits.signIn(THIS_MACHINE), 200)).toBe(200);
  expect(passed(() => limits.request(THIS_MACHINE), 2_000)).toBe(2_000);
  expect(passed(() => limits.signInName(THIS_MACHINE, "odysseus"), 200)).toBe(200);
  for (let index = 0; index < 200; index += 1) limits.wrongTokenCount(THIS_MACHINE);
  expect(limits.wrongTokenWait(THIS_MACHINE)).toBe(0);
  // And what the laptop does is not counted against anybody else.
  expect(limits.signInName("f", "odysseus")).toBe(0);
});

test("one address signs in twenty times a minute, all strangers together sixty times", () => {
  let now = 0;
  const limits = createAccountLimits(() => now);
  expect(passed(() => limits.signIn("a"), SIGNINS_PER_ADDRESS + 10)).toBe(SIGNINS_PER_ADDRESS);
  expect(limits.signIn("a")).toBe(60);
  expect(passed(() => limits.signIn("b"), SIGNINS_PER_ADDRESS)).toBe(SIGNINS_PER_ADDRESS);
  expect(passed(() => limits.signIn("c"), SIGNINS_PER_ADDRESS)).toBe(SIGNINS_PER_ADDRESS);
  expect(SIGNINS_OVERALL).toBe(3 * SIGNINS_PER_ADDRESS);
  expect(limits.signIn("d")).toBe(60);
  // Sign-ups are counted apart.
  expect(limits.signUp("d")).toBe(0);
  now += MINUTE_MS;
  expect(limits.signIn("d")).toBe(0);
  expect(limits.signIn("a")).toBe(0);
});

test("one name gets ten attempts in ten minutes from other devices, whichever addresses they come from", () => {
  let now = 0;
  const limits = createAccountLimits(() => now);
  for (let index = 0; index < SIGNINS_PER_NAME; index += 1) expect(limits.signInName(`address ${String(index)}`, "odysseus")).toBe(0);
  expect(limits.signInName("one more address", "odysseus")).toBe(SIGNIN_NAME_WINDOW_MS / 1000);
  expect(limits.signInName("one more address", "penelope")).toBe(0);
  now += SIGNIN_NAME_WINDOW_MS;
  expect(limits.signInName("one more address", "odysseus")).toBe(0);
  // At this rate one account gets 1,440 guesses a day.
  expect((24 * 60 * MINUTE_MS / SIGNIN_NAME_WINDOW_MS) * SIGNINS_PER_NAME).toBe(1_440);
});

test("requests with a token: 120 a minute an address, 600 for all strangers, and twenty unknown tokens a minute", () => {
  let now = 0;
  const limits = createAccountLimits(() => now);
  expect(passed(() => limits.request("a"), REQUESTS_PER_ADDRESS + 30)).toBe(REQUESTS_PER_ADDRESS);
  expect(limits.request("a")).toBe(60);
  for (const address of ["b", "c", "d", "e"]) expect(passed(() => limits.request(address), REQUESTS_PER_ADDRESS)).toBe(REQUESTS_PER_ADDRESS);
  expect(REQUESTS_OVERALL).toBe(5 * REQUESTS_PER_ADDRESS);
  expect(limits.request("f")).toBe(60);

  for (let index = 0; index < WRONG_TOKENS_PER_ADDRESS; index += 1) {
    expect(limits.wrongTokenWait("a")).toBe(0);
    limits.wrongTokenCount("a");
  }
  expect(limits.wrongTokenWait("a")).toBe(60);
  expect(limits.wrongTokenWait("b")).toBe(0);
  now += MINUTE_MS;
  expect([limits.wrongTokenWait("a"), limits.request("a"), limits.request("f")]).toEqual([0, 0, 0]);
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

test("the numbers bound what strangers can cost: accounts made, and time spent hashing", () => {
  // Filling the database to its cap takes more than eleven hours at the fastest.
  expect((MAX_ACCOUNTS / SIGNUPS_OVERALL) * SIGNUP_WINDOW_MS).toBeGreaterThan(11 * 60 * MINUTE_MS);
  // Hashes a minute, at about 0.2 s each: under a quarter of one core.
  const hashes = SIGNINS_OVERALL + SIGNUPS_OVERALL / (SIGNUP_WINDOW_MS / MINUTE_MS);
  expect(hashes * 0.2).toBeLessThan(15);
  expect([HASHES_AT_ONCE, HASHES_WAITING]).toEqual([1, 8]);
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
