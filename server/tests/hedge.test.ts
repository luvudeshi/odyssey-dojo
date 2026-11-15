// The hedge: a late or failed first attempt gets exactly one second attempt, the first usable answer wins, and the
// whole thing still ends on time.
import { expect, test } from "vitest";
import { hedged } from "../lib/hedge";
import { TimeoutError } from "../lib/timeout";

interface Call {
  readonly number: number;
  readonly at: number;
  readonly signal: AbortSignal;
}

/** A fake attempt: each call follows the next plan in the list. "never" hangs and ignores its signal. */
type Plan = { readonly after: number; readonly value: string } | { readonly after: number; readonly error: string } | "never";

function attempts(plans: readonly Plan[]): { calls: Call[]; run: (signal: AbortSignal, number: number) => Promise<string> } {
  const started = Date.now();
  const calls: Call[] = [];
  return {
    calls,
    run: (signal, number) => {
      const plan = plans[calls.length];
      calls.push({ number, at: Date.now() - started, signal });
      if (plan === undefined) return Promise.reject(new Error("a third attempt was started"));
      if (plan === "never") return new Promise<string>(() => undefined);
      return new Promise<string>((resolve, reject) => {
        setTimeout(() => {
          if ("value" in plan) resolve(plan.value);
          else reject(new Error(plan.error));
        }, plan.after);
      });
    },
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

test("a first attempt that answers in time is the only one made", async () => {
  const { calls, run } = attempts([{ after: 20, value: "first" }]);
  expect(await hedged({ totalMs: 1000, hedgeAfterMs: 200 }, run)).toEqual({ value: "first", attempt: 1 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(calls).toHaveLength(1);
});

test("a slow first attempt gets a second one, and the second's answer comes after the wait plus its own time", async () => {
  const seconds: string[] = [];
  const { calls, run } = attempts(["never", { after: 60, value: "second" }]);
  const started = Date.now();
  const answer = await hedged({ totalMs: 2000, hedgeAfterMs: 200, onSecond: (why) => { seconds.push(why); } }, run);
  const took = Date.now() - started;
  expect(answer).toEqual({ value: "second", attempt: 2 });
  expect(took).toBeGreaterThanOrEqual(250);
  expect(took).toBeLessThan(900);
  expect(calls.map((call) => call.number)).toEqual([1, 2]);
  expect(calls[1]?.at).toBeGreaterThanOrEqual(195);
  expect(seconds).toEqual(["slow"]);
  // The loser is cancelled as soon as the winner answers.
  expect(calls[0]?.signal.aborted).toBe(true);
});

test("a first attempt that answers after the second has started still wins if it is first, and the second is cancelled", async () => {
  const { calls, run } = attempts([{ after: 150, value: "first" }, "never"]);
  expect(await hedged({ totalMs: 2000, hedgeAfterMs: 50 }, run)).toEqual({ value: "first", attempt: 1 });
  expect(calls).toHaveLength(2);
  expect(calls[1]?.signal.aborted).toBe(true);
});

test("two attempts that never answer end in a timeout at the limit, with both cancelled and no third", async () => {
  const { calls, run } = attempts(["never", "never"]);
  const started = Date.now();
  await expect(hedged({ totalMs: 300, hedgeAfterMs: 100 }, run)).rejects.toBeInstanceOf(TimeoutError);
  const took = Date.now() - started;
  expect(took).toBeGreaterThanOrEqual(295);
  expect(took).toBeLessThan(900);
  expect(calls).toHaveLength(2);
  expect(calls.every((call) => call.signal.aborted)).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(calls).toHaveLength(2);
});

test("a first attempt that fails fast is tried again at once, not after the wait", async () => {
  const seconds: string[] = [];
  const failures: string[] = [];
  const { calls, run } = attempts([{ after: 10, error: "boom" }, { after: 10, value: "second" }]);
  const started = Date.now();
  const answer = await hedged({
    totalMs: 5000,
    hedgeAfterMs: 2000,
    onSecond: (why) => { seconds.push(why); },
    onFailure: (error, attempt) => { failures.push(`${String(attempt)}:${error instanceof Error ? error.message : "?"}`); },
  }, run);
  expect(answer).toEqual({ value: "second", attempt: 2 });
  expect(Date.now() - started).toBeLessThan(600);
  expect(seconds).toEqual(["failed"]);
  expect(failures).toEqual(["1:boom"]);
  // The wait was dropped when the retry began: no third attempt turns up later.
  await settle();
  expect(calls).toHaveLength(2);
});

test("two attempts that fail reject with the last failure, quickly, and there is no third", async () => {
  const failures: number[] = [];
  const { calls, run } = attempts([{ after: 5, error: "first boom" }, { after: 5, error: "second boom" }]);
  const started = Date.now();
  await expect(hedged({ totalMs: 5000, hedgeAfterMs: 2000, onFailure: (_error, attempt) => { failures.push(attempt); } }, run))
    .rejects.toThrow("second boom");
  expect(Date.now() - started).toBeLessThan(600);
  expect(failures).toEqual([1, 2]);
  await settle();
  expect(calls).toHaveLength(2);
});

test("a first attempt that fails after the second has started waits for the second, which may still answer", async () => {
  const good = attempts([{ after: 120, error: "late boom" }, { after: 150, value: "second" }]);
  expect(await hedged({ totalMs: 2000, hedgeAfterMs: 40 }, good.run)).toEqual({ value: "second", attempt: 2 });
  expect(good.calls).toHaveLength(2);

  const bad = attempts([{ after: 120, error: "late boom" }, { after: 150, error: "second boom" }]);
  await expect(hedged({ totalMs: 2000, hedgeAfterMs: 40 }, bad.run)).rejects.toThrow("second boom");
  expect(bad.calls).toHaveLength(2);
});

test("with no wait set a slow first attempt is left alone, and a failed one is still tried again", async () => {
  const slow = attempts(["never"]);
  await expect(hedged({ totalMs: 150 }, slow.run)).rejects.toBeInstanceOf(TimeoutError);
  expect(slow.calls).toHaveLength(1);

  const failed = attempts([{ after: 5, error: "boom" }, { after: 5, value: "second" }]);
  expect(await hedged({ totalMs: 1000 }, failed.run)).toEqual({ value: "second", attempt: 2 });
});

test("an attempt that throws before it returns a promise counts as a failure, and a cancelled attempt is not reported", async () => {
  const failures: number[] = [];
  let made = 0;
  const answer = await hedged({ totalMs: 1000, hedgeAfterMs: 500, onFailure: (_error, attempt) => { failures.push(attempt); } }, () => {
    made += 1;
    if (made === 1) throw new Error("thrown at once");
    return new Promise<string>((resolve) => { setTimeout(() => { resolve("second"); }, 10); });
  });
  expect(answer).toEqual({ value: "second", attempt: 2 });
  expect(failures).toEqual([1]);

  // The loser rejects when it is cancelled. That is not a failure anyone needs to hear about.
  const cancelled: number[] = [];
  const result = await hedged({ totalMs: 1000, hedgeAfterMs: 30, onFailure: (_error, attempt) => { cancelled.push(attempt); } }, (signal, number) =>
    number === 2
      ? new Promise<string>((resolve) => { setTimeout(() => { resolve("second"); }, 30); })
      : new Promise<string>((_resolve, reject) => { signal.addEventListener("abort", () => { reject(new Error("aborted")); }); }));
  expect(result.attempt).toBe(2);
  await settle();
  expect(cancelled).toEqual([]);
});
