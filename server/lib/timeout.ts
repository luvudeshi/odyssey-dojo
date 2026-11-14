// Every AI call goes through this, so nothing can leave the game waiting on a spinner.

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${String(ms)} ms`);
    this.name = "TimeoutError";
  }
}

/** Runs `work` with a signal that aborts after `ms`, and rejects with TimeoutError even if `work` ignores the signal. */
export async function withTimeout<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new TimeoutError(ms);
      controller.abort(error);
      reject(error);
    }, ms);
  });
  try {
    return await Promise.race([work(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}
