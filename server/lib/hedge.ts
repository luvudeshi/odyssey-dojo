// One slow answer must not cost the player a feature. `hedged` runs an attempt and starts a second, identical one
// when the first is late or has failed, then takes whichever answers first and cancels the other.
// There are never more than two attempts, and the whole thing gives up at a fixed time whatever they do.
import { withTimeout } from "./timeout";

const MAX_ATTEMPTS = 2;

export interface HedgeOptions {
  /** Everything is given up this long after the first attempt began. */
  readonly totalMs: number;
  /** A first attempt with no answer after this long gets a second one beside it. Left out: only a failed first attempt is tried again. */
  readonly hedgeAfterMs?: number | undefined;
  /** Told when the second attempt starts: the first was "slow", or it "failed". */
  readonly onSecond?: (why: "slow" | "failed") => void;
  /** Told of each attempt that failed by itself. An attempt that was cancelled is not a failure. */
  readonly onFailure?: (error: unknown, attempt: number) => void;
  /** Asked when the first attempt fails with nothing else running: false means a second attempt would fail the same way, so none is made. Left out: always try again. */
  readonly retry?: (error: unknown) => boolean;
}

export interface Hedged<T> {
  readonly value: T;
  /** Which attempt answered: 1 or 2. */
  readonly attempt: number;
}

/**
 * Resolves with the first attempt that resolves. Rejects with the last failure once both attempts have failed
 * (or the first has failed and `retry` says not to try again), or with TimeoutError at `totalMs`. An attempt should throw on an answer it cannot use, so that the other one is waited for.
 * Each attempt gets its own signal, aborted as soon as it is no longer needed.
 */
export async function hedged<T>(
  options: HedgeOptions,
  attempt: (signal: AbortSignal, number: number) => Promise<T>,
): Promise<Hedged<T>> {
  const running: AbortController[] = [];
  let late: ReturnType<typeof setTimeout> | undefined;
  try {
    return await withTimeout(options.totalMs, (deadline) => new Promise<Hedged<T>>((resolve, reject) => {
      let failed = 0;
      const start = (why: "first" | "slow" | "failed"): void => {
        if (deadline.aborted || running.length >= MAX_ATTEMPTS) return;
        clearTimeout(late);
        const controller = new AbortController();
        const number = running.push(controller);
        if (why !== "first") options.onSecond?.(why);
        // Inside a then, so an attempt that throws before it returns a promise fails like any other.
        Promise.resolve().then(() => attempt(controller.signal, number)).then(
          (value) => { resolve({ value, attempt: number }); },
          (error: unknown) => {
            if (controller.signal.aborted) return;
            options.onFailure?.(error, number);
            failed += 1;
            // An attempt still running is waited for. With none, give up after two, or after one that is not worth repeating.
            const over = failed === running.length && (failed === MAX_ATTEMPTS || options.retry?.(error) === false);
            if (over) reject(error instanceof Error ? error : new Error(String(error)));
            else start("failed");
          },
        );
      };
      start("first");
      if (options.hedgeAfterMs !== undefined) late = setTimeout(() => { start("slow"); }, options.hedgeAfterMs);
    }));
  } finally {
    clearTimeout(late);
    for (const controller of running) controller.abort(new Error("no longer needed"));
  }
}
